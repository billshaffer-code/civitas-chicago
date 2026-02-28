"""
CIVITAS – Claude AI narrative generation service.

Claude receives structured JSON containing property metadata, triggered flags,
risk score, and supporting records. It returns only a professional narrative.

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

log = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are a municipal risk analyst for CIVITAS, preparing property risk summaries \
for real estate professionals.

STRICT RULES:
1. Only cite facts explicitly provided in the structured JSON input.
2. Do NOT invent, infer, or speculate about records not present in the input.
3. Do NOT provide legal advice, closing recommendations, or transaction guidance.
4. Do NOT recalculate the risk score or override triggered flag codes.
5. Do NOT make probabilistic or predictive statements about future risk.
6. Reference specific FLAG_CODEs and their underlying data counts.
7. Use formal, professionally cautious language.
8. Close every summary with this exact sentence:
   "This report does not constitute legal advice or a title examination."

OUTPUT STRUCTURE (3–5 paragraphs):
- Para 1: Property overview, risk tier, risk score.
- Para 2: Active enforcement findings (Cat A/B flags), or note absence.
- Para 3: Regulatory friction findings (Cat C flags), or note absence.
- Para 4: Tax and financial risk findings (Cat D flags), or note absence.
- Para 5: Data scope statement and required disclaimer.
"""


async def generate_narrative(payload: dict) -> str:
    """
    Call Claude with the structured report payload and return the narrative string.
    Uses temperature=0 for deterministic output.
    """
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    user_msg = (
        "Generate a CIVITAS property risk narrative based on the following "
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
        "risk_score": score.get("raw_score", 0),
        "risk_tier": score.get("risk_tier", "LOW"),
        "triggered_flags": [
            {
                "flag_code": f["flag_code"],
                "category": f["category"],
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
