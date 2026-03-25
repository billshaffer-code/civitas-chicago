"""
Tests for backend.app.services.claude_ai — payload builder + narrative mock.
"""

from unittest.mock import MagicMock, patch

import pytest

from backend.app.services.claude_ai import (
    build_claude_payload,
    generate_narrative,
    generate_executive_brief,
    generate_narrative_structured,
    ask_report_followup,
    _fallback_narrative,
)


class TestBuildClaudePayload:
    def _make_payload(self, **overrides):
        defaults = dict(
            location_row={
                "full_address_standardized": "123 N MAIN ST 60601",
                "zip": "60601",
            },
            score={"raw_score": 55, "activity_level": "ACTIVE"},
            flags=[
                {
                    "flag_code": "ACTIVE_MUNICIPAL_VIOLATION",
                    "category": "A",
                    "action_group": "Review Recommended",
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
        assert "activity_score" in payload
        assert "activity_level" in payload
        assert "triggered_flags" in payload
        assert "supporting_records" in payload
        assert "data_freshness" in payload

    def test_truncates_violations_to_10(self):
        payload = self._make_payload()
        assert len(payload["supporting_records"]["violations"]) == 10

    def test_default_score_when_missing(self):
        payload = self._make_payload(score={})
        assert payload["activity_score"] == 0
        assert payload["activity_level"] == "QUIET"

    def test_flag_structure(self):
        payload = self._make_payload()
        flag = payload["triggered_flags"][0]
        assert flag["flag_code"] == "ACTIVE_MUNICIPAL_VIOLATION"
        assert flag["severity_score"] == 25
        assert flag["action_group"] == "Review Recommended"


    def test_neighborhood_context_included(self):
        payload = self._make_payload(
            neighborhood={
                "community_area_name": "Lincoln Park",
                "baselines": {"avg_violations_per_property": 2.1},
            }
        )
        assert "neighborhood_context" in payload
        assert payload["neighborhood_context"]["community_area_name"] == "Lincoln Park"

    def test_neighborhood_context_absent_when_none(self):
        payload = self._make_payload()
        assert "neighborhood_context" not in payload


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

    @pytest.mark.asyncio
    async def test_retry_on_api_error(self):
        import anthropic as anthropic_mod

        mock_client_instance = MagicMock()
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text="Retry success")]

        # First call raises, second succeeds
        mock_client_instance.messages.create.side_effect = [
            anthropic_mod.APIConnectionError(request=MagicMock()),
            mock_response,
        ]

        with patch("backend.app.services.claude_ai.anthropic.Anthropic", return_value=mock_client_instance):
            with patch("backend.app.services.claude_ai.settings") as mock_settings:
                mock_settings.narrative_max_retries = 1
                mock_settings.narrative_retry_delay = 0.01
                mock_settings.max_narrative_tokens = 800
                mock_settings.anthropic_api_key = "test"
                result = await generate_narrative({"test": "payload"})

        assert result == "Retry success"
        assert mock_client_instance.messages.create.call_count == 2

    @pytest.mark.asyncio
    async def test_fallback_on_exhausted_retries(self):
        import anthropic as anthropic_mod

        mock_client_instance = MagicMock()
        mock_client_instance.messages.create.side_effect = anthropic_mod.APIConnectionError(
            request=MagicMock()
        )

        with patch("backend.app.services.claude_ai.anthropic.Anthropic", return_value=mock_client_instance):
            with patch("backend.app.services.claude_ai.settings") as mock_settings:
                mock_settings.narrative_max_retries = 0
                mock_settings.narrative_retry_delay = 0.01
                mock_settings.max_narrative_tokens = 800
                mock_settings.anthropic_api_key = "test"
                result = await generate_narrative({"test": "payload"})

        assert "temporarily unavailable" in result


class TestGenerateExecutiveBrief:
    @pytest.mark.asyncio
    async def test_returns_brief(self):
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text="Brief summary.")]

        mock_client_instance = MagicMock()
        mock_client_instance.messages.create.return_value = mock_response

        with patch("backend.app.services.claude_ai.anthropic.Anthropic", return_value=mock_client_instance):
            result = await generate_executive_brief({"test": "payload"})

        assert result == "Brief summary."


class TestGenerateNarrativeStructured:
    @pytest.mark.asyncio
    async def test_extracts_tool_use(self):
        tool_block = MagicMock()
        tool_block.type = "tool_use"
        tool_block.name = "format_summary"
        tool_block.input = {"overview": "Test", "review_items": "", "informational_context": "", "action_items": "", "data_scope": ""}

        mock_response = MagicMock()
        mock_response.content = [tool_block]

        mock_client_instance = MagicMock()
        mock_client_instance.messages.create.return_value = mock_response

        with patch("backend.app.services.claude_ai.anthropic.Anthropic", return_value=mock_client_instance):
            result = await generate_narrative_structured({"test": "payload"})

        assert "sections" in result
        assert result["sections"]["overview"] == "Test"


class TestAskReportFollowup:
    @pytest.mark.asyncio
    async def test_returns_answer(self):
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text="The property has 3 violations.")]

        mock_client_instance = MagicMock()
        mock_client_instance.messages.create.return_value = mock_response

        with patch("backend.app.services.claude_ai.anthropic.Anthropic", return_value=mock_client_instance):
            result = await ask_report_followup(
                report_data={"activity_score": 55},
                question="How many violations?",
                conversation_history=[],
            )

        assert result == "The property has 3 violations."

    @pytest.mark.asyncio
    async def test_includes_history_in_messages(self):
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text="Answer.")]

        mock_client_instance = MagicMock()
        mock_client_instance.messages.create.return_value = mock_response

        with patch("backend.app.services.claude_ai.anthropic.Anthropic", return_value=mock_client_instance):
            await ask_report_followup(
                report_data={"test": True},
                question="New question",
                conversation_history=[
                    {"role": "user", "content": "First Q"},
                    {"role": "assistant", "content": "First A"},
                ],
            )

        call_args = mock_client_instance.messages.create.call_args
        messages = call_args.kwargs.get("messages", call_args[1].get("messages", []))
        # 2 setup + 2 history + 1 new question = 5
        assert len(messages) == 5


class TestFallbackNarrative:
    def test_contains_disclaimer(self):
        text = _fallback_narrative()
        assert "temporarily unavailable" in text
        assert "does not constitute legal advice" in text
