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
    mock_report = {
        "report_id": "test-001",
        "generated_at": "2025-01-15T12:00:00+00:00",
        "property": {"address": "123 N MAIN ST", "zip": "60601", "city": "Chicago", "state": "IL"},
        "match_confidence": "EXACT_ADDRESS",
        "risk_score": 55,
        "risk_tier": "ELEVATED",
        "triggered_flags": [],
        "supporting_records": {"violations": [], "inspections": [], "permits": [], "tax_liens": [], "service_311": [], "vacant_buildings": []},
        "ai_summary": "AI narrative text.",
        "data_freshness": {"report_generated_at": "2025-01-15T12:00:00+00:00"},
        "pdf_url": "/api/v1/report/test-001/pdf",
        "disclaimer": "Test disclaimer.",
    }

    with patch(
        "backend.app.routers.report.generate_single_report",
        new_callable=AsyncMock,
        return_value=mock_report,
    ):
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
