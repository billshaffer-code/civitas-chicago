"""
CIVITAS MCP Servers – Shared test fixtures.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any
from unittest.mock import patch

import pytest


# ── Fake asyncpg connection (same pattern as backend/tests/conftest.py) ──────

class FakeConnection:
    """Minimal stand-in for asyncpg.Connection."""

    def __init__(
        self,
        fetchrow_return: Any = None,
        fetch_return: Any = None,
        fetchval_return: Any = None,
        execute_return: str = "INSERT 0 1",
    ):
        self.fetchrow_return = fetchrow_return
        self.fetch_return = fetch_return if fetch_return is not None else []
        self.fetchval_return = fetchval_return
        self.execute_return = execute_return

    async def fetchrow(self, query: str, *args) -> Any:
        return self.fetchrow_return

    async def fetch(self, query: str, *args) -> Any:
        return self.fetch_return

    async def fetchval(self, query: str, *args) -> Any:
        return self.fetchval_return

    async def execute(self, query: str, *args) -> str:
        return self.execute_return


# ── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture
def fake_conn():
    """Return a FakeConnection factory."""
    return FakeConnection


@pytest.fixture
def mock_mcp_conn(fake_conn):
    """Patch mcp_servers.common.db.get_conn to yield a default FakeConnection."""
    conn = fake_conn()

    @asynccontextmanager
    async def _get_conn():
        yield conn

    with patch("mcp_servers.common.db.get_conn", _get_conn):
        yield conn
