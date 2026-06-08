// Package telemetry wires the notification service's four correlated OpenTelemetry
// signals — Metrics, Events, Logs, Traces (MELT) — over OTLP/gRPC. It mirrors the
// reference Catalogue/Inventory bootstrap (ADR-0002 / ARCHITECTURE.md §9): all
// exporters read the standard OTEL_* environment variables, and the four signals
// share one resource so every record agrees on service.namespace, service.name and
// deployment.environment, and in-request logs/metrics/events carry the active
// trace_id — the join keys in docs/dataset/correlation-contract.md.
//
// Notification is a PURE NATS subscriber, so it differs from Inventory in two ways:
// there is no gRPC RED interceptor (RED is over consumed saga messages — see
// metrics.go), and the NATS spine carries only the CONSUME side (nats.go) — it
// publishes nothing back. Trace context rides the NATS message headers so each
// notification joins the one checkout saga trace (ADR-0003 §5).
package telemetry

import (
	"context"
	"errors"
	"log/slog"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploggrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	otellog "go.opentelemetry.io/otel/log/global"
	"go.opentelemetry.io/otel/propagation"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/exemplar"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
)

// Telemetry is the wired four-signal stack handed back to main: a trace-aware
// logger, the app-level message RED recorder, and a single shutdown that flushes
// all three providers.
type Telemetry struct {
	// Logger fans out to stdout (container logs) and to OTLP logs (Loki),
	// stamping trace_id/span_id on any record emitted with a request/consume context.
	Logger *slog.Logger
	// Messages records RED for consumed saga messages, with native trace_id
	// exemplars on the histogram (Go emits these natively — no JS/Rust gap).
	Messages *MessageMetrics
	// Shutdown flushes pending traces, metrics and logs.
	Shutdown func(context.Context) error
}

// Setup installs global tracer, meter and logger providers exporting over
// OTLP/gRPC, all sharing one resource. The composite text-map propagator
// (TraceContext + Baggage) is also what the NATS helper uses to extract trace
// context from incoming saga messages. Returns the wired Telemetry, or an error if
// any exporter or provider fails to initialize.
func Setup(ctx context.Context, serviceName string) (*Telemetry, error) {
	res, err := newResource(ctx, serviceName)
	if err != nil {
		return nil, err
	}

	// ── Traces ──────────────────────────────────────────────────────
	traceExp, err := otlptracegrpc.New(ctx)
	if err != nil {
		return nil, err
	}
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(traceExp),
		sdktrace.WithResource(res),
	)
	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	// ── Metrics ─────────────────────────────────────────────────────
	// TraceBased exemplar filter: sampled measurements attach an exemplar
	// carrying the active trace_id, linking a metric spike to a trace.
	metricExp, err := otlpmetricgrpc.New(ctx)
	if err != nil {
		return nil, err
	}
	mp := sdkmetric.NewMeterProvider(
		sdkmetric.WithResource(res),
		sdkmetric.WithReader(sdkmetric.NewPeriodicReader(metricExp)),
		sdkmetric.WithExemplarFilter(exemplar.TraceBasedFilter),
	)
	otel.SetMeterProvider(mp)

	messages, err := newMessageMetrics()
	if err != nil {
		return nil, err
	}

	// ── Logs + Events ───────────────────────────────────────────────
	// Both flow through one LoggerProvider: structured logs via the slog
	// bridge, domain events via the Logs API (records with an EventName).
	logExp, err := otlploggrpc.New(ctx)
	if err != nil {
		return nil, err
	}
	lp := sdklog.NewLoggerProvider(
		sdklog.WithResource(res),
		sdklog.WithProcessor(sdklog.NewBatchProcessor(logExp)),
	)
	otellog.SetLoggerProvider(lp)

	shutdown := func(ctx context.Context) error {
		return errors.Join(tp.Shutdown(ctx), mp.Shutdown(ctx), lp.Shutdown(ctx))
	}

	return &Telemetry{
		Logger:   newLogger(lp),
		Messages: messages,
		Shutdown: shutdown,
	}, nil
}

// newResource builds the resource shared by all four signals. service.namespace
// and deployment.environment arrive from OTEL_RESOURCE_ATTRIBUTES via
// WithFromEnv; service.name is pinned explicitly.
func newResource(ctx context.Context, serviceName string) (*resource.Resource, error) {
	return resource.New(ctx,
		resource.WithFromEnv(),
		resource.WithTelemetrySDK(),
		resource.WithAttributes(semconv.ServiceName(serviceName)),
	)
}
