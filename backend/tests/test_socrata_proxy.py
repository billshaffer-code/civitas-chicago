"""
Unit tests for backend.app.services.socrata_proxy module.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.app.services.socrata_proxy import (
    _cache,
    _sanitize,
    get_assessment_history,
    get_dataset_freshness,
    live_record_check,
    search_parcels_by_address,
    verify_parcel,
)


@pytest.fixture(autouse=True)
def clear_cache():
    """Clear the module-level TTL cache between tests."""
    _cache.clear()
    yield
    _cache.clear()


# ── _sanitize() ─────────────────────────────────────────────────────────────

class TestSanitize:
    def test_escapes_single_quotes(self):
        assert _sanitize("O'Brien") == "O''Brien"

    def test_multiple_single_quotes(self):
        assert _sanitize("it's a 'test'") == "it''s a ''test''"

    def test_strips_control_characters(self):
        assert _sanitize("hello\x00world\x1f") == "helloworld"
        assert _sanitize("tab\ttoo") == "tabtoo"

    def test_preserves_normal_text(self):
        assert _sanitize("123 N MAIN ST") == "123 N MAIN ST"

    def test_combined_quotes_and_control_chars(self):
        assert _sanitize("O'Brien\x00") == "O''Brien"


# ── get_assessment_history() ─────────────────────────────────────────────────

class TestGetAssessmentHistory:
    @pytest.mark.asyncio
    async def test_happy_path_returns_rows(self):
        fake_rows = [{"pin": "1234567890", "tax_year": "2024", "certified_total": "250000"}]

        mock_response = MagicMock()
        mock_response.json.return_value = fake_rows
        mock_response.raise_for_status = MagicMock()

        mock_client_instance = AsyncMock()
        mock_client_instance.get.return_value = mock_response
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=False)

        with patch("backend.app.services.socrata_proxy.httpx.AsyncClient", return_value=mock_client_instance):
            result = await get_assessment_history("12-34-567-890-0000")

        assert result == fake_rows
        mock_client_instance.get.assert_called_once()
        # Verify the PIN was cleaned (dashes removed, truncated to 10)
        call_kwargs = mock_client_instance.get.call_args
        params = call_kwargs.kwargs.get("params") or call_kwargs[1].get("params")
        assert "1234567890" in params["$where"]

    @pytest.mark.asyncio
    async def test_caching_returns_cached_on_second_call(self):
        fake_rows = [{"pin": "1234567890", "tax_year": "2024"}]

        mock_response = MagicMock()
        mock_response.json.return_value = fake_rows
        mock_response.raise_for_status = MagicMock()

        mock_client_instance = AsyncMock()
        mock_client_instance.get.return_value = mock_response
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=False)

        with patch("backend.app.services.socrata_proxy.httpx.AsyncClient", return_value=mock_client_instance):
            result1 = await get_assessment_history("1234567890")
            result2 = await get_assessment_history("1234567890")

        assert result1 == result2 == fake_rows
        # Only one HTTP call should have been made (second was cached)
        assert mock_client_instance.get.call_count == 1


# ── search_parcels_by_address() ──────────────────────────────────────────────

class TestSearchParcelsByAddress:
    @pytest.mark.asyncio
    async def test_address_is_sanitized_in_where_clause(self):
        fake_rows = [{"pin": "1234567890", "property_address": "123 N O'BRIEN ST"}]

        mock_response = MagicMock()
        mock_response.json.return_value = fake_rows
        mock_response.raise_for_status = MagicMock()

        mock_client_instance = AsyncMock()
        mock_client_instance.get.return_value = mock_response
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=False)

        with patch("backend.app.services.socrata_proxy.httpx.AsyncClient", return_value=mock_client_instance):
            result = await search_parcels_by_address("123 O'Brien St")

        assert result == fake_rows
        call_kwargs = mock_client_instance.get.call_args
        params = call_kwargs.kwargs.get("params") or call_kwargs[1].get("params")
        # The single quote in O'Brien should be escaped to O''Brien
        assert "O''''BRIEN" in params["$where"] or "O''BRIEN" in params["$where"]


# ── verify_parcel() ──────────────────────────────────────────────────────────

class TestVerifyParcel:
    @pytest.mark.asyncio
    async def test_pin_cleaning_removes_dashes(self):
        fake_rows = [{"pin": "1234567890", "tax_year": "2024"}]

        mock_response = MagicMock()
        mock_response.json.return_value = fake_rows
        mock_response.raise_for_status = MagicMock()

        mock_client_instance = AsyncMock()
        mock_client_instance.get.return_value = mock_response
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=False)

        with patch("backend.app.services.socrata_proxy.httpx.AsyncClient", return_value=mock_client_instance):
            result = await verify_parcel("12-34-567-890")

        assert result == fake_rows
        call_kwargs = mock_client_instance.get.call_args
        params = call_kwargs.kwargs.get("params") or call_kwargs[1].get("params")
        assert "1234567890" in params["$where"]

    @pytest.mark.asyncio
    async def test_pin_cleaning_truncates_14_to_10(self):
        fake_rows = [{"pin": "1234567890"}]

        mock_response = MagicMock()
        mock_response.json.return_value = fake_rows
        mock_response.raise_for_status = MagicMock()

        mock_client_instance = AsyncMock()
        mock_client_instance.get.return_value = mock_response
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=False)

        with patch("backend.app.services.socrata_proxy.httpx.AsyncClient", return_value=mock_client_instance):
            await verify_parcel("12345678901234")

        call_kwargs = mock_client_instance.get.call_args
        params = call_kwargs.kwargs.get("params") or call_kwargs[1].get("params")
        # 14-digit PIN should be truncated to first 10 digits
        assert "1234567890" in params["$where"]
        assert "12345678901234" not in params["$where"]


# ── get_dataset_freshness() ──────────────────────────────────────────────────

class TestGetDatasetFreshness:
    @pytest.mark.asyncio
    async def test_known_dataset_returns_result(self):
        fake_meta = {"rowsUpdatedAt": 1700000000}

        mock_response = MagicMock()
        mock_response.json.return_value = fake_meta
        mock_response.raise_for_status = MagicMock()

        mock_client_instance = AsyncMock()
        mock_client_instance.get.return_value = mock_response
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=False)

        with patch("backend.app.services.socrata_proxy.httpx.AsyncClient", return_value=mock_client_instance):
            result = await get_dataset_freshness("violations")

        assert result["dataset"] == "violations"
        assert result["label"] == "Building Violations"
        assert result["rows_updated_at"] == 1700000000
        assert "age_hours" in result
        assert "rows_updated_iso" in result

    @pytest.mark.asyncio
    async def test_unknown_dataset_returns_error(self):
        result = await get_dataset_freshness("nonexistent")
        assert "error" in result
        assert "Unknown dataset" in result["error"]


# ── live_record_check() ─────────────────────────────────────────────────────

class TestLiveRecordCheck:
    @pytest.mark.asyncio
    async def test_violations_dataset(self):
        fake_rows = [{"address": "123 N MAIN ST", "violation_date": "2025-06-01"}]

        mock_response = MagicMock()
        mock_response.json.return_value = fake_rows
        mock_response.raise_for_status = MagicMock()

        mock_client_instance = AsyncMock()
        mock_client_instance.get.return_value = mock_response
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=False)

        with patch("backend.app.services.socrata_proxy.httpx.AsyncClient", return_value=mock_client_instance):
            result = await live_record_check("violations", "123 N Main St", "2025-01-01")

        assert result["count"] == 1
        assert result["records"] == fake_rows

    @pytest.mark.asyncio
    async def test_unknown_dataset_returns_error(self):
        result = await live_record_check("nonexistent", "123 N Main St", "2025-01-01")
        assert "error" in result
        assert result["records"] == []
