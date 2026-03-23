"""
CIVITAS – Report generation service.

Extracted from routers/report.py for reuse by batch processing.
"""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from datetime import datetime, timezone

from backend.app.constants import CATEGORY_ACTIONS, TIER_LABELS
from backend.app.database import get_conn
from backend.app.services import rule_engine
from backend.app.services.baselines import CHICAGO_BASELINES
from backend.app.services.claude_ai import build_claude_payload, generate_narrative
from backend.app.services.neighborhood import get_neighborhood_baselines


# ── Report cache ────────────────────────────────────────────────────────────────
# In-memory TTL cache keyed by location_sk.  Reports change only on ETL
# ingestion (infrequent), so a short TTL avoids redundant heavy queries when the
# same property is searched multiple times in quick succession.

_report_cache: dict[int, tuple[float, dict]] = {}
_CACHE_TTL_SECONDS = 300  # 5 minutes


def _cache_get(location_sk: int) -> dict | None:
    entry = _report_cache.get(location_sk)
    if entry and (time.monotonic() - entry[0]) < _CACHE_TTL_SECONDS:
        return entry[1]
    # Expired — remove
    _report_cache.pop(location_sk, None)
    return None


def _cache_set(location_sk: int, report: dict) -> None:
    _report_cache[location_sk] = (time.monotonic(), report)


def clear_report_cache() -> None:
    """Clear the entire report cache (useful after ETL runs)."""
    _report_cache.clear()


# ── Normalization ───────────────────────────────────────────────────────────────


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


# ── Report generation ──────────────────────────────────────────────────────────


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

    # ── 2. Check cache ────────────────────────────────────────────────────────
    cached = _cache_get(location_sk)
    if cached:
        # Reuse cached report data but mint a new report_id and audit row
        report = {**cached}
        report["report_id"] = str(uuid.uuid4())
        report["generated_at"] = datetime.now(timezone.utc).isoformat()
        report["pdf_url"] = f"/api/v1/report/{report['report_id']}/pdf"

        # Re-generate narrative if requested
        if not skip_narrative:
            claude_payload = build_claude_payload(
                location_row=location_row,
                score={"raw_score": report["activity_score"], "activity_level": report["activity_level"]},
                flags=report["triggered_flags"],
                violations=report["supporting_records"].get("violations", []),
                inspections=report["supporting_records"].get("inspections", []),
                permits=report["supporting_records"].get("permits", []),
                tax_liens=report["supporting_records"].get("tax_liens", []),
                freshness=report.get("data_freshness", {}),
                match_confidence=address,
            )
            report["ai_summary"] = await generate_narrative(claude_payload)
        else:
            report["ai_summary"] = ""

        # Store audit row
        async with get_conn() as conn:
            await conn.execute(
                """
                INSERT INTO report_audit
                    (report_id, query_address, location_sk,
                     match_confidence, risk_score, risk_tier, flags_json, report_json, user_id)
                VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)
                """,
                report["report_id"], address, location_sk,
                "EXACT_ADDRESS",
                report["activity_score"],
                report["activity_level"],
                json.dumps(report["triggered_flags"]),
                json.dumps(report),
                user_id,
            )
        return report

    # ── 3. Rule engine + supporting records (parallelized) ────────────────────
    (score, flags), records, freshness = await asyncio.gather(
        rule_engine.get_score_and_flags(location_sk),
        rule_engine.get_all_supporting_records(location_sk),
        rule_engine.get_data_freshness(),
    )

    # ── 4. Claude narrative (optional) ────────────────────────────────────────
    if skip_narrative:
        narrative = ""
    else:
        claude_payload = build_claude_payload(
            location_row=location_row,
            score=score,
            flags=flags,
            violations=records.get("violations", []),
            inspections=records.get("inspections", []),
            permits=records.get("permits", []),
            tax_liens=records.get("tax_liens", []),
            freshness=freshness,
            match_confidence=address,
        )
        narrative = await generate_narrative(claude_payload)

    # ── 5. Neighborhood baselines ──────────────────────────────────────────────
    ca_id = location_row.get("community_area_id")
    neighborhood_data = None
    if ca_id:
        neighborhood_baselines = await get_neighborhood_baselines(ca_id)
        if neighborhood_baselines:
            # Look up community area name
            async with get_conn() as conn:
                ca_name = await conn.fetchval(
                    "SELECT name FROM dim_community_area WHERE community_area_id = $1",
                    ca_id,
                )
            neighborhood_data = {
                "community_area_id": ca_id,
                "community_area_name": ca_name,
                "baselines": neighborhood_baselines,
            }

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
        "supporting_records": records,
        "ai_summary": narrative,
        "data_freshness": {
            **freshness,
            "report_generated_at": now_iso,
        },
        "pdf_url": f"/api/v1/report/{report_id}/pdf",
        "baselines": CHICAGO_BASELINES,
        "neighborhood": neighborhood_data,
        "disclaimer": (
            "This report does not constitute legal advice or a title examination. "
            "It is based solely on structured municipal data as of the dates noted "
            "and must not be used as a substitute for formal title review."
        ),
    }

    # ── 7. Cache the report data ──────────────────────────────────────────────
    _cache_set(location_sk, report)

    # ── 8. Audit log (store full report JSON) ─────────────────────────────────
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
