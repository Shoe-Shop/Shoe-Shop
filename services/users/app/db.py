"""PostgreSQL access for the users service.

Owns the asyncpg connection pool plus a startup migration that creates the
schema and loads demo data. The migration is idempotent (CREATE TABLE IF NOT
EXISTS + seed ON CONFLICT DO NOTHING), so it is safe to run on every boot --
mirroring the catalogue store.Migrate behaviour.
"""

import asyncio
import logging
from pathlib import Path

import asyncpg

_SCHEMA_SQL = (Path(__file__).parent / "schema.sql").read_text()
_SEED_SQL = (Path(__file__).parent / "seed.sql").read_text()

log = logging.getLogger("users.db")


async def create_pool(dsn: str) -> asyncpg.Pool:
    return await asyncpg.create_pool(dsn=dsn, min_size=1, max_size=10)


async def wait_for_db(pool: asyncpg.Pool, timeout_s: float = 30.0) -> None:
    """Block until the pool can round-trip a trivial query, or raise."""
    deadline = asyncio.get_running_loop().time() + timeout_s
    last_err: Exception | None = None
    while asyncio.get_running_loop().time() < deadline:
        try:
            await pool.execute("SELECT 1")
            return
        except Exception as exc:  # noqa: BLE001 - retry any connect error
            last_err = exc
            await asyncio.sleep(1.0)
    raise RuntimeError(f"database not ready after {timeout_s}s: {last_err}")


async def migrate(pool: asyncpg.Pool) -> None:
    async with pool.acquire() as conn:
        await conn.execute(_SCHEMA_SQL)
        await conn.execute(_SEED_SQL)
    log.info("database ready and migrated")
