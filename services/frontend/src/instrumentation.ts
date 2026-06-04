// Four-signal OpenTelemetry bootstrap for the Frontend service (MELT).
//
// Next.js calls register() once at server startup, before handling any
// request, which makes it the correct place to initialise the SDK. Dynamic
// imports are required: Next.js compiles this file with SWC and gRPC's
// dynamic-require paths cause bundler errors if imported statically.
//
// Signal summary:
//   T — Traces: Next.js instruments RSC renders and fetch calls internally via
//       @opentelemetry/api; those spans flow to our registered TracerProvider.
//       @opentelemetry/instrumentation-http adds CLIENT spans for outgoing
//       server-side fetch → BFF calls. /_next/* and /api/healthz are excluded.
//   M — Metrics: instrumentation-http emits http.server.request.duration
//       (stable semconv, seconds-scale) — same RED surface as BFF. Web Vitals
//       (LCP/CLS/INP/FCP/TTFB) arrive via POST /api/vitals from the browser and
//       are recorded as frontend.web_vital.* histograms from that route handler.
//       JS metric exemplars are not available (OTel-JS sdk-metrics 2.7.1 —
//       verified, same gap as Cart/BFF); metric↔trace join is provided by the
//       LGTM bundle's Tempo metrics-generator. See ARCHITECTURE.md §9.
//   L — Logs: server/lib/telemetry.ts log() fans out to stdout JSON (so
//       `task logs -- frontend` works) and the OTel Logs API → OTLP → Loki.
//       In-request records carry trace_id/span_id from the active RSC span.
//   E — Events: domain events (frontend.page.viewed, frontend.product.viewed,
//       frontend.search.performed) emitted from RSC page handlers via the same
//       Logs API with eventName set — correlated to traces by trace_id.

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Must be set BEFORE getNodeAutoInstrumentations() constructs the http
  // instrumentation — it reads this env in its constructor. Switches the http
  // server metric from the legacy ms-scale `http.server.duration` to the
  // stable seconds-scale `http.server.request.duration` (matches BFF).
  process.env.OTEL_SEMCONV_STABILITY_OPT_IN ??= 'http';

  const { NodeSDK } = await import('@opentelemetry/sdk-node');
  const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-grpc');
  const { OTLPMetricExporter } = await import('@opentelemetry/exporter-metrics-otlp-grpc');
  const { OTLPLogExporter } = await import('@opentelemetry/exporter-logs-otlp-grpc');
  const { PeriodicExportingMetricReader, AggregationType } = await import('@opentelemetry/sdk-metrics');
  const { BatchLogRecordProcessor } = await import('@opentelemetry/sdk-logs');
  const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node');

  // Second-scale buckets matching the Go/Python/Cart/BFF reference so the
  // histogram is comparable across stacks in Grafana.
  const LATENCY_BUCKETS = [0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];

  const sdk = new NodeSDK({
    // ── Traces ── Next.js creates RSC + fetch spans internally via
    // @opentelemetry/api; they flow to this TracerProvider automatically.
    traceExporter: new OTLPTraceExporter(),

    // ── Metrics ── RED from instrumentation-http's http.server.request.duration.
    // Web Vital histograms are recorded in the /api/vitals route handler.
    metricReaders: [
      new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter() }),
    ],
    views: [
      {
        instrumentName: 'http.server.request.duration',
        aggregation: {
          type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
          options: { boundaries: LATENCY_BUCKETS },
        },
      },
    ],

    // ── Logs + Events ── both flow through the LoggerProvider → OTLP → Loki.
    logRecordProcessors: [new BatchLogRecordProcessor(new OTLPLogExporter())],

    instrumentations: [
      getNodeAutoInstrumentations({
        // fs spans are extremely noisy in Next.js (static file reads on every
        // request) and provide no signal value.
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-http': {
          // Keep health probes and Next.js internal asset requests out of
          // traces and the RED metric — they are not user traffic.
          ignoreIncomingRequestHook: (req) => {
            const url = req.url ?? '';
            return url === '/api/healthz' || url.startsWith('/_next/');
          },
        },
      }),
    ],
  });

  sdk.start();

  const shutdown = () => sdk.shutdown().finally(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
