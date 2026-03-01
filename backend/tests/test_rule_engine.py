"""
Tests for backend.app.services.rule_engine — mocked DB layer.
"""

from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest

from tests.conftest import FakeConnection


def _patch_conn(conn):
    @asynccontextmanager
    async def _get_conn():
        yield conn
    return patch("backend.app.services.rule_engine.get_conn", _get_conn)


class TestGetScore:
    @pytest.mark.asyncio
    async def test_with_data(self):
        from backend.app.services.rule_engine import get_score

        conn = FakeConnection(fetchrow_return={
            "raw_score": 55,
            "risk_tier": "ELEVATED",
            "flag_count": 2,
            "triggered_flags": ["A", "B"],
        })
        with _patch_conn(conn):
            result = await get_score(1)
        assert result["raw_score"] == 55
        assert result["risk_tier"] == "ELEVATED"

    @pytest.mark.asyncio
    async def test_no_data_defaults(self):
        from backend.app.services.rule_engine import get_score

        conn = FakeConnection(fetchrow_return=None)
        with _patch_conn(conn):
            result = await get_score(999)
        assert result["raw_score"] == 0
        assert result["risk_tier"] == "LOW"


class TestGetFlags:
    @pytest.mark.asyncio
    async def test_with_flags(self):
        from backend.app.services.rule_engine import get_flags

        conn = FakeConnection(fetch_return=[
            {"flag_code": "ACTIVE_MUNICIPAL_VIOLATION", "category": "A",
             "description": "Open violations", "severity_score": 25, "supporting_count": 3}
        ])
        with _patch_conn(conn):
            result = await get_flags(1)
        assert len(result) == 1
        assert result[0]["flag_code"] == "ACTIVE_MUNICIPAL_VIOLATION"

    @pytest.mark.asyncio
    async def test_empty(self):
        from backend.app.services.rule_engine import get_flags

        conn = FakeConnection(fetch_return=[])
        with _patch_conn(conn):
            result = await get_flags(999)
        assert result == []


class TestGetDataFreshness:
    @pytest.mark.asyncio
    async def test_returns_formatted(self):
        from backend.app.services.rule_engine import get_data_freshness
        from datetime import datetime

        ts = datetime(2025, 1, 10, 0, 0, 0)
        conn = FakeConnection(fetch_return=[
            {"source_dataset": "building_violations", "latest": ts},
            {"source_dataset": "food_inspections", "latest": ts},
            {"source_dataset": "building_permits", "latest": ts},
            {"source_dataset": "cook_county_tax_liens", "latest": ts},
        ])
        with _patch_conn(conn):
            result = await get_data_freshness()
        assert result["violations_as_of"] == "2025-01-10T00:00:00"
        assert result["tax_liens_as_of"] == "2025-01-10T00:00:00"
