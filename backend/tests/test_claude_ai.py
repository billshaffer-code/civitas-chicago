"""
Tests for backend.app.services.claude_ai — payload builder + narrative mock.
"""

from unittest.mock import MagicMock, patch

import pytest

from backend.app.services.claude_ai import build_claude_payload, generate_narrative


class TestBuildClaudePayload:
    def _make_payload(self, **overrides):
        defaults = dict(
            location_row={
                "full_address_standardized": "123 N MAIN ST 60601",
                "zip": "60601",
            },
            score={"raw_score": 55, "risk_tier": "ELEVATED"},
            flags=[
                {
                    "flag_code": "ACTIVE_MUNICIPAL_VIOLATION",
                    "category": "A",
                    "description": "Open violations",
                    "severity_score": 25,
                    "supporting_count": 3,
                }
            ],
            violations=[{"v": i} for i in range(15)],
            inspections=[],
            permits=[],
            tax_liens=[],
            freshness={
                "violations_as_of": "2025-01-10",
                "inspections_as_of": "2025-01-10",
                "permits_as_of": "2025-01-10",
                "tax_liens_as_of": "2025-01-10",
            },
            match_confidence="EXACT_ADDRESS",
        )
        defaults.update(overrides)
        return build_claude_payload(**defaults)

    def test_structure(self):
        payload = self._make_payload()
        assert "property" in payload
        assert "risk_score" in payload
        assert "risk_tier" in payload
        assert "triggered_flags" in payload
        assert "supporting_records" in payload
        assert "data_freshness" in payload

    def test_truncates_violations_to_10(self):
        payload = self._make_payload()
        assert len(payload["supporting_records"]["violations"]) == 10

    def test_default_score_when_missing(self):
        payload = self._make_payload(score={})
        assert payload["risk_score"] == 0
        assert payload["risk_tier"] == "LOW"

    def test_flag_structure(self):
        payload = self._make_payload()
        flag = payload["triggered_flags"][0]
        assert flag["flag_code"] == "ACTIVE_MUNICIPAL_VIOLATION"
        assert flag["severity_score"] == 25


class TestGenerateNarrative:
    @pytest.mark.asyncio
    async def test_calls_anthropic(self):
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text="Test narrative output.")]

        mock_client_instance = MagicMock()
        mock_client_instance.messages.create.return_value = mock_response

        with patch("backend.app.services.claude_ai.anthropic.Anthropic", return_value=mock_client_instance):
            result = await generate_narrative({"test": "payload"})

        assert result == "Test narrative output."
        mock_client_instance.messages.create.assert_called_once()
