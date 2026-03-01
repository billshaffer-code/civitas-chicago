"""
CIVITAS – Shared test fixtures.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
import httpx


# ── Fake asyncpg connection ──────────────────────────────────────────────────

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


# ── Database mock fixture ────────────────────────────────────────────────────

@pytest.fixture
def fake_conn():
    """Return a FakeConnection factory — call with keyword args to configure."""
    return FakeConnection


@pytest.fixture
def mock_get_conn(fake_conn):
    """Patch get_conn to yield a default FakeConnection. Override via fake_conn."""
    conn = fake_conn()

    @asynccontextmanager
    async def _get_conn():
        yield conn

    with patch("backend.app.database.get_conn", _get_conn):
        yield conn


# ── ASGI test client ─────────────────────────────────────────────────────────

@pytest.fixture
async def client():
    """
    httpx AsyncClient wired to the FastAPI app.
    Patches init_pool/close_pool so no real DB is needed.
    """
    with patch("backend.app.main.init_pool", new_callable=AsyncMock):
        with patch("backend.app.main.close_pool", new_callable=AsyncMock):
            from backend.app.main import app

            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
                yield ac


# ── Sample data ──────────────────────────────────────────────────────────────

@pytest.fixture
def sample_location_row():
    return {
        "location_sk": 42,
        "full_address_standardized": "123 N MAIN ST 60601",
        "house_number": "123",
        "street_direction": "N",
        "street_name": "MAIN",
        "street_type": "ST",
        "zip": "60601",
        "lat": 41.8781,
        "lon": -87.6298,
    }


@pytest.fixture
def sample_report():
    return {
        "report_id": "test-report-001",
        "generated_at": "2025-01-15T12:00:00+00:00",
        "property": {
            "address": "123 N MAIN ST 60601",
            "zip": "60601",
            "city": "Chicago",
            "state": "IL",
        },
        "match_confidence": "EXACT_ADDRESS",
        "risk_score": 55,
        "risk_tier": "ELEVATED",
        "triggered_flags": [
            {
                "flag_code": "ACTIVE_MUNICIPAL_VIOLATION",
                "category": "A",
                "description": "One or more open building violations",
                "severity_score": 25,
                "supporting_count": 3,
            },
            {
                "flag_code": "AGED_ENFORCEMENT_RISK",
                "category": "A",
                "description": "Open violation older than 180 days",
                "severity_score": 30,
                "supporting_count": 1,
            },
        ],
        "supporting_records": {
            "violations": [
                {
                    "violation_date": "2024-06-15",
                    "violation_code": "CN070034",
                    "violation_status": "OPEN",
                    "violation_description": "Failure to maintain building",
                    "inspection_status": "FAILED",
                }
            ],
            "inspections": [],
            "permits": [],
            "tax_liens": [],
            "service_311": [],
            "vacant_buildings": [],
        },
        "ai_summary": "The property at 123 N MAIN ST has an ELEVATED risk profile.",
        "data_freshness": {
            "violations_as_of": "2025-01-10T00:00:00",
            "inspections_as_of": "2025-01-10T00:00:00",
            "permits_as_of": "2025-01-10T00:00:00",
            "tax_liens_as_of": "2025-01-10T00:00:00",
            "service_311_as_of": "2025-01-10T00:00:00",
            "vacant_buildings_as_of": "2025-01-10T00:00:00",
            "report_generated_at": "2025-01-15T12:00:00Z",
        },
        "pdf_url": "/api/v1/report/test-report-001/pdf",
        "disclaimer": (
            "This report does not constitute legal advice or a title examination. "
            "It is based solely on structured municipal data as of the dates noted "
            "and must not be used as a substitute for formal title review."
        ),
    }
