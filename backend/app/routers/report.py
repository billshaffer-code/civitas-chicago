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
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from backend.app.constants import TIER_LABELS
from backend.app.database import get_conn
from backend.app.dependencies import get_current_user
from backend.app.schemas.report import ReportHistoryItem, ReportRequest
from fastapi.responses import StreamingResponse

from backend.app.services.pdf import generate_pdf
from backend.app.services.report import (
    generate_report_brief,
    generate_report_pdf_narrative,
    generate_report_summary,
    generate_single_report,
    normalize_report,
)

router = APIRouter(prefix="/api/v1/report", tags=["report"])


@router.post("/generate")
async def generate_report(
    body: ReportRequest,
    format: str = Query(default="json", pattern="^(json|pdf)$"),
    user: dict = Depends(get_current_user),
):
    # PDF needs the full report including narrative
    skip_narrative = format != "pdf"
    try:
        report = await generate_single_report(
            location_sk=body.location_sk,
            address=body.address,
            user_id=user.get("user_id"),
            skip_narrative=skip_narrative,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    if format == "pdf":
        pdf_bytes = generate_pdf(report)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="civitas_{report["report_id"]}.pdf"'
            },
        )

    # Enrich with geo fields so the map works without a separate lookup
    async with get_conn() as conn:
        loc = await conn.fetchrow(
            """SELECT l.lat, l.lon, p.parcel_id
               FROM dim_location l
               LEFT JOIN dim_parcel p ON p.location_sk = l.location_sk
               WHERE l.location_sk = $1""",
            body.location_sk,
        )
    if loc:
        report["location_sk"] = body.location_sk
        if loc["lat"] is not None:
            report["lat"] = float(loc["lat"])
        if loc["lon"] is not None:
            report["lon"] = float(loc["lon"])
        if loc["parcel_id"]:
            report["parcel_id"] = loc["parcel_id"]

    return report


