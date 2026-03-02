"""
Tests for backend.app.services.address — pure function + async resolution tests.
"""

import pytest
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

from backend.app.services.address import _normalize_pin, _build_result, resolve_address


class TestNormalizePin:
    def test_valid_14_digits(self):
        assert _normalize_pin("12345678901234") == "12345678901234"

    def test_strips_dashes(self):
        assert _normalize_pin("12-34-567-890-1234") == "12345678901234"

    def test_too_short(self):
        assert _normalize_pin("12345") is None

    def test_too_long(self):
        assert _normalize_pin("123456789012345") is None

    def test_none_input(self):
        assert _normalize_pin(None) is None

    def test_empty_string(self):
        assert _normalize_pin("") is None


class TestBuildResult:
    def test_basic_result(self):
        row = {
            "location_sk": 1,
            "full_address_standardized": "100 N STATE ST 60602",
            "house_number": "100",
            "street_direction": "N",
            "street_name": "STATE",
            "street_type": "ST",
            "zip": "60602",
            "lat": 41.88,
            "lon": -87.63,
        }
        result = _build_result(row, "EXACT_ADDRESS", parcel_id="12345678901234")
        assert result["resolved"] is True
        assert result["match_confidence"] == "EXACT_ADDRESS"
        assert result["location_sk"] == 1
        assert result["parcel_id"] == "12345678901234"
        assert result["warning"] is None

    def test_no_parcel(self):
        row = {
            "location_sk": 2,
            "full_address_standardized": "200 W LAKE ST 60606",
            "house_number": "200",
            "street_name": "LAKE",
            "zip": "60606",
            "lat": None,
            "lon": None,
        }
        result = _build_result(row, "STREET_ZIP")
        assert result["resolved"] is True
        assert result["parcel_id"] is None


# ── Helper for sequential fetchrow returns ──────────────────────────────────

class SequentialConnection:
    """FakeConnection that returns different values on successive fetchrow calls."""

    def __init__(self, returns):
        self._returns = list(returns)
        self._call_idx = 0

    async def fetchrow(self, query, *args):
        if self._call_idx < len(self._returns):
            val = self._returns[self._call_idx]
        else:
            val = None
        self._call_idx += 1
        return val

    async def fetch(self, query, *args):
        return []

    async def fetchval(self, query, *args):
        return None


def _make_loc_row(location_sk=1, addr="3500 N HOYNE AVE", parcel_id=None):
    return {
        "location_sk": location_sk,
        "full_address_standardized": addr,
        "house_number": "3500",
        "street_direction": "N",
        "street_name": "HOYNE",
        "street_type": "AVE",
        "zip": "60618",
        "lat": 41.95,
        "lon": -87.68,
        "parcel_id": parcel_id,
    }


def _patch_conn(conn):
    @asynccontextmanager
    async def _get_conn():
        yield conn
    return patch("backend.app.services.address.get_conn", _get_conn)


class TestResolveAddressTier2:
    """Tests for the split Tier 2 (2a/2b/2c) resolution."""

    @pytest.mark.asyncio
    async def test_street_only_matches_tier2a(self):
        """Street-only input matches on Tier 2a."""
        conn = SequentialConnection([_make_loc_row()])
        with _patch_conn(conn):
            result = await resolve_address("3500 N HOYNE AVE")
        assert result["resolved"] is True
        assert result["location_sk"] == 1
        assert result["match_confidence"] == "EXACT_ADDRESS"

    @pytest.mark.asyncio
    async def test_full_address_resolves_via_street_only_tier2a(self):
        """Full address with city/zip still resolves via street-only Tier 2a."""
        # Tier 2a (street-only) finds the record on first fetchrow
        conn = SequentialConnection([_make_loc_row()])
        with _patch_conn(conn):
            result = await resolve_address("3500 N HOYNE AVE, CHICAGO IL 60618")
        assert result["resolved"] is True
        assert result["location_sk"] == 1
        assert result["match_confidence"] == "EXACT_ADDRESS"

    @pytest.mark.asyncio
    async def test_tier2b_full_form_when_no_street_only(self):
        """Tier 2b fires when street-only has no match but full form does."""
        row = _make_loc_row(location_sk=99, addr="3500 N HOYNE AVE CHICAGO IL 60618")
        # Tier 2a miss, Tier 2b hit
        conn = SequentialConnection([None, row])
        with _patch_conn(conn):
            result = await resolve_address("3500 N HOYNE AVE, CHICAGO IL 60618")
        assert result["resolved"] is True
        assert result["location_sk"] == 99
        assert result["match_confidence"] == "EXACT_ADDRESS"

    @pytest.mark.asyncio
    async def test_tier2c_component_match(self):
        """Tier 2c component match fires when neither standardized form matches."""
        row = _make_loc_row(location_sk=77)
        # Tier 2a miss, Tier 2b miss, Tier 2c hit
        conn = SequentialConnection([None, None, row])
        with _patch_conn(conn):
            result = await resolve_address("3500 N HOYNE AVE, CHICAGO IL 60618")
        assert result["resolved"] is True
        assert result["location_sk"] == 77
        assert result["match_confidence"] == "COMPONENT_MATCH"
