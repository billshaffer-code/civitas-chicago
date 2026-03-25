"""
CIVITAS – Claude AI narrative generation service.

Claude receives structured JSON containing property metadata, triggered findings,
activity score, and supporting records. It returns only a professional narrative.

Constraints (enforced via system prompt):
- Never invent missing records
- Never recalculate scores
- Never provide legal advice
- Never make predictions or closing recommendations
- Cite structured findings only
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime
from typing import AsyncIterator, Optional

import anthropic
import httpx

from backend.app.config import settings
from backend.app.constants import CATEGORY_ACTIONS

log = logging.getLogger(__name__)

# ── System Prompts ──────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """\
You are a municipal data analyst for CIVITAS, preparing property activity summaries \
for real estate professionals.

STRICT RULES:
1. Only cite facts explicitly provided in the structured JSON input.
2. Do NOT invent, infer, or speculate about records not present in the input.
3. Do NOT provide legal advice, closing recommendations, or transaction guidance.
4. Do NOT recalculate the activity score or override triggered findings.
5. Do NOT make probabilistic or predictive statements about future outcomes.
6. Reference specific finding codes and their underlying data counts.
7. Use formal, professionally neutral language. Avoid alarming or sensational terms.
8. Close with the exact disclaimer sentence shown below.
9. If neighborhood_context is provided, reference the community area by name and \
compare the property's metrics to neighborhood averages where the data supports it \
(e.g., "2.5x the Lincoln Park average for violations"). Only make comparisons \
grounded in the provided numbers.

OUTPUT FORMAT — use these exact Markdown section headers:

## Overview
Property overview in 1–2 concise sentences: address, activity level, activity score, \
total number of findings. Set context without repeating the raw data.

## Review Items
Summarize Review Recommended and Worth Noting findings. Reference specific finding \
codes and supporting counts. If none, write: "No items require review at this time."

## Informational Context
Summarize Informational findings — permits, 311 requests, inspection history. Provide \
context on what these mean for the property. If none, write: "No additional informational context."

## Action Items
Summarize Action Required findings (tax liens, financial items). Be specific about \
amounts and years. If none, write: "No action items identified."

## Data Scope
One sentence on data coverage (which datasets, freshness dates), then this exact sentence: \
"This report does not constitute legal advice or a title examination."
"""

EXECUTIVE_BRIEF_PROMPT = """\
You are a municipal data analyst for CIVITAS. Write a 2–3 sentence executive brief \
summarizing this property's municipal activity profile.

RULES:
1. Only cite facts from the structured JSON input.
2. Do NOT provide legal advice or speculate.
3. Be concise and factual — this is a quick-glance summary.
4. Mention the activity level, key findings count, and any standout items.
5. If neighborhood_context is provided, include one comparison.
"""

PDF_NARRATIVE_PROMPT = """\
You are a municipal data analyst for CIVITAS, preparing a formal property summary \
for inclusion in a professional report document.

STRICT RULES:
1. Only cite facts explicitly provided in the structured JSON input.
2. Do NOT invent, infer, or speculate about records not present in the input.
3. Do NOT provide legal advice, closing recommendations, or transaction guidance.
4. Do NOT recalculate the activity score or override triggered findings.
5. Do NOT make probabilistic or predictive statements about future outcomes.
6. Use formal, professionally neutral language suitable for a legal or financial document.
7. Address the reader as "the reviewing party."
8. If neighborhood_context is provided, reference the community area by name and \
compare metrics to neighborhood averages where data supports it.
9. Close with this exact sentence: "This report does not constitute legal advice or \
a title examination."

OUTPUT FORMAT:
Write continuous prose in 3–4 paragraphs. Do NOT use Markdown headers, bullet points, \
or lists. Use complete sentences and formal paragraph structure. Cover:
- Property identification and overall activity profile
- Significant findings requiring review or action, with specific codes and counts
- Contextual information (permits, inspections, 311 history)
- Data scope and the closing disclaimer sentence
"""

COMPARATIVE_PROMPT = """\
You are a municipal data analyst for CIVITAS. Compare the following properties and \
highlight relative differences for real estate professionals.

