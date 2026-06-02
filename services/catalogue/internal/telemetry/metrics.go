package telemetry

import (
	"context"
	"strings"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
	"google.golang.org/grpc"
	"google.golang.org/grpc/status"
)

// scopeName is the instrumentation scope for the catalogue's own meter, logger
// and events — distinct from the otelgrpc/otelpgx instrumentation scopes. The
// convention across every Shoe Shop service is `shoeshop/<svc>` (ARCHITECTURE.md
// §9): events are told apart from logs by the OTel eventName, not by scope.
const scopeName = "shoeshop/catalogue"

// healthServicePrefix matches the standard gRPC health-checking service. Health
// probes (the container healthcheck hits this every few seconds) are excluded
// from RED metrics and from traces so they don't inflate the dataset — parity
// with cart/bff/users, whose health surface is HTTP and never enters RED.
const healthServicePrefix = "/grpc.health.v1.Health/"

// IsHealthMethod reports whether a gRPC full method belongs to the health
// service. Used both by the RED interceptor (skip recording) and by the otelgrpc
// trace filter in main (skip the span, and thus the derived span-metrics).
func IsHealthMethod(fullMethod string) bool {
	return strings.HasPrefix(fullMethod, healthServicePrefix)
}

// newMetricsInterceptor builds the RED instruments and returns a unary server
// interceptor that records them per RPC. The catalogue owns these metrics
// directly (otelgrpc's built-in metrics are disabled in main with a no-op meter
// provider) so the latency histogram has controlled buckets and reliably carries
// trace_id exemplars from the in-flight server span.
//
// RED: rate and errors come from rpc.server.requests (a counter keyed by method
// and status_code); duration is rpc.server.duration (a histogram, in seconds).
func newMetricsInterceptor() (grpc.UnaryServerInterceptor, error) {
	meter := otel.Meter(scopeName)

	duration, err := meter.Float64Histogram(
		"rpc.server.duration",
		metric.WithUnit("s"),
		metric.WithDescription("Duration of inbound gRPC unary calls, in seconds."),
		metric.WithExplicitBucketBoundaries(
			0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5,
		),
	)
	if err != nil {
		return nil, err
	}

	requests, err := meter.Int64Counter(
		"rpc.server.requests",
		metric.WithDescription("Count of inbound gRPC unary calls by method and gRPC status code."),
	)
	if err != nil {
		return nil, err
	}

	return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		// Health probes are excluded from RED so the dataset's rate/error series
		// reflect real product traffic only (parity with cart/bff/users).
		if IsHealthMethod(info.FullMethod) {
			return handler(ctx, req)
		}
		start := time.Now()
		resp, err := handler(ctx, req)

		// info.FullMethod is "/catalogue.v1.CatalogueService/GetProduct".
		attrs := metric.WithAttributes(
			attribute.String("rpc.method", info.FullMethod),
			attribute.String("rpc.grpc.status_code", status.Code(err).String()),
		)
		// Recording with the request context (which still holds the server span)
		// is what lets the SDK attach a trace_id exemplar to the histogram.
		duration.Record(ctx, time.Since(start).Seconds(), attrs)
		requests.Add(ctx, 1, attrs)

		return resp, err
	}, nil
}
