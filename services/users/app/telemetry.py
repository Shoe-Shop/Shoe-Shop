"""OpenTelemetry bootstrap for the users service.

Installs a global tracer provider exporting over OTLP/gRPC (endpoint + service
name read from the standard OTEL_* env vars) and turns on auto-instrumentation
for asyncpg. The gRPC server and FastAPI app are instrumented at their
construction sites (main.py / health.py).

Net effect, matching the catalogue reference (ARCHITECTURE.md §9): a single
trace shows `gRPC RPC -> Postgres query`, because asyncpg spans are created as
children of the active gRPC server span within the same async task.
"""

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.asyncpg import AsyncPGInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor


def setup(service_name: str) -> None:
    # Resource.create merges OTEL_RESOURCE_ATTRIBUTES / OTEL_SERVICE_NAME from
    # the environment; the explicit service.name is a belt-and-braces default.
    resource = Resource.create({"service.name": service_name})

    provider = TracerProvider(resource=resource)
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)

    # Must run before the asyncpg pool is created so connections are patched.
    AsyncPGInstrumentor().instrument()
