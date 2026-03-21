"""
CIVITAS MCP – asyncpg connection pool (read-only by default).
"""

from __future__ import annotations

import asyncpg
from contextlib import asynccontextmanager
from typing import AsyncIterator

from mcp_servers.common.config import settings

_pool: asyncpg.Pool | None = None


async def _init_connection(conn: asyncpg.Connection):
    """Set read-only mode and statement timeout on each new connection."""
    await conn.execute("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY")
    timeout_ms = settings.mcp_db_query_timeout_seconds * 1000
    await conn.execute(f"SET statement_timeout = {timeout_ms}")


async def init_pool(*, read_only: bool = True):
    global _pool
    kwargs = dict(
        dsn=settings.database_url,
        min_size=2,
        max_size=10,
    )
    if read_only:
        kwargs["init"] = _init_connection
    _pool = await asyncpg.create_pool(**kwargs)


async def close_pool():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


@asynccontextmanager
async def get_conn() -> AsyncIterator[asyncpg.Connection]:
    """Yield a connection from the pool."""
    async with _pool.acquire() as conn:
        yield conn