RULES:
1. Only cite facts from the provided property summaries.
2. Do NOT provide legal advice or speculate.
3. Use formal, professionally neutral language.
4. Reference specific differences in scores, finding counts, and activity levels.
5. Keep comparisons grounded in the numbers provided.

OUTPUT FORMAT — use these exact Markdown section headers:

## Comparison Overview
2–3 sentences summarizing the properties compared, score range, and overall profile differences.

## Key Differences
Specific differences in findings, violations, liens, and activity patterns. Reference \
each property by address.

## Common Findings
Any findings or patterns shared across the properties. If none, write: \
"No common findings identified."

## Summary
1–2 sentences with a neutral conclusion. Close with: "This comparison does not \
constitute legal advice or a title examination."
"""

QA_SYSTEM_PROMPT = """\
You are a municipal data analyst for CIVITAS answering follow-up questions about a \
property activity report.

CONTEXT: The full report data is provided in the first message. Use it to answer questions.

STRICT RULES:
1. Only cite facts from the report data provided. Do NOT invent or speculate.
2. Do NOT provide legal advice, closing recommendations, or transaction guidance.
3. Do NOT make probabilistic or predictive statements.
4. Keep answers concise (2–4 sentences unless more detail is specifically requested).
5. If the answer cannot be determined from the provided data, say so explicitly.
6. Use formal, professionally neutral language.
"""

# ── Structured Output Tool Schema ───────────────────────────────────────────────

SUMMARY_SECTIONS_TOOL = {
    "name": "format_summary",
    "description": "Format the property activity summary into structured sections.",
    "input_schema": {
        "type": "object",
        "properties": {
            "overview": {
                "type": "string",
                "description": "1-2 sentence property overview: address, activity level, score, finding count.",
            },
            "review_items": {
                "type": "string",
                "description": "Summary of Review Recommended and Worth Noting findings with codes and counts. 'No items require review at this time.' if none.",
            },
            "informational_context": {
                "type": "string",
                "description": "Summary of permits, 311, inspections. 'No additional informational context.' if none.",
            },
            "action_items": {
                "type": "string",
                "description": "Summary of Action Required findings (tax liens, financial). 'No action items identified.' if none.",
            },
            "data_scope": {
                "type": "string",
                "description": "Data coverage sentence plus: 'This report does not constitute legal advice or a title examination.'",
            },
        },
        "required": ["overview", "review_items", "informational_context", "action_items", "data_scope"],
    },
}


# ── Core Narrative Functions ────────────────────────────────────────────────────


def _build_user_message(payload: dict) -> str:
    return (
        "Generate a CIVITAS property activity summary based on the following "
        "structured findings:\n\n"
        "```json\n"
        + json.dumps(payload, indent=2, default=str)
        + "\n```\n\n"
        "Follow all system prompt rules exactly."
    )


_CLIENT_TIMEOUT = httpx.Timeout(timeout=60.0, connect=10.0)


def _get_client() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=settings.anthropic_api_key, timeout=_CLIENT_TIMEOUT)


def _get_async_client() -> anthropic.AsyncAnthropic:
    return anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key, timeout=_CLIENT_TIMEOUT)


async def generate_narrative(payload: dict) -> str:
    """
    Call Claude with the structured report payload and return the narrative string.
    Retries once on transient errors before returning a fallback.
    """
    user_msg = _build_user_message(payload)

    for attempt in range(settings.narrative_max_retries + 1):
        try:
            client = _get_client()
            response = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=settings.max_narrative_tokens,
                temperature=0,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_msg}],
            )
            if response.content and response.content[0].text:
                return response.content[0].text
            log.warning("Claude returned empty response content")
            return _fallback_narrative()
        except (anthropic.APIConnectionError, anthropic.RateLimitError, anthropic.APIStatusError) as exc:
            log.warning("Claude API error (attempt %d/%d): %s", attempt + 1, settings.narrative_max_retries + 1, exc)
            if attempt < settings.narrative_max_retries:
                await asyncio.sleep(settings.narrative_retry_delay)
                continue
            log.error("Claude API exhausted retries: %s", exc)
            return _fallback_narrative()
        except Exception as exc:
            log.error("Unexpected error calling Claude: %s", exc)
            return _fallback_narrative()

    return _fallback_narrative()


async def generate_narrative_structured(payload: dict) -> dict:
    """
    Call Claude with tool_use to get structured summary sections.
    Falls back to Markdown parsing if tool_use fails.
    """
    user_msg = _build_user_message(payload)

    try:
        client = _get_client()
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=settings.max_narrative_tokens,
            temperature=0,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
            tools=[SUMMARY_SECTIONS_TOOL],
            tool_choice={"type": "tool", "name": "format_summary"},
        )

        # Extract tool use result
        for block in response.content:
            if block.type == "tool_use" and block.name == "format_summary":
                return {"sections": block.input}

        log.warning("No tool_use block in structured response, falling back to text")
    except Exception as exc:
        log.warning("Structured generation failed, falling back to text: %s", exc)

    # Fallback: generate text and parse it
    text = await generate_narrative(payload)
    return {"sections": None, "markdown": text}


async def generate_narrative_stream(payload: dict) -> AsyncIterator[str]:
    """
    Stream the narrative response chunk by chunk using the async Anthropic streaming API.
    Yields text deltas as they arrive without blocking the event loop.
    """
    user_msg = _build_user_message(payload)

    try:
        client = _get_async_client()
        async with client.messages.stream(
            model="claude-sonnet-4-6",
            max_tokens=settings.max_narrative_tokens,
            temperature=0,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
        ) as stream:
            async for text in stream.text_stream:
                yield text
    except Exception as exc:
        log.error("Streaming narrative error: %s", exc)
        yield _fallback_narrative()


async def generate_executive_brief(payload: dict) -> str:
    """
    Generate a short 2–3 sentence executive brief for dashboard/list views.
    """
    user_msg = (
        "Write a 2–3 sentence executive brief for this property:\n\n"
        "```json\n"
        + json.dumps(payload, indent=2, default=str)
        + "\n```"
    )

    for attempt in range(settings.narrative_max_retries + 1):
        try:
            client = _get_client()
            response = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=settings.max_brief_tokens,
                temperature=0,
                system=EXECUTIVE_BRIEF_PROMPT,
                messages=[{"role": "user", "content": user_msg}],
            )
            if response.content and response.content[0].text:
                return response.content[0].text
            return ""
        except (anthropic.APIConnectionError, anthropic.RateLimitError, anthropic.APIStatusError) as exc:
            log.warning("Brief generation error (attempt %d): %s", attempt + 1, exc)
            if attempt < settings.narrative_max_retries:
                await asyncio.sleep(settings.narrative_retry_delay)
                continue
            return ""
        except Exception as exc:
            log.error("Unexpected error generating brief: %s", exc)
            return ""

    return ""


async def generate_pdf_narrative(payload: dict) -> str:
    """
    Generate a formal, letter-style narrative for PDF reports.
    """
    user_msg = (
        "Write a formal property activity summary for a professional report:\n\n"
        "```json\n"
        + json.dumps(payload, indent=2, default=str)
        + "\n```\n\n"
        "Follow all system prompt rules exactly."
    )

    for attempt in range(settings.narrative_max_retries + 1):
        try:
            client = _get_client()
            response = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=settings.max_pdf_narrative_tokens,
                temperature=0,
                system=PDF_NARRATIVE_PROMPT,
                messages=[{"role": "user", "content": user_msg}],
            )
            if response.content and response.content[0].text:
                return response.content[0].text
            return ""
        except Exception as exc:
            log.warning("PDF narrative generation error (attempt %d): %s", attempt + 1, exc)
            if attempt < settings.narrative_max_retries:
                await asyncio.sleep(settings.narrative_retry_delay)
                continue
            return ""

    return ""


async def generate_comparative_narrative(property_summaries: list) -> str:
    """
    Generate a cross-property comparison narrative from multiple property summaries.
    """
    user_msg = (
        "Compare the following properties and highlight relative differences:\n\n"
        "```json\n"
        + json.dumps(property_summaries, indent=2, default=str)
        + "\n```\n\n"
        "Follow all system prompt rules exactly."
    )

    for attempt in range(settings.narrative_max_retries + 1):
        try:
            client = _get_client()
            response = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=settings.max_narrative_tokens,
                temperature=0,
                system=COMPARATIVE_PROMPT,
                messages=[{"role": "user", "content": user_msg}],
            )
            if response.content and response.content[0].text:
                return response.content[0].text
            return ""
        except Exception as exc:
            log.warning("Comparative narrative error (attempt %d): %s", attempt + 1, exc)
            if attempt < settings.narrative_max_retries:
                await asyncio.sleep(settings.narrative_retry_delay)
                continue
            return ""

    return ""


async def ask_report_followup(
    report_data: dict,
    question: str,
    conversation_history: list,
) -> str:
    """
    Answer a follow-up question about a report using the report data as context.
    """
    messages = [
        {
            "role": "user",
            "content": (
                "Here is the full report data for context:\n\n"
                "```json\n"
                + json.dumps(report_data, indent=2, default=str)
                + "\n```\n\n"
                "I will now ask questions about this report."
            ),
        },
        {
            "role": "assistant",
            "content": "I have the report data. Please ask your questions and I'll answer based solely on the data provided.",
        },
    ]

    # Add conversation history
    for msg in conversation_history:
        messages.append({"role": msg["role"], "content": msg["content"]})

    # Add the new question
    messages.append({"role": "user", "content": question})

    try:
        client = _get_client()
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=settings.max_qa_tokens,
            temperature=0,
            system=QA_SYSTEM_PROMPT,
            messages=messages,
        )
        if response.content and response.content[0].text:
            return response.content[0].text
        return "I was unable to generate a response. Please try rephrasing your question."
    except Exception as exc:
        log.error("QA followup error: %s", exc)
        return "AI response temporarily unavailable. The report data and findings remain accessible above."


# ── Payload Builder ──────────────────────────────────────────────────────────────


def build_claude_payload(
    location_row: dict,
    score: dict,
    flags: list,
    violations: list,
    inspections: list,
    permits: list,
    tax_liens: list,
    freshness: dict,
    match_confidence: str,
    neighborhood: Optional[dict] = None,
) -> dict:
    """Assemble the structured input contract sent to Claude."""
    payload = {
        "property": {
            "address": location_row.get("full_address_standardized"),
            "zip": location_row.get("zip"),
            "city": "Chicago",
            "state": "IL",
            "match_confidence": match_confidence,
        },
        "activity_score": score.get("raw_score", 0),
        "activity_level": score.get("activity_level", "QUIET"),
        "triggered_flags": [
            {
                "flag_code": f["flag_code"],
                "category": f["category"],
                "action_group": f.get("action_group") or CATEGORY_ACTIONS.get(f["category"], ""),
                "description": f["description"],
                "severity_score": f["severity_score"],
                "supporting_count": f["supporting_count"],
            }
            for f in flags
        ],
        "supporting_records": {
            "violations": violations[:10],
            "inspections": inspections[:10],
            "permits": permits[:10],
            "tax_liens": tax_liens,
        },
        "data_freshness": {
            **freshness,
            "report_generated_at": datetime.utcnow().isoformat() + "Z",
        },
    }

    if neighborhood:
        payload["neighborhood_context"] = {
            "community_area_name": neighborhood.get("community_area_name", ""),
            "baselines": neighborhood.get("baselines", {}),
        }

    return payload


def _fallback_narrative() -> str:
    """Return a safe fallback when Claude is unavailable."""
    return (
        "## Overview\n"
        "AI summary temporarily unavailable. All report data, findings, and "
        "supporting records are available in the sections above.\n\n"
        "## Data Scope\n"
        "This report does not constitute legal advice or a title examination."
    )
