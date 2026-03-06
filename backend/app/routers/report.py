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
from backend.app.schemas.report import ReportHistoryItem, ReportRequest, ReportResponse
from backend.app.services.pdf import generate_pdf
from backend.app.services.report import generate_single_report, normalize_report

router = APIRouter(prefix="/api/v1/report", tags=["report"])


@router.post("/generate")
async def generate_report(
    body: ReportRequest,
    format: str = Query(default="json", pattern="^(json|pdf)$"),
    user: dict = Depends(get_current_user),
):
    try:
        report = await generate_single_report(
            location_sk=body.location_sk,
            address=body.address,
            user_id=user.get("user_id"),
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

    return report


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
            SELECT report_id, query_address, risk_score, risk_tier, generated_at
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
            SELECT report_id, query_address, risk_score, risk_tier, generated_at
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
        )
        for r in rows
    ]


@router.get("/{report_id}")
async def get_report(report_id: str, user: dict = Depends(get_current_user)):
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
    report = json.loads(raw) if isinstance(raw, str) else raw
    return normalize_report(report)


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
    pdf_bytes = generate_pdf(report)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="civitas_{report_id}.pdf"'
        },
    )
