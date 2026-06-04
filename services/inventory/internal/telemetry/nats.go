package telemetry

import (
	"context"

	"github.com/nats-io/nats.go"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

// This file is the reusable NATS+OTel trace-propagation spine (ADR-0003 §5): it
// carries the W3C traceparent across NATS messages so an asynchronous checkout
// saga stays a SINGLE correlated trace across services. Built here first on the
// proven Go stack; Orders / Payment / Notification mirror it in their stacks.
//
// The shape: on publish, inject the active span context into the message
// HEADERS; on consume, extract it and start a CONSUMER-kind span as the
// producer's child, so every log/event/metric in the handler carries the saga's
// trace_id.

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

// InjectTrace writes the active span context from ctx into the message headers,
// so a downstream consumer can continue the same trace. Call it just before
// publishing a saga message.
func InjectTrace(ctx context.Context, msg *nats.Msg) {
	if msg.Header == nil {
		msg.Header = nats.Header{}
	}
	otel.GetTextMapPropagator().Inject(ctx, natsHeaderCarrier(msg.Header))
}

// StartConsumeSpan extracts the producer's trace context from the message headers
// and starts a CONSUMER-kind span named "consume <subject>", parented to the
// producer span. The returned context carries the span so the saga handler's
// logs, events and metrics all join the saga trace. The caller must End the span.
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

// StartPublishSpan starts a PRODUCER-kind span named "publish <subject>" for an
// outbound saga message and returns the context to inject + the span to End. Used
// when a handler emits a reply/command so the publish is a child span of the work
// that produced it (and the injected headers carry that span's context).
func StartPublishSpan(ctx context.Context, subject string) (context.Context, trace.Span) {
	return otel.Tracer(scopeName).Start(ctx, "publish "+subject,
		trace.WithSpanKind(trace.SpanKindProducer),
		trace.WithAttributes(
			attribute.String("messaging.system", "nats"),
			attribute.String("messaging.operation", "publish"),
			attribute.String("messaging.destination.name", subject),
		),
	)
}
