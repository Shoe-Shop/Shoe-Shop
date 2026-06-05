package com.shoeshop.orders.saga;

import java.time.Instant;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.shoeshop.orders.telemetry.NatsTracing;

import io.nats.client.JetStream;
import io.nats.client.api.PublishAck;
import io.nats.client.impl.Headers;
import io.nats.client.impl.NatsMessage;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.context.Context;
import io.opentelemetry.context.Scope;

/**
 * Publishes saga commands/events to JetStream using the shared JSON envelope
 * (ADR-0003 §4), with the W3C traceparent injected into NATS headers (never the
 * body) so the whole saga is one correlated trace. Each publish is a PRODUCER
 * span, child of the work that produced it.
 */
@Component
public class SagaMessaging {

    private final JetStream js;
    private final ObjectMapper mapper;

    public SagaMessaging(JetStream js, ObjectMapper mapper) {
        this.js = js;
        this.mapper = mapper;
    }

    /** A fresh JSON object to populate as a message's {@code data} payload. */
    public ObjectNode data() {
        return mapper.createObjectNode();
    }

    /**
     * Publish {@code data} on {@code subject} for {@code orderId}, wrapped in the
     * ADR-0003 envelope, injecting the active trace context into the headers.
     */
    public PublishAck publish(String subject, String orderId, JsonNode data) {
        ObjectNode env = mapper.createObjectNode();
        env.put("event_id", UUID.randomUUID().toString());
        env.put("type", subject);
        env.put("occurred_at", Instant.now().toString());
        env.put("order_id", orderId);
        env.set("data", data);

        Span span = NatsTracing.publishSpan(subject);
        try (Scope scope = span.makeCurrent()) {
            byte[] body = mapper.writeValueAsBytes(env);
            Headers headers = new Headers();
            NatsTracing.inject(Context.current(), headers);
            NatsMessage msg = NatsMessage.builder().subject(subject).headers(headers).data(body).build();
            return js.publish(msg);
        } catch (Exception e) {
            span.recordException(e);
            span.setStatus(StatusCode.ERROR, e.getMessage());
            throw new IllegalStateException("publish " + subject + " failed", e);
        } finally {
            span.end();
        }
    }
}
