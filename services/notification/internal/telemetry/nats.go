package telemetry

import (
	"context"

	"github.com/nats-io/nats.go"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

// This is the CONSUME side of the reusable NATS+OTel trace-propagation spine
// (ADR-0003 §5; inventory/internal/telemetry/nats.go is the full Go reference that
// also covers publishing). Notification is a PURE subscriber — it never publishes
// to NATS — so it needs only to continue an incoming trace, not to inject one.
//
// The shape: on consume, extract the producer's traceparent from the message
// HEADERS and start a CONSUMER-kind span as the producer's child, so every
// log/event/metric in the handler carries the saga's trace_id and the notification
// is part of the same checkout trace.

// natsHeaderCarrier adapts nats.Header to the OTel TextMapCarrier interface.
type natsHeaderCarrier nats.Header

func (c natsHeaderCarrier) Get(key string) string { return nats.Header(c).Get(key) }
func (c natsHeaderCarrier) Set(key, value string) { nats.Header(c).Set(key, value) }
func (c natsHeaderCarrier) Keys() []string {
	keys := make([]string, 0, len(c))
	for k := range c {
		keys = append(keys, k)
	}
	return keys
}

// StartConsumeSpan extracts the producer's trace context from the message headers
// and starts a CONSUMER-kind span named "consume <subject>", parented to the
// producer span. The returned context carries the span so the handler's logs,
// events and metrics all join the saga trace. The caller must End the span.
func StartConsumeSpan(hdr nats.Header, subject string) (context.Context, trace.Span) {
	parent := otel.GetTextMapPropagator().Extract(context.Background(), natsHeaderCarrier(hdr))
	return otel.Tracer(scopeName).Start(parent, "consume "+subject,
		trace.WithSpanKind(trace.SpanKindConsumer),
		trace.WithAttributes(
			attribute.String("messaging.system", "nats"),
			attribute.String("messaging.operation", "receive"),
			attribute.String("messaging.destination.name", subject),
		),
	)
}
