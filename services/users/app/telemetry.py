"""Four-signal OpenTelemetry bootstrap for the users service (MELT).

Takes users from traces-only to the full four correlated signals — Metrics,
Events, Logs, Traces — over OTLP/gRPC, matching the catalogue reference
(ARCHITECTURE.md §9 / ADR-0002). Every signal shares one resource, so all records
agree on service.name / service.namespace / deployment.environment, and
in-request metrics/logs/events carry the active trace_id (correlation contract).

All SDK APIs were verified in Docker against the pinned versions before use. Notes
on Python-specific maturity (vs the Go reference):
  * gRPC instrumentation emits spans only (no server metrics), so RED metrics come
    from a small aio interceptor here — like the Go interceptor.
  * Logs use the stdlib-logging bridge (LoggingHandler), which captures the active
    trace_id/span_id automatically.
  * The dedicated Events API is deprecated (since 1.39.0); the forward path — and
    the one used here — is a log record with the `event_name` field set, emitted
    via the Logs API (the Python equivalent of Go's Record.SetEventName).
"""

import logging
import time
from dataclasses import dataclass
from typing import Callable, Mapping, Optional

import grpc
from opentelemetry import metrics, trace
from opentelemetry._logs import SeverityNumber, set_logger_provider
from opentelemetry.exporter.otlp.proto.grpc._log_exporter import OTLPLogExporter
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.asyncpg import AsyncPGInstrumentor
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs._internal import LogRecord
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.sdk.metrics import MeterProvider, TraceBasedExemplarFilter
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.metrics.view import ExplicitBucketHistogramAggregation, View
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

# Instrumentation scope shared by this service's meter and its events logger —
# distinct from the grpc/asyncpg auto-instrumentation scopes. Lets queries pick
# out the catalogue/users service's own metrics and domain events.
_SCOPE = "shoeshop/users"

# Second-scale buckets for the RPC latency histogram (the Python default buckets
# assume milliseconds and bunch up sub-second values).
_LATENCY_BUCKETS = [0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]

# Set in setup(); used by event() to emit domain events through the Logs API.
_event_logger = None


@dataclass
class Telemetry:
    """Wired four-signal stack handed back to main()."""

    # A gRPC aio interceptor recording RED metrics (with trace_id exemplars).
    metrics_interceptor: grpc.aio.ServerInterceptor
    # Attach to the root logger so stdlib logs are bridged to OTLP/Loki with
    # trace_id/span_id stamped on in-request records.
    logging_handler: logging.Handler
    # Flushes traces, metrics and logs on shutdown.
    shutdown: Callable[[], None]


class _MetricsInterceptor(grpc.aio.ServerInterceptor):
    """Records RED metrics per unary RPC.

    Rate/errors come from rpc.server.requests (counter by method + gRPC status);
    duration from rpc.server.duration (histogram, seconds). Recording happens
    while the tracing interceptor's server span is active, so the histogram
    carries a trace_id exemplar. Mirrors the catalogue Go interceptor.
    """

    def __init__(self, duration, requests) -> None:
        self._duration = duration
        self._requests = requests

    async def intercept_service(self, continuation, handler_call_details):
        handler = await continuation(handler_call_details)
        if handler is None or not handler.unary_unary:
            return handler

        method = handler_call_details.method
        inner = handler.unary_unary

        async def wrapper(request, context):
            start = time.perf_counter()
            try:
                return await inner(request, context)
            finally:
                code = context.code()
                status = code.name if code is not None else "OK"
                attrs = {"rpc.method": method, "rpc.grpc.status_code": status}
                self._duration.record(time.perf_counter() - start, attrs)
                self._requests.add(1, attrs)

        # The handler constructor lives on the top-level grpc module (not
        # grpc.aio); an async behavior is valid for an aio server.
        return grpc.unary_unary_rpc_method_handler(
            wrapper,
            request_deserializer=handler.request_deserializer,
            response_serializer=handler.response_serializer,
        )


def setup(service_name: str) -> Telemetry:
    # Resource.create merges OTEL_RESOURCE_ATTRIBUTES / OTEL_SERVICE_NAME from the
    # environment; the explicit service.name is a belt-and-braces default.
    resource = Resource.create({"service.name": service_name})

    # ── Traces ──────────────────────────────────────────────────────
    tracer_provider = TracerProvider(resource=resource)
    tracer_provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(tracer_provider)
    # Must run before the asyncpg pool is created so connections are patched.
    AsyncPGInstrumentor().instrument()

    # ── Metrics ─────────────────────────────────────────────────────
    duration_view = View(
        instrument_name="rpc.server.duration",
        aggregation=ExplicitBucketHistogramAggregation(boundaries=_LATENCY_BUCKETS),
    )
    meter_provider = MeterProvider(
        resource=resource,
        metric_readers=[PeriodicExportingMetricReader(OTLPMetricExporter())],
        views=[duration_view],
        exemplar_filter=TraceBasedExemplarFilter(),
    )
    metrics.set_meter_provider(meter_provider)
    meter = meter_provider.get_meter(_SCOPE)
    duration = meter.create_histogram(
        "rpc.server.duration",
        unit="s",
        description="Duration of inbound gRPC unary calls, in seconds.",
    )
    requests = meter.create_counter(
        "rpc.server.requests",
        description="Count of inbound gRPC unary calls by method and gRPC status code.",
    )

    # ── Logs + Events ───────────────────────────────────────────────
    logger_provider = LoggerProvider(resource=resource)
    logger_provider.add_log_record_processor(
        BatchLogRecordProcessor(OTLPLogExporter())
    )
    set_logger_provider(logger_provider)

    global _event_logger
    _event_logger = logger_provider.get_logger(_SCOPE)

    logging_handler = LoggingHandler(
        level=logging.INFO, logger_provider=logger_provider
    )

    def shutdown() -> None:
        tracer_provider.shutdown()
        meter_provider.shutdown()
        logger_provider.shutdown()

    return Telemetry(
        metrics_interceptor=_MetricsInterceptor(duration, requests),
        logging_handler=logging_handler,
        shutdown=shutdown,
    )


def event(name: str, attributes: Optional[Mapping[str, object]] = None) -> None:
    """Emit a domain/lifecycle event via the Logs API.

    Sets the OTLP log record's event_name field (e.g. "users.user.viewed") and
    emits it through the Logs API logger. Emitting inside a request's span makes
    the SDK stamp the active trace_id/span_id, so events join to their trace just
    like logs do. The four-signal "E"; richer domain events arrive with the v0.3
    NATS write path.
    """
    if _event_logger is None:  # setup() not called — no-op rather than crash.
        return
    _event_logger.emit(
        LogRecord(
            event_name=name,
            body=name,
            severity_number=SeverityNumber.INFO,
            attributes=dict(attributes or {}),
        )
    )
