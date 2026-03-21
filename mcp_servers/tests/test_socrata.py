"""
Tests for mcp_servers.common.socrata.SocrataClient.

These tests mock requests.Session to avoid real HTTP calls.
"""

from __future__ import annotations

from unittest.mock import patch, MagicMock

import pytest


def _make_client():
    """Create a SocrataClient with mocked settings."""
    mock_settings = MagicMock()
    mock_settings.socrata_app_token = None

    with patch("mcp_servers.common.config.settings", mock_settings):
        from mcp_servers.common.socrata import SocrataClient
        client = SocrataClient(base_url="https://data.example.com", app_token=None)
    return client


class TestSocrataQuery:

    def test_builds_correct_url_and_params(self):
        client = _make_client()

        mock_resp = MagicMock()
        mock_resp.json.return_value = [{"id": "1", "address": "123 MAIN"}]
        mock_resp.raise_for_status = MagicMock()

        with patch.object(client.session, "get", return_value=mock_resp) as mock_get:
            result = client.query("abcd-1234", where="status='OPEN'", limit=10)

        mock_get.assert_called_once()
        call_args = mock_get.call_args
        assert "abcd-1234.json" in call_args[0][0]
        assert call_args[1]["params"]["$where"] == "status='OPEN'"
        assert call_args[1]["params"]["$limit"] == 10
        assert len(result) == 1

    def test_count_parses_result(self):
        client = _make_client()

        mock_resp = MagicMock()
        mock_resp.json.return_value = [{"cnt": "42"}]
        mock_resp.raise_for_status = MagicMock()

        with patch.object(client.session, "get", return_value=mock_resp):
            count = client.count("abcd-1234", where="status='OPEN'")

        assert count == 42

    def test_metadata_returns_structure(self):
        client = _make_client()

        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "id": "abcd-1234",
            "name": "Test Dataset",
            "rowsUpdatedAt": 1700000000,
            "columns": [{"name": "id"}, {"name": "address"}],
        }
        mock_resp.raise_for_status = MagicMock()

        with patch.object(client.session, "get", return_value=mock_resp):
            meta = client.metadata("abcd-1234")

        assert meta["name"] == "Test Dataset"
        assert "columns" in meta
