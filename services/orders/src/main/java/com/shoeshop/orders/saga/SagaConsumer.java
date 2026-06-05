package com.shoeshop.orders.saga;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shoeshop.orders.telemetry.NatsTracing;

import io.nats.client.Connection;
import io.nats.client.ConsumerContext;
import io.nats.client.JetStreamManagement;
import io.nats.client.Message;
import io.nats.client.MessageConsumer;
import io.nats.client.StreamContext;
import io.nats.client.api.AckPolicy;
import io.nats.client.api.ConsumerConfiguration;
import io.nats.client.api.RetentionPolicy;
import io.nats.client.api.StorageType;
import io.nats.client.api.StreamConfiguration;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.context.Scope;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;

/**
 * The Orders side of the JetStream saga: ensures the three streams exist, then runs
 * durable consumers on the INVENTORY and PAYMENT streams for the reply events the
 * orchestrator awaits. Each delivery opens a CONSUMER span continuing the saga's
 * trace (via the message's traceparent header), dispatches to
 * {@link SagaOrchestrator}, and acks; transient failures are nak'd for bounded
 * redelivery, undecodable messages are terminated (a dead-letter / observable
 * failure rather than an infinite loop — ADR-0003 §3).
 */
@Component
public class SagaConsumer {

    private static final Logger log = LoggerFactory.getLogger(SagaConsumer.class);

    private final Connection nc;
    private final JetStreamManagement jsm;
    private final ObjectMapper mapper;
    private final SagaOrchestrator orchestrator;
    private final List<MessageConsumer> consumers = new ArrayList<>();

    public SagaConsumer(Connection nc, JetStreamManagement jsm, ObjectMapper mapper,
                        SagaOrchestrator orchestrator) {
        this.nc = nc;
        this.jsm = jsm;
        this.mapper = mapper;
        this.orchestrator = orchestrator;
    }

    @PostConstruct
    public void start() throws Exception {
        // Orders OWNS the ORDERS stream; INVENTORY/PAYMENT may already be created by
        // their owning services — ensure (idempotent) with matching config.
        ensureStream(Subjects.STREAM_ORDERS, "orders.>");
        ensureStream(Subjects.STREAM_INVENTORY, "inventory.>");
        ensureStream(Subjects.STREAM_PAYMENT, "payment.>");

        consumers.add(consume(Subjects.STREAM_INVENTORY, "orders-inventory-replies",
                Subjects.INVENTORY_RESERVED, Subjects.INVENTORY_REJECTED));
        consumers.add(consume(Subjects.STREAM_PAYMENT, "orders-payment-replies",
                Subjects.PAYMENT_AUTHORIZED, Subjects.PAYMENT_DECLINED));
        log.info("orders saga consumers started (INVENTORY + PAYMENT reply streams)");
    }

    @PreDestroy
    public void stop() {
        for (MessageConsumer mc : consumers) {
            try {
                mc.stop();
            } catch (Exception e) {
                log.warn("error stopping consumer: {}", e.getMessage());
            }
        }
    }

    private void ensureStream(String name, String subjects) throws Exception {
        StreamConfiguration cfg = StreamConfiguration.builder()
                .name(name)
                .subjects(subjects)
                .storageType(StorageType.File)
                .retentionPolicy(RetentionPolicy.Limits)
                .build();
        try {
            jsm.addStream(cfg);
            log.info("created JetStream stream {} ({})", name, subjects);
        } catch (Exception e) {
            // Already exists (possibly owned by another service) — leave it as-is.
            log.info("JetStream stream {} already present", name);
        }
    }

    private MessageConsumer consume(String stream, String durable, String... filterSubjects)
            throws Exception {
        StreamContext sc = nc.getStreamContext(stream);
        ConsumerConfiguration cc = ConsumerConfiguration.builder()
                .durable(durable)
                .filterSubjects(filterSubjects)
                .ackPolicy(AckPolicy.Explicit)
                .maxDeliver(5)
                .build();
        ConsumerContext cctx = sc.createOrUpdateConsumer(cc);
        return cctx.consume(this::handle);
    }

    private void handle(Message msg) {
        Span span = NatsTracing.consumeSpan(msg.getHeaders(), msg.getSubject());
        try (Scope scope = span.makeCurrent()) {
            UUID orderId;
            String subject = msg.getSubject();
            JsonNode data;
            try {
                JsonNode env = mapper.readTree(msg.getData());
                orderId = UUID.fromString(env.path("order_id").asText());
                data = env.path("data");
            } catch (Exception parse) {
                // Will never decode — terminate (no redelivery) and record.
                log.error("undecodable saga reply on {}; terminating: {}", msg.getSubject(),
                        parse.getMessage());
                span.recordException(parse);
                span.setStatus(StatusCode.ERROR, "bad envelope");
                msg.term();
                return;
            }
            span.setAttribute("order.id", orderId.toString());
            span.setAttribute("saga.subject", subject);

            switch (subject) {
                case Subjects.INVENTORY_RESERVED -> orchestrator.onInventoryReserved(orderId);
                case Subjects.INVENTORY_REJECTED ->
                        orchestrator.onInventoryRejected(orderId, data.path("reason").asText("unknown"));
                case Subjects.PAYMENT_AUTHORIZED -> orchestrator.onPaymentAuthorized(orderId);
                case Subjects.PAYMENT_DECLINED ->
                        orchestrator.onPaymentDeclined(orderId, data.path("reason").asText("unknown"));
                default -> log.warn("unexpected saga subject {}; acking", subject);
            }
            msg.ack();
        } catch (Exception e) {
            // Transient/internal failure — nak for bounded redelivery.
            log.error("saga handler failed on {}: {}", msg.getSubject(), e.getMessage(), e);
            span.recordException(e);
            span.setStatus(StatusCode.ERROR, e.getMessage());
            msg.nak();
        } finally {
            span.end();
        }
    }
}
