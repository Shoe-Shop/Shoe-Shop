// Four-signal OpenTelemetry bootstrap for the cart service (MELT).
//
// Loaded via `node -r ./dist/telemetry.js` BEFORE the app, so grpc (server) and
// ioredis (client) are auto-instrumented. Takes cart from traces-only to the
// full four correlated signals — Metrics, Events, Logs, Traces — over OTLP/gRPC,
// matching the catalogue (Go) reference and the users (Python) retrofit
// (ARCHITECTURE.md §9 / ADR-0002). One NodeSDK wires all three providers, so they
// share NodeSDK's auto-detected resource and every record agrees on service.name
// / service.namespace / deployment.environment (from the OTEL_* env in compose),
// and in-request logs/events carry the active trace_id (the correlation contract).
//
// Node-specific maturity finding (verified in Docker against the pinned SDK):
//   * Traces + Logs + Events are mature: the Logs API captures the active
//     trace_id/span_id automatically, and a domain event is a log record with the
//     `eventName` field set (the JS equivalent of Go's Record.SetEventName).
//   * Metrics RED is emitted by hand (grpc auto-instrumentation produces spans
//     only, no server metrics) — like the Go/Python interceptor.
//   * METRIC EXEMPLARS ARE NOT AVAILABLE in OpenTelemetry-JS (sdk-metrics 2.7.1,
//     the latest): the histogram aggregator never records exemplars and the OTLP
//     serializer never writes the exemplar field — verified by reading the SDK
//     source. The metric→trace link for this service is therefore provided by the
//     LGTM bundle's Tempo metrics-generator (`send_exemplars: true`), which derives
//     exemplar-bearing span metrics from cart's traces server-side. This is the
//     documented JS-stack divergence from the Go/Python reference; see §9.
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc';
import { PeriodicExportingMetricReader, AggregationType } from '@opentelemetry/sdk-metrics';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { metrics, type Attributes, type Counter, type Histogram } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import * as grpc from '@grpc/grpc-js';
import type { ServerInterceptor } from '@grpc/grpc-js';

// Instrumentation scope shared by the cart's own meter, logger and events —
// distinct from the grpc/ioredis auto-instrumentation scopes. Lets queries pick
// out the cart service's own metrics and domain events (in Loki, events carry
// scope_name="shoeshop/cart").
const SCOPE = 'shoeshop/cart';

// Second-scale buckets for the RPC latency histogram (the JS default buckets
// assume milliseconds and bunch up sub-second values). Mirrors the Go/Python
// reference buckets so the histogram is comparable across stacks.
const LATENCY_BUCKETS = [0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];

const sdk = new NodeSDK({
  // ── Traces ── unchanged from the existing wiring: one SERVER span per RPC,
  // child ioredis CLIENT spans (gRPC RPC → redis command).
  traceExporter: new OTLPTraceExporter(),
  // ── Metrics ── periodic OTLP export; the View gives rpc.server.duration
  // second-scale buckets (data-style aggregation, sdk-metrics 2.x API).
  metricReaders: [new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter() })],
  views: [
    {
      instrumentName: 'rpc.server.duration',
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
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingRequestHook: (req) => (req.url ?? '') === '/healthz',
      },
    }),
  ],
});

sdk.start();

// Meter, logger and instruments are created AFTER start(): only then has NodeSDK
// installed the global meter/logger providers (before start they are no-ops).
const meter = metrics.getMeter(SCOPE);
const otelLogger = logs.getLogger(SCOPE);

const requests: Counter = meter.createCounter('rpc.server.requests', {
  description: 'Count of inbound gRPC unary calls by method and gRPC status code.',
});
const duration: Histogram = meter.createHistogram('rpc.server.duration', {
  unit: 's',
  description: 'Duration of inbound gRPC unary calls, in seconds.',
});

/**
 * RED metrics interceptor. The gRPC auto-instrumentation emits spans only, so —
 * like the Go and Python references — the cart records its own RED:
 *   rpc.server.requests  (counter)            — rate + errors
 *   rpc.server.duration  (histogram, seconds) — duration
 * keyed by rpc.method (full path "/cart.v1.CartService/GetCart") and
 * rpc.grpc.status_code. The transport-level interceptor's sendStatus responder
 * fires once the final status is sent, so timing spans the whole call and the
 * status code is the one the client receives.
 */
export const metricsInterceptor: ServerInterceptor = (methodDescriptor, call) => {
  const startNs = process.hrtime.bigint();
  const responder = new grpc.ResponderBuilder()
    .withSendStatus((status, next) => {
      const seconds = Number(process.hrtime.bigint() - startNs) / 1e9;
      const code = status.code ?? grpc.status.UNKNOWN;
      const attributes: Attributes = {
        'rpc.method': methodDescriptor.path,
        'rpc.grpc.status_code': grpc.status[code] ?? String(code),
      };
      duration.record(seconds, attributes);
      requests.add(1, attributes);
      next(status);
    })
    .build();
  return new grpc.ServerInterceptingCall(call, responder);
};

/**
 * Structured logger that fans out to BOTH stdout JSON (so `task logs -- cart`
 * still works) AND OTLP logs → Loki. When called inside a request's span the
 * Logs API stamps the active trace_id/span_id — the trace↔log join key from the
 * correlation contract. Startup logs (outside any span) carry no trace_id, as
 * expected.
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
 * eventName (e.g. "cart.item.added"). Emitting within a request's span makes the
 * SDK stamp the active trace_id/span_id, so events join to their trace exactly
 * like logs do (the four-signal "E"). In Loki, events are told apart from logs by
 * scope_name="shoeshop/cart" + the eventName body. Richer domain events arrive
 * with the v0.3 NATS write path.
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
