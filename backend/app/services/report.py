"""
CIVITAS – Report generation service.

Extracted from routers/report.py for reuse by batch processing.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from backend.app.constants import CATEGORY_ACTIONS, TIER_LABELS
from backend.app.database import get_conn
from backend.app.services import rule_engine
from backend.app.services.baselines import CHICAGO_BASELINES
from backend.app.services.claude_ai import build_claude_payload, generate_narrative


def normalize_report(report: dict) -> dict:
    """
    Translate old stored reports (risk_score/risk_tier) to new terminology.
    Idempotent — safe to call on already-normalized reports.
    """
    # Rename top-level fields
    if "risk_score" in report and "activity_score" not in report:
        report["activity_score"] = report.pop("risk_score")
    if "risk_tier" in report and "activity_level" not in report:
        old_tier = report.pop("risk_tier")
        report["activity_level"] = TIER_LABELS.get(old_tier, old_tier)

    # Normalize flags
    for flag in report.get("triggered_flags", []):
        if "action_group" not in flag or not flag["action_group"]:
            flag["action_group"] = CATEGORY_ACTIONS.get(flag.get("category", ""), "")

    # Add baselines if missing
    if "baselines" not in report:
        report["baselines"] = CHICAGO_BASELINES

    return report


async def generate_single_report(
    location_sk: int, address: str, user_id, *, skip_narrative: bool = False
) -> dict:
    """
    Generate a full report for a single property and store it in report_audit.

    If skip_narrative=True, the ai_summary field is set to "" and the Claude
    call is skipped.  Use generate_report_summary() to fill it in later.

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

    # ── 5. Claude narrative (optional) ────────────────────────────────────────
    if skip_narrative:
        narrative = ""
    else:
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
        "activity_score": score.get("raw_score", 0),
        "activity_level": score.get("activity_level", "QUIET"),
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
        "baselines": CHICAGO_BASELINES,
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
            score.get("activity_level", "QUIET"),
            json.dumps(flags),
            json.dumps(report),
            user_id,
        )

    return report


async def generate_report_summary(report_id: str) -> str:
    """
    Generate the AI narrative for an existing report that was created with
    skip_narrative=True.  Updates the stored report_audit row and returns
    the narrative text.
    """
    # ── 1. Load the stored report ─────────────────────────────────────────────
    async with get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT report_json, location_sk FROM report_audit WHERE report_id = $1",
            report_id,
        )
    if not row:
        raise ValueError(f"report_id {report_id} not found")

    raw = row["report_json"]
    report = json.loads(raw) if isinstance(raw, str) else dict(raw)

    # If summary already exists, return it
    if report.get("ai_summary"):
        return report["ai_summary"]

    # ── 2. Load location row for Claude payload ──────────────────────────────
    location_sk = row["location_sk"]
    async with get_conn() as conn:
        loc = await conn.fetchrow(
            "SELECT * FROM dim_location WHERE location_sk = $1",
            location_sk,
        )
    if not loc:
        raise ValueError(f"location_sk {location_sk} not found")

    location_row = dict(loc)

    # ── 3. Build payload from stored report data ─────────────────────────────
    score = {
        "raw_score": report.get("activity_score", 0),
        "activity_level": report.get("activity_level", "QUIET"),
    }
    flags = report.get("triggered_flags", [])
    records = report.get("supporting_records", {})
    freshness = report.get("data_freshness", {})

    claude_payload = build_claude_payload(
        location_row=location_row,
        score=score,
        flags=flags,
        violations=records.get("violations", []),
        inspections=records.get("inspections", []),
        permits=records.get("permits", []),
        tax_liens=records.get("tax_liens", []),
        freshness=freshness,
        match_confidence=report.get("match_confidence", ""),
    )
    narrative = await generate_narrative(claude_payload)

    # ── 4. Update stored report ──────────────────────────────────────────────
    report["ai_summary"] = narrative
    async with get_conn() as conn:
        await conn.execute(
            "UPDATE report_audit SET report_json = $1::jsonb WHERE report_id = $2",
            json.dumps(report),
            report_id,
        )

    return narrative
