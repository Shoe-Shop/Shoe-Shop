// Package telemetry wires the inventory service's four correlated OpenTelemetry
// signals — Metrics, Events, Logs, Traces (MELT) — over OTLP/gRPC. It mirrors the
// reference Catalogue bootstrap (ADR-0002 / ARCHITECTURE.md §9): all exporters
// read the standard OTEL_* environment variables, and the four signals share one
// resource so every record agrees on service.namespace, service.name and
// deployment.environment, and in-request logs/metrics/events carry the active
// trace_id — the join keys in docs/dataset/correlation-contract.md.
//
// Inventory adds one thing beyond the Catalogue reference: trace-context
// propagation over NATS (nats.go), so the async checkout saga stays a single
// correlated trace across services (ADR-0003 §5). See nats.go in this package.
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
	"google.golang.org/grpc"
)

// Telemetry is the wired four-signal stack handed back to main: a trace-aware
// logger, a gRPC interceptor that records RED metrics with exemplars, and a
// single shutdown that flushes all three providers.
type Telemetry struct {
	// Logger fans out to stdout (container logs) and to OTLP logs (Loki),
	// stamping trace_id/span_id on any record emitted with a request context.
	Logger *slog.Logger
	// UnaryInterceptor records the RED latency histogram + request counter,
	// with trace_id exemplars on the histogram.
	UnaryInterceptor grpc.UnaryServerInterceptor
	// Shutdown flushes pending traces, metrics and logs.
	Shutdown func(context.Context) error
}

// Setup installs global tracer, meter and logger providers exporting over
// OTLP/gRPC, all sharing one resource. The composite text-map propagator
// (TraceContext + Baggage) is also what the NATS helpers use to carry trace
// context across saga messages. Returns the wired Telemetry, or an error if any
// exporter or provider fails to initialize.
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

	interceptor, err := newMetricsInterceptor()
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
		Logger:           newLogger(lp),
		UnaryInterceptor: interceptor,
		Shutdown:         shutdown,
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
