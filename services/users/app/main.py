"""Entrypoint for the users service.

Wires OpenTelemetry, the asyncpg pool (with startup migration), and two servers
sharing one asyncio event loop:
  * a gRPC server exposing UsersService (the inter-service contract), and
  * a FastAPI app (uvicorn) exposing /healthz + /readyz for the container probe.
"""

import asyncio
import json
import logging
import signal
import sys

import grpc
import uvicorn
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.grpc import aio_server_interceptor

from app import config, db, telemetry
from app.health import create_app
from app.server import UsersService
from users.v1 import users_pb2, users_pb2_grpc

log = logging.getLogger("users")


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "level": record.levelname.lower(),
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info:
            payload["err"] = self.formatException(record.exc_info)
        return json.dumps(payload)


def _configure_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(_JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(logging.INFO)


def _enable_reflection(server: grpc.aio.Server) -> None:
    """Best-effort gRPC server reflection (handy for grpcurl); never fatal."""
    try:
        from grpc_reflection.v1alpha import reflection

        service_names = (
            users_pb2.DESCRIPTOR.services_by_name["UsersService"].full_name,
            reflection.SERVICE_NAME,
        )
        reflection.enable_server_reflection(service_names, server)
    except Exception as exc:  # noqa: BLE001
        log.warning("gRPC reflection not enabled: %s", exc)


async def serve() -> None:
    cfg = config.load()
    telemetry.setup(cfg.service_name)

    pool = await db.create_pool(cfg.database_url)
    await db.wait_for_db(pool)
    await db.migrate(pool)

    server = grpc.aio.server(interceptors=[aio_server_interceptor()])
    users_pb2_grpc.add_UsersServiceServicer_to_server(UsersService(pool), server)
    _enable_reflection(server)
    server.add_insecure_port(cfg.grpc_addr)

    app = create_app(lambda: pool)
    FastAPIInstrumentor.instrument_app(app, excluded_urls="healthz,readyz")
    uv_server = uvicorn.Server(
        uvicorn.Config(
            app,
            host=cfg.health_host,
            port=cfg.health_port,
            log_level="warning",
            access_log=False,
        )
    )

    await server.start()
    log.info(
        "users gRPC server started addr=%s health_port=%d service=%s",
        cfg.grpc_addr,
        cfg.health_port,
        cfg.service_name,
    )

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)

    health_task = asyncio.create_task(uv_server.serve())
    await stop.wait()

    log.info("shutdown signal received; stopping servers")
    await server.stop(grace=3)
    uv_server.should_exit = True
    await health_task
    await pool.close()


def main() -> None:
    _configure_logging()
    try:
        asyncio.run(serve())
    except Exception:  # noqa: BLE001
        log.exception("users exited")
        sys.exit(1)


if __name__ == "__main__":
    main()
