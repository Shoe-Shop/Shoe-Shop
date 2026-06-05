package com.shoeshop.orders.telemetry;

import io.opentelemetry.api.GlobalOpenTelemetry;
import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.common.Attributes;
import io.opentelemetry.api.logs.Logger;
import io.opentelemetry.context.Context;

/**
 * Emits domain/lifecycle <b>Events</b> (the "E" in MELT) via the OpenTelemetry
 * <i>stable</i> Logs API. The event name is set as the log record body (and an
 * {@code event.name} attribute), so events are told apart from plain logs by that
 * name in the Loki body — the same observable convention as the Go/Python/Node
 * services (ARCHITECTURE §9). Emitted with the current context, so each event
 * carries the saga's trace_id/span_id and joins the saga trace.
 *
 * <p><b>Per-stack note:</b> the formal OTLP {@code EventName} field lives only in
 * OTel-Java's unstable incubator API (verified absent from the stable
 * {@code ExtendedLogRecordBuilder} in 1.45), so Java uses body + attribute — the
 * documented per-stack divergence, identical join behaviour. The LoggerProvider is
 * the agent-installed SDK, exported over OTLP to Loki.
 */
public final class Events {

    private static final AttributeKey<String> EVENT_NAME = AttributeKey.stringKey("event.name");

    private Events() {}

    private static Logger logger() {
        return GlobalOpenTelemetry.get().getLogsBridge().get(NatsTracing.SCOPE);
    }

    /** Emit a domain event with the given name and attributes, in the active trace. */
    public static void emit(String name, Attributes attrs) {
        Attributes all = attrs.toBuilder().put(EVENT_NAME, name).build();
        logger().logRecordBuilder()
                .setBody(name)
                .setAllAttributes(all)
                .setContext(Context.current())
                .emit();
    }
}
