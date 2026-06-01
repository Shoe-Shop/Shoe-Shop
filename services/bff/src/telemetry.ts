// OpenTelemetry bootstrap. Loaded via `node -r ./dist/telemetry.js` BEFORE the
// app so http (incoming) and grpc (outgoing) get auto-instrumented. Exporter
// endpoint + service name come from the standard OTEL_* env vars set in compose.
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter(),
  instrumentations: [
    getNodeAutoInstrumentations({
      // fs spans are noisy and unhelpful here.
      '@opentelemetry/instrumentation-fs': { enabled: false },
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
