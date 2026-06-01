"""Runtime configuration, sourced from the environment with local-compose
defaults. The OTLP exporter is configured separately by the OpenTelemetry SDK
directly from the standard OTEL_* environment variables."""

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Config:
    service_name: str
    grpc_addr: str
    health_host: str
    health_port: int
    database_url: str


def _getenv(key: str, fallback: str) -> str:
    value = os.getenv(key)
    return value if value else fallback


def load() -> Config:
    return Config(
        service_name=_getenv("OTEL_SERVICE_NAME", "users"),
        grpc_addr=_getenv("USERS_GRPC_ADDR", "0.0.0.0:9090"),
        health_host=_getenv("USERS_HEALTH_HOST", "0.0.0.0"),
        health_port=int(_getenv("USERS_HEALTH_PORT", "8080")),
        database_url=_getenv(
            "USERS_DATABASE_URL",
            "postgres://postgres:postgres@postgres:5432/users",
        ),
    )