@router.get("/{report_id}/summary")
async def get_report_summary(
    report_id: str,
    user: dict = Depends(get_current_user),
):
    """Generate (or retrieve) the AI narrative for a report."""
    try:
        summary = await generate_report_summary(report_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error("Summary generation failed: %s", exc)
        return {"ai_summary": "", "error": "summary_failed", "message": str(exc)}
    return {"ai_summary": summary}


@router.get("/{report_id}/summary/stream")
async def stream_report_summary(
    report_id: str,
    token: str = Query(...),
):
    """Stream the AI narrative via SSE for progressive rendering."""
    from backend.app.services.auth import decode_token, get_user_by_id
    from backend.app.services.claude_ai import build_claude_payload, generate_narrative_stream
    from uuid import UUID

    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await get_user_by_id(UUID(payload["sub"]))
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")

    # Load report
    row = await _load_report_row(report_id)
    report = json.loads(row["report_json"]) if isinstance(row["report_json"], str) else dict(row["report_json"])

    if report.get("ai_summary"):
        # Already generated — send it all at once
        async def send_cached():
            yield f"data: {json.dumps({'type': 'chunk', 'text': report['ai_summary']})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        return StreamingResponse(send_cached(), media_type="text/event-stream")

    # Build payload
    loc = await _load_location_row(row["location_sk"])
    score = {"raw_score": report.get("activity_score", 0), "activity_level": report.get("activity_level", "QUIET")}
    records = report.get("supporting_records", {})
    claude_payload = build_claude_payload(
        location_row=loc,
        score=score,
        flags=report.get("triggered_flags", []),
        violations=records.get("violations", []),
        inspections=records.get("inspections", []),
        permits=records.get("permits", []),
        tax_liens=records.get("tax_liens", []),
        freshness=report.get("data_freshness", {}),
        match_confidence=report.get("match_confidence", ""),
        neighborhood=report.get("neighborhood"),
    )

    async def event_stream():
        full_text = []
        async for chunk in generate_narrative_stream(claude_payload):
            full_text.append(chunk)
            yield f"data: {json.dumps({'type': 'chunk', 'text': chunk})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

        # Persist the full narrative
        narrative = "".join(full_text)
        report["ai_summary"] = narrative
        async with get_conn() as conn:
            await conn.execute(
                "UPDATE report_audit SET report_json = $1::jsonb WHERE report_id = $2",
                json.dumps(report),
                report_id,
            )

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/{report_id}/brief")
async def get_report_brief(
    report_id: str,
    user: dict = Depends(get_current_user),
):
    """Generate (or retrieve) a short executive brief for a report."""
    try:
        brief = await generate_report_brief(report_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        return {"executive_brief": ""}
    return {"executive_brief": brief}


@router.post("/compare-summary")
async def compare_summary(
    body: dict,
    user: dict = Depends(get_current_user),
):
    """Generate a comparative AI narrative across multiple reports."""
    from backend.app.services.claude_ai import generate_comparative_narrative

    report_ids = body.get("report_ids", [])
    if len(report_ids) < 2:
        raise HTTPException(status_code=400, detail="At least 2 report IDs required")

    property_summaries = []
    for rid in report_ids[:5]:  # Cap at 5
        async with get_conn() as conn:
            row = await conn.fetchrow(
                "SELECT report_json FROM report_audit WHERE report_id = $1",
                rid,
            )
        if not row:
            continue
        raw = row["report_json"]
        report = json.loads(raw) if isinstance(raw, str) else dict(raw)
        property_summaries.append({
            "address": report.get("property", {}).get("address", ""),
            "activity_score": report.get("activity_score", 0),
            "activity_level": report.get("activity_level", "QUIET"),
            "finding_count": len(report.get("triggered_flags", [])),
            "triggered_flags": [
                {"flag_code": f.get("flag_code"), "action_group": f.get("action_group"), "severity_score": f.get("severity_score")}
                for f in report.get("triggered_flags", [])
            ],
            "total_violations": sum(1 for _ in report.get("supporting_records", {}).get("violations", [])),
            "total_liens": sum(1 for _ in report.get("supporting_records", {}).get("tax_liens", [])),
        })

    if len(property_summaries) < 2:
        raise HTTPException(status_code=404, detail="Could not load enough reports")

    narrative = await generate_comparative_narrative(property_summaries)
    return {"comparative_summary": narrative}


async def _load_report_row(report_id: str):
    async with get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT report_json, location_sk FROM report_audit WHERE report_id = $1",
            report_id,
        )
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    return row


async def _load_location_row(location_sk: int) -> dict:
    async with get_conn() as conn:
        loc = await conn.fetchrow(
            "SELECT * FROM dim_location WHERE location_sk = $1",
            location_sk,
        )
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    return dict(loc)


def _normalize_tier(tier: str) -> str:
    """Map old tier names (LOW/MODERATE/ELEVATED/HIGH) to new activity levels."""
    return TIER_LABELS.get(tier, tier)


@router.get("/history", response_model=List[ReportHistoryItem])
async def report_history(
    location_sk: int = Query(...),
    user: dict = Depends(get_current_user),
):
    """Return previous reports for a given location (filtered to current user)."""
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT report_id, query_address, risk_score, risk_tier, generated_at,
                   coalesce(jsonb_array_length(report_json->'triggered_flags'), 0) AS flags_count
            FROM report_audit
            WHERE location_sk = $1 AND user_id = $2
            ORDER BY generated_at DESC
            LIMIT 20
            """,
            location_sk,
            user["user_id"],
        )
    return [
        ReportHistoryItem(
            report_id=str(r["report_id"]),
            query_address=r["query_address"],
            activity_score=r["risk_score"],
            activity_level=_normalize_tier(r["risk_tier"]),
            generated_at=r["generated_at"].isoformat() if hasattr(r["generated_at"], "isoformat") else str(r["generated_at"]),
            flags_count=r["flags_count"],
        )
        for r in rows
    ]


@router.get("/my-reports", response_model=List[ReportHistoryItem])
async def my_reports(
    user: dict = Depends(get_current_user),
    limit: int = Query(default=20, ge=1, le=100),
):
    """Return the current user's recent reports across all properties."""
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT report_id, query_address, risk_score, risk_tier, generated_at,
                   coalesce(jsonb_array_length(report_json->'triggered_flags'), 0) AS flags_count
            FROM report_audit
            WHERE user_id = $1
            ORDER BY generated_at DESC
            LIMIT $2
            """,
            user["user_id"],
            limit,
        )
    return [
        ReportHistoryItem(
            report_id=str(r["report_id"]),
            query_address=r["query_address"],
            activity_score=r["risk_score"],
            activity_level=_normalize_tier(r["risk_tier"]),
            generated_at=r["generated_at"].isoformat() if hasattr(r["generated_at"], "isoformat") else str(r["generated_at"]),
            flags_count=r["flags_count"],
        )
        for r in rows
    ]


@router.get("/{report_id}")
async def get_report(report_id: str, user: dict = Depends(get_current_user)):
    """Retrieve a previously generated report by ID."""
    async with get_conn() as conn:
        row = await conn.fetchrow(
            """SELECT ra.report_json, ra.location_sk,
                      l.lat, l.lon, l.full_address_standardized,
                      p.parcel_id
               FROM report_audit ra
               LEFT JOIN dim_location l ON l.location_sk = ra.location_sk
               LEFT JOIN dim_parcel p ON p.location_sk = ra.location_sk
               WHERE ra.report_id = $1""",
            report_id,
        )
    if not row or not row["report_json"]:
        raise HTTPException(status_code=404, detail="Report not found")
    # asyncpg returns JSONB as a str — parse it before FastAPI re-serializes
    raw = row["report_json"]
    report = json.loads(raw) if isinstance(raw, str) else raw
    report = normalize_report(report)
    # Enrich with geo and identity fields for map/assessment features
    report["location_sk"] = row["location_sk"]
    if row["lat"] is not None:
        report["lat"] = float(row["lat"])
    if row["lon"] is not None:
        report["lon"] = float(row["lon"])
    if row["parcel_id"]:
        report["parcel_id"] = row["parcel_id"]
    return report


@router.get("/{report_id}/pdf")
async def get_report_pdf(
    report_id: str,
    view: str = Query(default="detail", pattern="^(detail|client)$"),
    user: dict = Depends(get_current_user),
):
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
    report = normalize_report(report)
    if view == "client":
        report["_view"] = "client"
    # Generate formal PDF narrative if not already present
    if not report.get("pdf_narrative") and report.get("ai_summary"):
        try:
            pdf_narr = await generate_report_pdf_narrative(report_id)
            report["pdf_narrative"] = pdf_narr
        except Exception:
            pass
    pdf_bytes = generate_pdf(report)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="civitas_{report_id}.pdf"'
        },
    )
