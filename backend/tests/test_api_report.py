"""
Tests for /api/v1/report endpoints.
"""

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch
import json

import pytest

from tests.conftest import FakeConnection


@pytest.mark.asyncio
async def test_generate_report_json(client, sample_report):
    conn = FakeConnection(
        fetchrow_return={
            "location_sk": 42,
            "full_address_standardized": "123 N MAIN ST 60601",
            "zip": "60601",
        },
    )

    @asynccontextmanager
    async def _get_conn():
        yield conn

    p1 = patch("backend.app.routers.report.get_conn", _get_conn)
    p2 = patch("backend.app.routers.report.rule_engine")
    p3 = patch(
        "backend.app.routers.report.generate_narrative",
        new_callable=AsyncMock,
        return_value="AI narrative text.",
    )

    with p1, p2 as mock_engine, p3:
        mock_engine.get_score = AsyncMock(return_value={"raw_score": 55, "risk_tier": "ELEVATED"})
        mock_engine.get_flags = AsyncMock(return_value=[])
        mock_engine.get_violations = AsyncMock(return_value=[])
        mock_engine.get_inspections = AsyncMock(return_value=[])
        mock_engine.get_permits = AsyncMock(return_value=[])
        mock_engine.get_tax_liens = AsyncMock(return_value=[])
        mock_engine.get_data_freshness = AsyncMock(return_value={
            "violations_as_of": "2025-01-10",
            "inspections_as_of": "2025-01-10",
            "permits_as_of": "2025-01-10",
            "tax_liens_as_of": "2025-01-10",
        })

        resp = await client.post(
            "/api/v1/report/generate",
            json={"location_sk": 42, "address": "123 N MAIN ST"},
            params={"format": "json"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["risk_tier"] == "ELEVATED"
    assert data["ai_summary"] == "AI narrative text."


@pytest.mark.asyncio
async def test_get_report_found(client, sample_report):
    conn = FakeConnection(fetchrow_return={"report_json": json.dumps(sample_report)})

    @asynccontextmanager
    async def _get_conn():
        yield conn

    with patch("backend.app.routers.report.get_conn", _get_conn):
        resp = await client.get("/api/v1/report/test-report-001")

    assert resp.status_code == 200
    assert resp.json()["report_id"] == "test-report-001"


@pytest.mark.asyncio
async def test_get_report_not_found(client):
    conn = FakeConnection(fetchrow_return=None)

    @asynccontextmanager
    async def _get_conn():
        yield conn

    with patch("backend.app.routers.report.get_conn", _get_conn):
        resp = await client.get("/api/v1/report/nonexistent")

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_report_history(client):
    from datetime import datetime

    rows = [
        {
            "report_id": "r1",
            "query_address": "123 N MAIN ST",
            "risk_score": 55,
            "risk_tier": "ELEVATED",
            "generated_at": datetime(2025, 1, 15, 12, 0, 0),
        }
    ]
    conn = FakeConnection(fetch_return=rows)

    @asynccontextmanager
    async def _get_conn():
        yield conn

    with patch("backend.app.routers.report.get_conn", _get_conn):
        resp = await client.get("/api/v1/report/history", params={"location_sk": 42})

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["report_id"] == "r1"


@pytest.mark.asyncio
async def test_report_history_empty(client):
    conn = FakeConnection(fetch_return=[])

    @asynccontextmanager
    async def _get_conn():
        yield conn

    with patch("backend.app.routers.report.get_conn", _get_conn):
        resp = await client.get("/api/v1/report/history", params={"location_sk": 999})

    assert resp.status_code == 200
    assert resp.json() == []
