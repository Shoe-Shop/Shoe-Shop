package telemetry

import (
	"context"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
)

// scopeName is the instrumentation scope for the notification's own meter, logger
// and events. The convention across every Shoe Shop service is `shoeshop/<svc>`
// (ARCHITECTURE.md §9): events are told apart from logs by the OTel eventName, not
// by scope. The NATS consume span, logs and events all share this scope.
const scopeName = "shoeshop/notification"

// MessageMetrics is the app-level RED for consumed saga events. Notification has no
// RPC surface, so "requests" here are JetStream messages processed: rate + errors
// come from a counter keyed by subject and result; duration is a histogram (in
// seconds). Recording with the consume span's context lets the SDK attach a
// native trace_id exemplar to the histogram (Go emits these — no JS/Rust gap), the
// metric↔trace join of the correlation contract.
type MessageMetrics struct {
	processed metric.Int64Counter
	duration  metric.Float64Histogram
}

// newMessageMetrics builds the RED instruments for consumed messages.
func newMessageMetrics() (*MessageMetrics, error) {
	meter := otel.Meter(scopeName)

	processed, err := meter.Int64Counter(
		"notification.messages",
		metric.WithDescription("Count of consumed saga lifecycle messages by subject and result."),
	)
	if err != nil {
		return nil, err
	}

	duration, err := meter.Float64Histogram(
		"notification.process.duration",
		metric.WithUnit("s"),
		metric.WithDescription("Duration of processing a consumed saga message, in seconds."),
		metric.WithExplicitBucketBoundaries(
			0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5,
		),
	)
	if err != nil {
		return nil, err
	}

	return &MessageMetrics{processed: processed, duration: duration}, nil
}

// Record observes one processed message. result is "sent" (a notice was emitted),
// "ignored" (unexpected subject) or "error" (the message could not be handled).
// Pass the consume span's ctx so the histogram exemplar carries the saga trace_id.
func (m *MessageMetrics) Record(ctx context.Context, subject, result string, dur time.Duration) {
	attrs := metric.WithAttributes(
		attribute.String("subject", subject),
		attribute.String("result", result),
	)
	m.duration.Record(ctx, dur.Seconds(), attrs)
	m.processed.Add(ctx, 1, attrs)
}
