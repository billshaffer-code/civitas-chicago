"""
Integration tests for /api/v1/data/health and /api/v1/data/live-check endpoints.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import pytest

from tests.conftest import FakeConnection


class _HealthConn(FakeConnection):
    """FakeConnection that returns 100 for count(*) and None for MAX(completed_at)."""

    def __init__(self):
        super().__init__(fetchval_return=None, fetch_return=[])

    async def fetchval(self, query: str, *args):
        if "count" in query.lower():
            return 100
        return None  # MAX(completed_at)


@pytest.mark.asyncio
async def test_data_health_returns_datasets_and_alerts(client):
    """GET /api/v1/data/health returns datasets list and quality_alerts."""
    conn = _HealthConn()

    @asynccontextmanager
    async def _get_conn():
        yield conn

    fake_freshness = {
        "dataset": "violations",
        "label": "Building Violations",
        "rows_updated_at": 1700000000,
        "age_hours": 12.5,
        "rows_updated_iso": "2023-11-14T22:13:20+00:00",
    }

    with patch("backend.app.routers.data.get_conn", _get_conn):
        with patch(
            "backend.app.routers.data.get_dataset_freshness",
            new_callable=AsyncMock,
            return_value=fake_freshness,
        ):
            resp = await client.get("/api/v1/data/health")

    assert resp.status_code == 200
    data = resp.json()
    assert "datasets" in data
    assert "quality_alerts" in data
    assert isinstance(data["datasets"], list)
    assert len(data["datasets"]) > 0
    # Each dataset entry should have a key
    assert all("key" in ds for ds in data["datasets"])


@pytest.mark.asyncio
async def test_live_check_violations(client):
    """GET /api/v1/data/live-check with valid dataset returns records."""
    fake_result = {
        "records": [{"address": "123 N MAIN ST", "violation_date": "2025-06-01"}],
        "count": 1,
    }

    with patch(
        "backend.app.routers.data.live_record_check",
        new_callable=AsyncMock,
        return_value=fake_result,
    ):
        resp = await client.get(
            "/api/v1/data/live-check",
            params={"dataset": "violations", "address": "123 N Main", "since": "2025-01-01"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 1
    assert len(data["records"]) == 1


@pytest.mark.asyncio
async def test_live_check_unknown_dataset_returns_400(client):
    """GET /api/v1/data/live-check with unknown dataset returns 400."""
    resp = await client.get(
        "/api/v1/data/live-check",
        params={"dataset": "nonexistent", "address": "123 N Main", "since": "2025-01-01"},
    )

    assert resp.status_code == 400
    assert "Unknown dataset" in resp.json()["detail"]
