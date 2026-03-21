"""
Tests for mcp_servers.civitas_db.server tools.

Requires Python 3.10+ and the `mcp` package. These tests are skipped on
older Python versions (the Docker-based path handles MCP servers).
"""

from __future__ import annotations

import sys
from contextlib import asynccontextmanager
from decimal import Decimal
from unittest.mock import patch, MagicMock

import pytest

# Skip entire module on Python < 3.10 or if mcp is not installed
pytestmark = pytest.mark.skipif(
    sys.version_info < (3, 10),
    reason="civitas_db server requires Python 3.10+ and the mcp package",
)


# ── Helpers ─────────────────────────────────────────────────────────────────

class FakeRecord(dict):
    """Dict subclass that behaves like an asyncpg Record."""
    pass


class FakeConnection:
    """Minimal stand-in for asyncpg.Connection."""

    def __init__(self, fetchrow_return=None, fetch_return=None):
        self.fetchrow_return = fetchrow_return
        self.fetch_return = fetch_return or []

    async def fetchrow(self, query, *args):
        return self.fetchrow_return

    async def fetch(self, query, *args):
        return self.fetch_return

    async def execute(self, query, *args):
        return "OK"


def _get_conn_patch(conn):
    @asynccontextmanager
    async def _get_conn():
        yield conn

    return patch("mcp_servers.common.db.get_conn", _get_conn)


# ── Tests ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
class TestQueryProperty:

    async def test_pin_match(self):
        row = FakeRecord({
            "parcel_sk": 1, "parcel_id": "12345678901234",
            "location_sk": 42, "full_address_standardized": "123 N MAIN ST 60601",
            "house_number": "123", "street_direction": "N",
            "street_name": "MAIN", "street_type": "ST",
            "zip": "60601", "lat": 41.878, "lon": -87.629,
        })
        conn = FakeConnection(fetchrow_return=row)

        with _get_conn_patch(conn):
            from mcp_servers.civitas_db.server import query_property
            result = await query_property("123 N MAIN ST", pin="12-34-567-890-1234")

        assert result["match_confidence"] == "EXACT_PIN"
        assert result["location_sk"] == 42

    async def test_exact_address_match(self):
        row = FakeRecord({
            "location_sk": 42, "full_address_standardized": "123 N MAIN ST 60601",
            "house_number": "123", "street_direction": "N",
            "street_name": "MAIN", "street_type": "ST",
            "zip": "60601", "lat": 41.878, "lon": -87.629,
            "parcel_id": "12345678901234",
        })
        call_count = 0
        async def mock_fetchrow(query, *args):
            nonlocal call_count
            call_count += 1
            if call_count <= 1:
                return None
            return row

        conn = FakeConnection()
        conn.fetchrow = mock_fetchrow

        with _get_conn_patch(conn):
            from mcp_servers.civitas_db.server import query_property
            result = await query_property("123 N MAIN ST 60601")

        assert result["match_confidence"] == "EXACT_ADDRESS"

    async def test_no_match(self):
        conn = FakeConnection(fetchrow_return=None)

        with _get_conn_patch(conn):
            from mcp_servers.civitas_db.server import query_property
            result = await query_property("NONEXISTENT ADDRESS")

        assert result.get("resolved") is False


@pytest.mark.asyncio
class TestGetFlags:

    async def test_returns_list_of_dicts(self):
        rows = [
            FakeRecord({"flag_code": "ACTIVE_MUNICIPAL_VIOLATION", "category": "A",
                         "description": "Open violation", "severity_score": 25,
                         "supporting_count": 3, "action_group": "Review Recommended"}),
        ]
        conn = FakeConnection(fetch_return=rows)

        with _get_conn_patch(conn):
            from mcp_servers.civitas_db.server import get_flags
            result = await get_flags(42)

        assert isinstance(result, list)
        assert result[0]["flag_code"] == "ACTIVE_MUNICIPAL_VIOLATION"


@pytest.mark.asyncio
class TestGetScore:

    async def test_no_data_defaults(self):
        conn = FakeConnection(fetchrow_return=None)

        with _get_conn_patch(conn):
            from mcp_servers.civitas_db.server import get_score
            result = await get_score(999)

        assert result["raw_score"] == 0
        assert result["activity_level"] == "QUIET"


@pytest.mark.asyncio
class TestSearchAddresses:

    async def test_returns_limited_results(self):
        rows = [
            FakeRecord({"location_sk": i, "full_address_standardized": f"{i} N MAIN ST",
                         "house_number": str(i), "street_name": "MAIN",
                         "zip": "60601", "parcel_id": None})
            for i in range(5)
        ]
        conn = FakeConnection(fetch_return=rows)

        with _get_conn_patch(conn):
            from mcp_servers.civitas_db.server import search_addresses
            result = await search_addresses("MAIN", limit=5)

        assert len(result) == 5


@pytest.mark.asyncio
class TestRunSql:

    async def test_rejects_insert(self):
        conn = FakeConnection()

        with _get_conn_patch(conn):
            from mcp_servers.civitas_db.server import run_sql
            result = await run_sql("INSERT INTO dim_location VALUES (1)")

        assert result[0].get("error") is not None
        assert "SELECT" in result[0]["error"]
