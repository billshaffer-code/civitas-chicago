"""
Tests for GET /api/v1/health endpoint.
"""

from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest

from tests.conftest import FakeConnection


@pytest.mark.asyncio
async def test_health_ok(client):
    conn = FakeConnection(fetchval_return=1)

    @asynccontextmanager
    async def _get_conn():
        yield conn

    with patch("backend.app.database.get_conn", _get_conn):
        resp = await client.get("/api/v1/health")

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["db_connected"] is True
