"""
CIVITAS – Report generation service.

Extracted from routers/report.py for reuse by batch processing.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from backend.app.database import get_conn
from backend.app.services import rule_engine
from backend.app.services.claude_ai import build_claude_payload, generate_narrative


async def generate_single_report(location_sk: int, address: str, user_id) -> dict:
    """
    Generate a full report for a single property and store it in report_audit.

    Returns the assembled report dict.
    """
    # ── 1. Validate location_sk ───────────────────────────────────────────────
    async with get_conn() as conn:
        loc = await conn.fetchrow(
            "SELECT * FROM dim_location WHERE location_sk = $1",
            location_sk,
        )
    if not loc:
        raise ValueError(f"location_sk {location_sk} not found")

    location_row = dict(loc)

    # ── 2. Rule engine ────────────────────────────────────────────────────────
    score = await rule_engine.get_score(location_sk)
    flags = await rule_engine.get_flags(location_sk)

    # ── 3. Supporting records ─────────────────────────────────────────────────
    violations = await rule_engine.get_violations(location_sk)
    inspections = await rule_engine.get_inspections(location_sk)
    permits = await rule_engine.get_permits(location_sk)
    tax_liens = await rule_engine.get_tax_liens(location_sk)
    service_311 = await rule_engine.get_311_requests(location_sk)
    vacant_buildings = await rule_engine.get_vacant_buildings(location_sk)

    # ── 4. Data freshness ─────────────────────────────────────────────────────
    freshness = await rule_engine.get_data_freshness()

    # ── 5. Claude narrative ───────────────────────────────────────────────────
    claude_payload = build_claude_payload(
        location_row=location_row,
        score=score,
        flags=flags,
        violations=violations,
        inspections=inspections,
        permits=permits,
        tax_liens=tax_liens,
        freshness=freshness,
        match_confidence=address,
    )
    narrative = await generate_narrative(claude_payload)

    # ── 6. Assemble report dict ───────────────────────────────────────────────
    report_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    report = {
        "report_id": report_id,
        "generated_at": now_iso,
        "property": {
            "address": location_row.get("full_address_standardized"),
            "zip": location_row.get("zip"),
            "city": "Chicago",
            "state": "IL",
        },
        "match_confidence": "EXACT_ADDRESS",
        "risk_score": score.get("raw_score", 0),
        "risk_tier": score.get("risk_tier", "LOW"),
        "triggered_flags": flags,
        "supporting_records": {
            "violations": violations,
            "inspections": inspections,
            "permits": permits,
            "tax_liens": tax_liens,
            "service_311": service_311,
            "vacant_buildings": vacant_buildings,
        },
        "ai_summary": narrative,
        "data_freshness": {
            **freshness,
            "report_generated_at": now_iso,
        },
        "pdf_url": f"/api/v1/report/{report_id}/pdf",
        "disclaimer": (
            "This report does not constitute legal advice or a title examination. "
            "It is based solely on structured municipal data as of the dates noted "
            "and must not be used as a substitute for formal title review."
        ),
    }

    # ── 7. Audit log (store full report JSON) ─────────────────────────────────
    async with get_conn() as conn:
        await conn.execute(
            """
            INSERT INTO report_audit
                (report_id, query_address, location_sk,
                 match_confidence, risk_score, risk_tier, flags_json, report_json, user_id)
            VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)
            """,
            report_id, address, location_sk,
            "EXACT_ADDRESS",
            score.get("raw_score", 0),
            score.get("risk_tier", "LOW"),
            json.dumps(flags),
            json.dumps(report),
            user_id,
        )

    return report
