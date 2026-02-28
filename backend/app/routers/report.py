"""
CIVITAS – Report generation and retrieval router.

POST /api/v1/report/generate
  Body:     { "location_sk": int, "address": str }
  Query:    ?format=json|pdf
  Response: ReportResponse (JSON) or PDF bytes

GET /api/v1/report/{report_id}
  Response: full ReportResponse JSON from report_audit

GET /api/v1/report/{report_id}/pdf
  Response: application/pdf generated from stored report JSON
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from backend.app.database import get_conn
from backend.app.schemas.report import ReportHistoryItem, ReportRequest, ReportResponse
from backend.app.services import rule_engine
from backend.app.services.claude_ai import build_claude_payload, generate_narrative
from backend.app.services.pdf import generate_pdf

router = APIRouter(prefix="/api/v1/report", tags=["report"])


@router.post("/generate")
async def generate_report(
    body: ReportRequest,
    format: str = Query(default="json", regex="^(json|pdf)$"),
):
    # ── 1. Validate location_sk ─────────────────────────────────────────────
    async with get_conn() as conn:
        loc = await conn.fetchrow(
            "SELECT * FROM dim_location WHERE location_sk = $1",
            body.location_sk,
        )
    if not loc:
        raise HTTPException(status_code=404, detail="location_sk not found")

    location_row = dict(loc)

    # ── 2. Rule engine ──────────────────────────────────────────────────────
    score  = await rule_engine.get_score(body.location_sk)
    flags  = await rule_engine.get_flags(body.location_sk)

    # ── 3. Supporting records ───────────────────────────────────────────────
    violations  = await rule_engine.get_violations(body.location_sk)
    inspections = await rule_engine.get_inspections(body.location_sk)
    permits     = await rule_engine.get_permits(body.location_sk)
    tax_liens   = await rule_engine.get_tax_liens(body.location_sk)

    # ── 4. Data freshness ───────────────────────────────────────────────────
    freshness = await rule_engine.get_data_freshness()

    # ── 5. Claude narrative ─────────────────────────────────────────────────
    claude_payload = build_claude_payload(
        location_row=location_row,
        score=score,
        flags=flags,
        violations=violations,
        inspections=inspections,
        permits=permits,
        tax_liens=tax_liens,
        freshness=freshness,
        match_confidence=body.address,
    )
    narrative = await generate_narrative(claude_payload)

    # ── 6. Assemble report dict ─────────────────────────────────────────────
    report_id = str(uuid.uuid4())
    now_iso   = datetime.now(timezone.utc).isoformat()

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

    # ── 7. Audit log (store full report JSON) ───────────────────────────────
    async with get_conn() as conn:
        await conn.execute(
            """
            INSERT INTO report_audit
                (report_id, query_address, location_sk,
                 match_confidence, risk_score, risk_tier, flags_json, report_json)
            VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)
            """,
            report_id, body.address, body.location_sk,
            "EXACT_ADDRESS",
            score.get("raw_score", 0),
            score.get("risk_tier", "LOW"),
            json.dumps(flags),
            json.dumps(report),
        )

    # ── 8. Return ────────────────────────────────────────────────────────────
    if format == "pdf":
        pdf_bytes = generate_pdf(report)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="civitas_{report_id}.pdf"'
            },
        )

    return report


@router.get("/history", response_model=List[ReportHistoryItem])
async def report_history(location_sk: int = Query(...)):
    """Return previous reports for a given location."""
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT report_id, query_address, risk_score, risk_tier, created_at
            FROM report_audit
            WHERE location_sk = $1
            ORDER BY created_at DESC
            LIMIT 20
            """,
            location_sk,
        )
    return [
        ReportHistoryItem(
            report_id=r["report_id"],
            query_address=r["query_address"],
            risk_score=r["risk_score"],
            risk_tier=r["risk_tier"],
            generated_at=r["created_at"].isoformat() if hasattr(r["created_at"], "isoformat") else str(r["created_at"]),
        )
        for r in rows
    ]


@router.get("/{report_id}")
async def get_report(report_id: str):
    """Retrieve a previously generated report by ID."""
    async with get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT report_json FROM report_audit WHERE report_id = $1",
            report_id,
        )
    if not row or not row["report_json"]:
        raise HTTPException(status_code=404, detail="Report not found")
    # asyncpg returns JSONB as a str — parse it before FastAPI re-serializes
    raw = row["report_json"]
    return json.loads(raw) if isinstance(raw, str) else raw


@router.get("/{report_id}/pdf")
async def get_report_pdf(report_id: str):
    """Generate a PDF from a previously stored report."""
    async with get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT report_json FROM report_audit WHERE report_id = $1",
            report_id,
        )
    if not row or not row["report_json"]:
        raise HTTPException(status_code=404, detail="Report not found")

    raw = row["report_json"]
    report = json.loads(raw) if isinstance(raw, str) else dict(raw)
    pdf_bytes = generate_pdf(report)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="civitas_{report_id}.pdf"'
        },
    )
