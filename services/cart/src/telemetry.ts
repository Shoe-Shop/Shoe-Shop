// OpenTelemetry bootstrap (loaded via `node -r ./dist/telemetry.js`). Auto-
// instruments grpc (server) and ioredis (client). Endpoint + service name come
// from the standard OTEL_* env vars. /healthz probes are excluded to keep the
// trace stream focused on real traffic.
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter(),
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

function shutdown(): void {
  sdk
    .shutdown()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
