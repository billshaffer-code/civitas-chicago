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

import json
import logging
from datetime import datetime

import anthropic

from backend.app.config import settings
from backend.app.constants import CATEGORY_ACTIONS

log = logging.getLogger(__name__)

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


async def generate_narrative(payload: dict) -> str:
    """
    Call Claude with the structured report payload and return the narrative string.
    Uses temperature=0 for deterministic output.
    """
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    user_msg = (
        "Generate a CIVITAS property activity summary based on the following "
        "structured findings:\n\n"
        "```json\n"
        + json.dumps(payload, indent=2, default=str)
        + "\n```\n\n"
        "Follow all system prompt rules exactly."
    )

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=settings.max_narrative_tokens,
        temperature=0,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )

    return response.content[0].text


def build_claude_payload(
    location_row: dict,
    score: dict,
    flags: list[dict],
    violations: list[dict],
    inspections: list[dict],
    permits: list[dict],
    tax_liens: list[dict],
    freshness: dict,
    match_confidence: str,
) -> dict:
    """Assemble the structured input contract sent to Claude."""
    return {
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
