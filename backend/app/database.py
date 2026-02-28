"""
CIVITAS – asyncpg connection pool.
"""

from __future__ import annotations

import asyncpg
from contextlib import asynccontextmanager
from typing import AsyncIterator

from backend.app.config import settings

_pool: asyncpg.Pool | None = None


async def init_pool():
    global _pool
    _pool = await asyncpg.create_pool(
        dsn=settings.database_url,
        min_size=2,
        max_size=10,
    )


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
