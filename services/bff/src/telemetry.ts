// Four-signal OpenTelemetry bootstrap for the BFF service (MELT).
//
// Loaded via `node -r ./dist/telemetry.js` BEFORE the app, so the http server
// (incoming, via @hono/node-server) and grpc clients (outgoing → catalogue/cart)
// are auto-instrumented. Takes the BFF from traces-only to the full four
// correlated signals — Metrics, Events, Logs, Traces — over OTLP/gRPC, matching
// the catalogue (Go) reference and the users (Python) / cart (Node) retrofits
// (ARCHITECTURE.md §9 / ADR-0002). One NodeSDK wires all three providers off its
// auto-detected resource, so every record agrees on service.name /
// service.namespace / deployment.environment (from the OTEL_* env in compose),
// and in-request logs/events carry the active trace_id (the correlation contract).
//
// BFF vs Cart (same OTel-JS family, but an HTTP server not a gRPC server):
//   * RED is HTTP-SERVER-side. @opentelemetry/instrumentation-http (0.218) already
//     emits an HTTP server duration histogram, so — unlike the Go/Python/Cart
//     gRPC interceptor — RED needs no hand-rolled recorder. We opt into the STABLE
//     HTTP semconv (below) so it emits the seconds-scale `http.server.request.duration`
//     with stable attributes (http.request.method, http.response.status_code); a
//     View aligns its buckets with the cross-stack reference. Verified in Docker:
//     the http SERVER span is active inside the Hono fetch handler, so logs/events
//     emitted in handlers carry trace_id/span_id (Hono is fetch-based — confirmed).
//   * METRIC EXEMPLARS ARE NOT AVAILABLE in OpenTelemetry-JS (sdk-metrics 2.7.1,
//     the latest) — the histogram aggregator never records exemplars and the OTLP
//     serializer never writes the exemplar field (settled & documented for Cart;
//     §9 "Per-stack exemplar policy"). The metric→trace link for this service is
//     therefore provided by the LGTM bundle's Tempo metrics-generator
//     (`send_exemplars: true`), which derives exemplar-bearing span metrics
//     (traces_spanmetrics_*{service="bff"}) from the BFF's own traces server-side.
//   * Logs + Events are mature and identical to Cart: the Logs API captures the
//     active trace_id/span_id automatically, and a domain event is a log record
//     with the `eventName` field set.

// Opt into the STABLE HTTP semantic conventions BEFORE the instrumentations are
// constructed (getNodeAutoInstrumentations runs in `new NodeSDK` below, and the
// HttpInstrumentation reads this env in its constructor). This switches the http
// server metric from the legacy ms-scale `http.server.duration` to the stable
// seconds-scale `http.server.request.duration` (verified in Docker).
process.env.OTEL_SEMCONV_STABILITY_OPT_IN ??= 'http';

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc';
import { PeriodicExportingMetricReader, AggregationType } from '@opentelemetry/sdk-metrics';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { type Attributes } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';

// Instrumentation scope shared by the BFF's own logger and events — distinct from
// the http/grpc auto-instrumentation scopes. Lets queries pick out the BFF
// service's own domain events (in Loki, events carry scope_name="shoeshop/bff").
const SCOPE = 'shoeshop/bff';

// Second-scale buckets for the HTTP server latency histogram. Mirrors the
// Go/Python/Cart reference buckets so the histogram is comparable across stacks.
const LATENCY_BUCKETS = [0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];

const sdk = new NodeSDK({
  // ── Traces ── unchanged from the existing wiring: one SERVER span per HTTP
  // request, child gRPC CLIENT spans (bff → catalogue, bff → cart → redis).
  traceExporter: new OTLPTraceExporter(),
  // ── Metrics ── periodic OTLP export. RED is the http instrumentation's own
  // `http.server.request.duration` (rate via _count, errors via status_code); the
  // View gives it the cross-stack second-scale buckets.
  metricReaders: [new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter() })],
  views: [
    {
      instrumentName: 'http.server.request.duration',
      aggregation: {
        type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
        options: { boundaries: LATENCY_BUCKETS },
      },
    },
  ],
  // ── Logs + Events ── both flow through one LoggerProvider → OTLP → Loki.
  logRecordProcessors: [new BatchLogRecordProcessor(new OTLPLogExporter())],
  instrumentations: [
    getNodeAutoInstrumentations({
      // fs spans are noisy and unhelpful here.
      '@opentelemetry/instrumentation-fs': { enabled: false },
      // keep the liveness probe out of traces and the RED metric.
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingRequestHook: (req) => (req.url ?? '') === '/healthz',
      },
    }),
  ],
});

sdk.start();

// The logger is created AFTER start(): only then has NodeSDK installed the global
// logger provider (before start, logs.getLogger is a no-op).
const otelLogger = logs.getLogger(SCOPE);

/**
 * Structured logger that fans out to BOTH stdout JSON (so `task logs -- bff` still
 * works) AND OTLP logs → Loki. When called inside a request's span the Logs API
 * stamps the active trace_id/span_id — the trace↔log join key from the correlation
 * contract. Startup logs (outside any span) carry no trace_id, as expected.
 */
function emit(severityNumber: SeverityNumber, level: string, msg: string, attributes?: Attributes): void {
  console.log(JSON.stringify({ level, msg, ...attributes }));
  otelLogger.emit({ severityNumber, severityText: level.toUpperCase(), body: msg, attributes });
}

export const log = {
  info: (msg: string, attributes?: Attributes) => emit(SeverityNumber.INFO, 'info', msg, attributes),
  warn: (msg: string, attributes?: Attributes) => emit(SeverityNumber.WARN, 'warn', msg, attributes),
  error: (msg: string, attributes?: Attributes) => emit(SeverityNumber.ERROR, 'error', msg, attributes),
};

/**
 * Emit a domain/lifecycle event via the Logs API — a log record carrying an
 * eventName (e.g. "bff.product.viewed"). Emitting within a request's span makes
 * the SDK stamp the active trace_id/span_id, so events join to their trace exactly
 * like logs do (the four-signal "E"). The BFF is a read-path aggregator, so its
 * events are modest and meaningful. In Loki, events are told apart from logs by
 * scope_name="shoeshop/bff" + the eventName body. Richer domain events arrive with
 * the v0.3 NATS write path.
 */
export function event(name: string, attributes?: Attributes): void {
  otelLogger.emit({
    eventName: name,
    severityNumber: SeverityNumber.INFO,
    body: name,
    attributes,
  });
}

function shutdown(): void {
  sdk
    .shutdown()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
