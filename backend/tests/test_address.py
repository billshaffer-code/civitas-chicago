"""
Tests for backend.app.services.address — pure function tests.
"""

import pytest

from backend.app.services.address import _normalize_pin, _build_result


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
