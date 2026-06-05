package com.shoeshop.orders.telemetry;

import io.nats.client.impl.Headers;
import io.opentelemetry.api.GlobalOpenTelemetry;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.api.trace.Tracer;
import io.opentelemetry.context.Context;
import io.opentelemetry.context.propagation.TextMapGetter;
import io.opentelemetry.context.propagation.TextMapSetter;

/**
 * The Java side of the reusable NATS+OTel trace-propagation spine (ADR-0003 §5),
 * mirroring Inventory's Go {@code telemetry/nats.go}: carry the W3C traceparent
 * across NATS messages so an asynchronous checkout saga stays a SINGLE correlated
 * trace across services.
 *
 * <p>On publish, inject the active context into the message HEADERS; on consume,
 * extract it and start a CONSUMER-kind span as the producer's child, then run the
 * handler inside it so every JDBC span / log / event / metric carries the saga's
 * trace_id. The OpenTelemetry SDK is supplied by the -javaagent; here we only use
 * the API via {@link GlobalOpenTelemetry}.
 */
public final class NatsTracing {

    /** Instrumentation scope for Orders' own spans/logs/events (ARCHITECTURE §9). */
    public static final String SCOPE = "shoeshop/orders";

    private static final TextMapSetter<Headers> SETTER =
            (carrier, key, value) -> carrier.put(key, value);

    private static final TextMapGetter<Headers> GETTER = new TextMapGetter<>() {
        @Override
        public Iterable<String> keys(Headers carrier) {
            return carrier == null ? java.util.List.of() : carrier.keySet();
        }

        @Override
        public String get(Headers carrier, String key) {
            return (carrier == null || !carrier.containsKey(key)) ? null : carrier.getFirst(key);
        }
    };

    private NatsTracing() {}

    private static Tracer tracer() {
        return GlobalOpenTelemetry.getTracer(SCOPE);
    }

    /** Inject the active context into the message headers before publishing. */
    public static void inject(Context ctx, Headers headers) {
        GlobalOpenTelemetry.getPropagators().getTextMapPropagator().inject(ctx, headers, SETTER);
    }

    /** Extract the producer's context from message headers (root if absent). */
    public static Context extract(Headers headers) {
        return GlobalOpenTelemetry.getPropagators().getTextMapPropagator()
                .extract(Context.root(), headers, GETTER);
    }

    /**
     * Start a CONSUMER-kind span "consume &lt;subject&gt;" parented to the producer
     * span carried in the message headers. The caller must {@code makeCurrent()} and
     * {@code end()} the span (see {@link #startConsume}).
     */
    public static Span consumeSpan(Headers headers, String subject) {
        return tracer().spanBuilder("consume " + subject)
                .setSpanKind(SpanKind.CONSUMER)
                .setParent(extract(headers))
                .setAttribute("messaging.system", "nats")
                .setAttribute("messaging.operation", "receive")
                .setAttribute("messaging.destination.name", subject)
                .startSpan();
    }

    /**
     * Start a PRODUCER-kind span "publish &lt;subject&gt;" for an outbound saga
     * message, as a child of the active context.
     */
    public static Span publishSpan(String subject) {
        return tracer().spanBuilder("publish " + subject)
                .setSpanKind(SpanKind.PRODUCER)
                .setAttribute("messaging.system", "nats")
                .setAttribute("messaging.operation", "publish")
                .setAttribute("messaging.destination.name", subject)
                .startSpan();
    }
}
