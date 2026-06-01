package telemetry

import (
	"context"
	"time"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/log"
	"go.opentelemetry.io/otel/log/global"
)

// Event emits a domain/lifecycle event through the OTel Logs API — a log record
// carrying an EventName (e.g. "catalogue.product.viewed"). Emitting with the
// request context lets the SDK stamp the active trace_id/span_id, so events join
// to their trace exactly like logs do (correlation contract, §"Events").
//
// This is the four-signal "E": real domain events get richer with the v0.3 NATS
// write path, but lifecycle/read events are emitted from the handlers today.
func Event(ctx context.Context, name string, attrs ...attribute.KeyValue) {
	var r log.Record
	r.SetTimestamp(time.Now())
	r.SetEventName(name)
	r.SetSeverity(log.SeverityInfo)
	r.SetBody(log.StringValue(name))
	r.AddAttributes(toLogAttrs(attrs)...)

	global.GetLoggerProvider().Logger(scopeName).Emit(ctx, r)
}

// toLogAttrs converts the trace/metric attribute.KeyValue type used elsewhere in
// the service into the Logs API's log.KeyValue, so callers use one attribute
// vocabulary across all four signals.
func toLogAttrs(attrs []attribute.KeyValue) []log.KeyValue {
	out := make([]log.KeyValue, 0, len(attrs))
	for _, a := range attrs {
		out = append(out, log.KeyValue{
			Key:   string(a.Key),
			Value: toLogValue(a.Value),
		})
	}
	return out
}

func toLogValue(v attribute.Value) log.Value {
	switch v.Type() {
	case attribute.BOOL:
		return log.BoolValue(v.AsBool())
	case attribute.INT64:
		return log.Int64Value(v.AsInt64())
	case attribute.FLOAT64:
		return log.Float64Value(v.AsFloat64())
	case attribute.STRING:
		return log.StringValue(v.AsString())
	default:
		// Slices and any future kinds fall back to their string encoding.
		return log.StringValue(v.Emit())
	}
}
