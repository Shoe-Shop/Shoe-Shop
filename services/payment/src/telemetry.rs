//! Four-signal MELT bootstrap (ADR-0002 §9). One shared `Resource` feeds the
//! tracer, meter and logger providers, all exporting OTLP/gRPC to the LGTM bundle,
//! so every signal agrees on service.name / service.namespace / deployment.environment.
//!
//! Design mirrors the Go/Java references: saga spans are created with the OTel API
//! directly (see `natstrace`), and logs/events go through `tracing` → the
//! opentelemetry-appender-tracing bridge, which stamps each record with the
//! trace_id/span_id of the *attached* OTel context. The resource is built from
//! OTEL_SERVICE_NAME + OTEL_RESOURCE_ATTRIBUTES only (no host.*/process.* detectors),
//! preserving the cross-stack label parity the dataset requires.
//!
//! Exemplar note (verified in Docker, ADR-0003): opentelemetry_sdk 0.32 does NOT
//! populate metric exemplars (the data model has the field but no reservoir/filter
//! pipeline and no OTEL_METRICS_EXEMPLAR_FILTER support). So Payment carries the
//! same exemplar gap as the JS/TS services — app-level RED is real, and the
//! metric↔trace join is served by the bundle's Tempo metrics-generator
//! (traces_spanmetrics_*{service="payment"}). See ARCHITECTURE.md §9.

use anyhow::Result;
use opentelemetry::metrics::{Counter, Histogram};
use opentelemetry_appender_tracing::layer::OpenTelemetryTracingBridge;
use opentelemetry_otlp::{LogExporter, MetricExporter, SpanExporter};
use opentelemetry_sdk::logs::SdkLoggerProvider;
use opentelemetry_sdk::metrics::SdkMeterProvider;
use opentelemetry_sdk::propagation::TraceContextPropagator;
use opentelemetry_sdk::trace::SdkTracerProvider;
use opentelemetry_sdk::Resource;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::EnvFilter;

/// The instrumentation scope for Payment's own spans, meter, logs and events.
pub const SCOPE: &str = "shoeshop/payment";

/// Holds the providers so they can be flushed/shut down on exit.
pub struct Telemetry {
    tracer: SdkTracerProvider,
    meter: SdkMeterProvider,
    logger: SdkLoggerProvider,
}

impl Drop for Telemetry {
    fn drop(&mut self) {
        let _ = self.tracer.shutdown();
        let _ = self.meter.shutdown();
        let _ = self.logger.shutdown();
    }
}

/// Initialise all four signals. The OTLP endpoint/protocol come from the standard
/// OTEL_EXPORTER_OTLP_* env vars (set in Compose).
pub fn init() -> Result<Telemetry> {
    // service.name from OTEL_SERVICE_NAME, plus service.namespace/deployment.environment
    // from OTEL_RESOURCE_ATTRIBUTES, plus telemetry.sdk.* — and nothing else.
    let resource = Resource::builder().build();

    opentelemetry::global::set_text_map_propagator(TraceContextPropagator::new());

    // Traces.
    let span_exporter = SpanExporter::builder().with_tonic().build()?;
    let tracer = SdkTracerProvider::builder()
        .with_resource(resource.clone())
        .with_batch_exporter(span_exporter)
        .build();
    opentelemetry::global::set_tracer_provider(tracer.clone());

    // Metrics.
    let metric_exporter = MetricExporter::builder().with_tonic().build()?;
    let meter = SdkMeterProvider::builder()
        .with_resource(resource.clone())
        .with_periodic_exporter(metric_exporter)
        .build();
    opentelemetry::global::set_meter_provider(meter.clone());

    // Logs (+ domain events) bridged from `tracing`.
    let log_exporter = LogExporter::builder().with_tonic().build()?;
    let logger = SdkLoggerProvider::builder()
        .with_resource(resource.clone())
        .with_batch_exporter(log_exporter)
        .build();

    // tracing → stdout JSON (so `task logs -- payment` works) + OTLP→Loki bridge.
    let otlp_logs = OpenTelemetryTracingBridge::new(&logger);
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::registry()
        .with(filter)
        .with(tracing_subscriber::fmt::layer().json())
        .with(otlp_logs)
        .init();

    Ok(Telemetry { tracer, meter, logger })
}

/// App-level RED for the saga workload (per-message processed), keyed by subject +
/// decision result. Cloneable — the OTel instruments are internally ref-counted.
#[derive(Clone)]
pub struct Metrics {
    pub requests: Counter<u64>,
    pub duration: Histogram<f64>,
}

impl Metrics {
    pub fn new() -> Self {
        let meter = opentelemetry::global::meter(SCOPE);
        Metrics {
            requests: meter
                .u64_counter("payment.requests")
                .with_description("Payment commands processed, by subject and result")
                .build(),
            duration: meter
                .f64_histogram("payment.duration")
                .with_unit("s")
                .with_description("Payment processing duration in seconds")
                .build(),
        }
    }
}
