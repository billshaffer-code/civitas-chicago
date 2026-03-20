"""
CIVITAS – Tests for the extracted report generation service.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch, MagicMock
from uuid import UUID

import pytest


LOCATION_ROW = {
    "location_sk": 42,
    "full_address_standardized": "123 N MAIN ST",
    "house_number": "123",
    "street_direction": "N",
    "street_name": "MAIN",
    "street_type": "ST",
    "zip": "60601",
    "lat": 41.8781,
    "lon": -87.6298,
}

SCORE = {"raw_score": 55, "activity_level": "ACTIVE"}

FLAGS = [
    {
        "flag_code": "ACTIVE_MUNICIPAL_VIOLATION",
        "category": "A",
        "description": "Open building violations",
        "severity_score": 25,
        "supporting_count": 3,
        "action_group": "Review Recommended",
    }
]

RECORDS = {
    "violations": [],
    "inspections": [],
    "permits": [],
    "tax_liens": [],
    "service_311": [],
    "vacant_buildings": [],
}


def _make_conn(fetchrow_return=None, fetch_return=None, fetchval_return=None):
    conn = AsyncMock()
    conn.fetchrow = AsyncMock(return_value=fetchrow_return)
    conn.fetch = AsyncMock(return_value=fetch_return or [])
    conn.fetchval = AsyncMock(return_value=fetchval_return)
    conn.execute = AsyncMock(return_value="INSERT 0 1")
    return conn


@pytest.fixture
def mock_deps():
    conn = _make_conn(fetchrow_return=LOCATION_ROW)

    @asynccontextmanager
    async def _get_conn():
        yield conn

    patches = [
        patch("backend.app.services.report.get_conn", _get_conn),
        patch("backend.app.services.report.rule_engine"),
        patch("backend.app.services.report.build_claude_payload", return_value={}),
        patch("backend.app.services.report.generate_narrative", new_callable=AsyncMock, return_value="Test narrative"),
    ]
    mocks = [p.start() for p in patches]
    rule_eng = mocks[1]
    rule_eng.get_score_and_flags = AsyncMock(return_value=(SCORE, FLAGS))
    rule_eng.get_all_supporting_records = AsyncMock(return_value=RECORDS)
    rule_eng.get_score = AsyncMock(return_value=SCORE)
    rule_eng.get_flags = AsyncMock(return_value=FLAGS)
    rule_eng.get_violations = AsyncMock(return_value=[])
    rule_eng.get_inspections = AsyncMock(return_value=[])
    rule_eng.get_permits = AsyncMock(return_value=[])
    rule_eng.get_tax_liens = AsyncMock(return_value=[])
    rule_eng.get_311_requests = AsyncMock(return_value=[])
    rule_eng.get_vacant_buildings = AsyncMock(return_value=[])
    rule_eng.get_data_freshness = AsyncMock(return_value={"violations_as_of": "2025-01-10"})

    yield conn, rule_eng

    # Clear report cache between tests
    from backend.app.services.report import clear_report_cache
    clear_report_cache()

    for p in patches:
        p.stop()


async def test_generate_single_report_returns_valid_dict(mock_deps):
    from backend.app.services.report import generate_single_report

    report = await generate_single_report(
        location_sk=42,
        address="123 N MAIN ST",
        user_id=UUID("00000000-0000-0000-0000-000000000001"),
    )

    assert report["activity_score"] == 55
    assert report["activity_level"] == "ACTIVE"
    assert report["property"]["address"] == "123 N MAIN ST"
    assert report["ai_summary"] == "Test narrative"
    assert len(report["triggered_flags"]) == 1
    assert "report_id" in report
    assert "disclaimer" in report
    assert "baselines" in report


async def test_generate_single_report_missing_location(mock_deps):
    conn, _ = mock_deps
    conn.fetchrow = AsyncMock(return_value=None)

    from backend.app.services.report import generate_single_report

    with pytest.raises(ValueError, match="not found"):
        await generate_single_report(
            location_sk=999,
            address="UNKNOWN",
            user_id=UUID("00000000-0000-0000-0000-000000000001"),
        )


async def test_generate_single_report_stores_audit(mock_deps):
    conn, _ = mock_deps

    from backend.app.services.report import generate_single_report

    await generate_single_report(
        location_sk=42,
        address="123 N MAIN ST",
        user_id=UUID("00000000-0000-0000-0000-000000000001"),
    )

    # execute should be called for the INSERT INTO report_audit
    assert conn.execute.await_count >= 1
    call_args = conn.execute.call_args_list[-1]
    assert "report_audit" in call_args[0][0]


async def test_generate_single_report_uses_parallel_queries(mock_deps):
    """Verify that get_score_and_flags and get_all_supporting_records are called."""
    _, rule_eng = mock_deps

    from backend.app.services.report import generate_single_report

    await generate_single_report(
        location_sk=42,
        address="123 N MAIN ST",
        user_id=UUID("00000000-0000-0000-0000-000000000001"),
        skip_narrative=True,
    )

    rule_eng.get_score_and_flags.assert_awaited_once_with(42)
    rule_eng.get_all_supporting_records.assert_awaited_once_with(42)
    rule_eng.get_data_freshness.assert_awaited_once()


async def test_generate_single_report_cache_hit(mock_deps):
    """Second call for same location_sk should use cached data."""
    conn, rule_eng = mock_deps

    from backend.app.services.report import generate_single_report

    r1 = await generate_single_report(
        location_sk=42,
        address="123 N MAIN ST",
        user_id=UUID("00000000-0000-0000-0000-000000000001"),
        skip_narrative=True,
    )
    r2 = await generate_single_report(
        location_sk=42,
        address="123 N MAIN ST",
        user_id=UUID("00000000-0000-0000-0000-000000000001"),
        skip_narrative=True,
    )

    # Both reports should have same data but different IDs
    assert r1["report_id"] != r2["report_id"]
    assert r1["activity_score"] == r2["activity_score"]

    # Rule engine should only be called once (second call uses cache)
    assert rule_eng.get_score_and_flags.await_count == 1
    assert rule_eng.get_all_supporting_records.await_count == 1
