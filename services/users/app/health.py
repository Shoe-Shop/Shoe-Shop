"""FastAPI health surface for the users service.

Runs alongside the gRPC server (served by uvicorn in main.py). The container
healthcheck probes the dependency-free liveness endpoint /healthz; /readyz adds
a Postgres round-trip for readiness use. Both paths are excluded from tracing
(see main.py) so health traffic stays off the trace stream, mirroring the cart
service's /healthz handling.
"""

from collections.abc import Callable

import asyncpg
from fastapi import FastAPI, Response


def create_app(get_pool: Callable[[], asyncpg.Pool]) -> FastAPI:
    app = FastAPI(
        title="users-health",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/readyz")
    async def readyz(response: Response) -> dict[str, str]:
        try:
            await get_pool().execute("SELECT 1")
            return {"status": "ready"}
        except Exception:  # noqa: BLE001 - any failure means not ready
            response.status_code = 503
            return {"status": "unhealthy"}

    return app
