"""
CIVITAS – Batch/Portfolio analysis router.

POST /api/v1/batch/upload       Accept CSV, create batch_job + items
GET  /api/v1/batch/{id}/stream  SSE endpoint — process each item, stream progress
GET  /api/v1/batch/{id}         Return full batch summary
GET  /api/v1/batch/my-batches   Return user's batch list
"""

from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse

from backend.app.database import get_conn
from backend.app.dependencies import get_current_user
from backend.app.schemas.batch import (
    BatchItemStatus,
    BatchListItem,
    BatchSummary,
    BatchUploadResponse,
)
from backend.app.services.address import resolve_address
from backend.app.services.auth import decode_token, get_user_by_id
from backend.app.services.report import generate_single_report

router = APIRouter(prefix="/api/v1/batch", tags=["batch"])

MAX_ROWS = 50

# Column names we recognise (case-insensitive)
ADDRESS_COLUMNS = {"address", "property_address", "full_address", "street_address"}


def _find_address_column(headers: list[str]) -> Optional[str]:
    for h in headers:
        if h.strip().lower() in ADDRESS_COLUMNS:
            return h
    return None


# ── Upload CSV ──────────────────────────────────────────────────────────────

@router.post("/upload", response_model=BatchUploadResponse)
async def upload_batch(
    file: UploadFile = File(...),
    batch_name: Optional[str] = Query(default=None),
    user: dict = Depends(get_current_user),
):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted")

    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV has no headers")

    addr_col = _find_address_column(list(reader.fieldnames))
    if addr_col is None:
        raise HTTPException(
            status_code=400,
            detail="CSV must contain an address column (address, property_address, full_address, or street_address)",
        )

    rows = []
    for i, row in enumerate(reader):
        addr = (row.get(addr_col) or "").strip()
        if addr:
            rows.append(addr)
        if len(rows) > MAX_ROWS:
            raise HTTPException(
                status_code=400,
                detail=f"CSV exceeds maximum of {MAX_ROWS} rows",
            )

    if not rows:
        raise HTTPException(status_code=400, detail="CSV contains no valid addresses")

    # Create batch_job + items
    async with get_conn() as conn:
        batch_row = await conn.fetchrow(
            """
            INSERT INTO batch_job (user_id, batch_name, total_count)
            VALUES ($1, $2, $3)
            RETURNING batch_id
            """,
            user["user_id"],
            batch_name or file.filename,
            len(rows),
        )
        batch_id = str(batch_row["batch_id"])

        for idx, addr in enumerate(rows):
            await conn.execute(
                """
                INSERT INTO batch_job_item (batch_id, row_index, input_address)
                VALUES ($1, $2, $3)
                """,
                batch_row["batch_id"],
                idx,
                addr,
            )

    return BatchUploadResponse(
        batch_id=batch_id,
        batch_name=batch_name or file.filename,
        total_count=len(rows),
    )


# ── SSE Stream ──────────────────────────────────────────────────────────────

@router.get("/{batch_id}/stream")
async def stream_batch(
    batch_id: str,
    token: str = Query(...),
):
    """
    SSE endpoint that processes each batch item sequentially.
    Uses ?token= query param because EventSource can't send headers.
    """
    # Validate JWT from query param
    payload = decode_token(token)
    if payload is None or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = await get_user_by_id(UUID(payload["sub"]))
    if user is None or not user.get("is_active", False):
        raise HTTPException(status_code=401, detail="User not found or inactive")

    user_id = user["user_id"]

    # Verify batch belongs to user
    async with get_conn() as conn:
        batch = await conn.fetchrow(
            "SELECT * FROM batch_job WHERE batch_id = $1 AND user_id = $2",
            batch_id,
            user_id,
        )
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    async def event_generator():
        async with get_conn() as conn:
            items = await conn.fetch(
                """
                SELECT item_id, row_index, input_address
                FROM batch_job_item
                WHERE batch_id = $1
                ORDER BY row_index
                """,
                batch_id,
            )

        completed = 0
        failed = 0

        for item in items:
            row_index = item["row_index"]
            item_id = item["item_id"]
            input_address = item["input_address"]

            # Emit processing event
            yield f"data: {json.dumps({'type': 'processing', 'row_index': row_index})}\n\n"

            try:
                # Update item status to processing
                async with get_conn() as conn:
                    await conn.execute(
                        "UPDATE batch_job_item SET status = 'processing', updated_at = NOW() WHERE item_id = $1",
                        item_id,
                    )

                # Resolve address
                resolution = await resolve_address(input_address)
                if not resolution["resolved"]:
                    raise ValueError(
                        resolution.get("warning") or "Address could not be resolved"
                    )

                location_sk = resolution["location_sk"]
                resolved_address = resolution["full_address"] or input_address

                # Generate report
                report = await generate_single_report(
                    location_sk=location_sk,
                    address=resolved_address,
                    user_id=user_id,
                )

                # Update item as completed
                async with get_conn() as conn:
                    await conn.execute(
                        """
                        UPDATE batch_job_item
                        SET status = 'completed', location_sk = $2,
                            report_id = $3, updated_at = NOW()
                        WHERE item_id = $1
                        """,
                        item_id,
                        location_sk,
                        report["report_id"],
                    )

                completed += 1

                yield f"data: {json.dumps({'type': 'completed', 'row_index': row_index, 'report_id': report['report_id'], 'risk_score': report['risk_score'], 'risk_tier': report['risk_tier'], 'flag_count': len(report['triggered_flags'])})}\n\n"

            except Exception as exc:
                error_msg = str(exc)[:500]
                async with get_conn() as conn:
                    await conn.execute(
                        """
                        UPDATE batch_job_item
                        SET status = 'failed', error_message = $2, updated_at = NOW()
                        WHERE item_id = $1
                        """,
                        item_id,
                        error_msg,
                    )
                failed += 1

                yield f"data: {json.dumps({'type': 'failed', 'row_index': row_index, 'error': error_msg})}\n\n"

        # Update batch job as completed
        async with get_conn() as conn:
            await conn.execute(
                """
                UPDATE batch_job
                SET status = 'completed', completed_count = $2,
                    failed_count = $3, completed_at = NOW()
                WHERE batch_id = $1
                """,
                batch_id,
                completed,
                failed,
            )

        yield f"data: {json.dumps({'type': 'done', 'completed': completed, 'failed': failed})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── Get batch summary ──────────────────────────────────────────────────────

@router.get("/my-batches", response_model=List[BatchListItem])
async def my_batches(
    user: dict = Depends(get_current_user),
    limit: int = Query(default=20, ge=1, le=100),
):
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT batch_id, batch_name, total_count, completed_count,
                   failed_count, status, created_at
            FROM batch_job
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2
            """,
            user["user_id"],
            limit,
        )
    return [
        BatchListItem(
            batch_id=str(r["batch_id"]),
            batch_name=r["batch_name"],
            total_count=r["total_count"],
            completed_count=r["completed_count"],
            failed_count=r["failed_count"],
            status=r["status"],
            created_at=r["created_at"].isoformat() if hasattr(r["created_at"], "isoformat") else str(r["created_at"]),
        )
        for r in rows
    ]


@router.get("/{batch_id}", response_model=BatchSummary)
async def get_batch(
    batch_id: str,
    user: dict = Depends(get_current_user),
):
    async with get_conn() as conn:
        batch = await conn.fetchrow(
            "SELECT * FROM batch_job WHERE batch_id = $1 AND user_id = $2",
            batch_id,
            user["user_id"],
        )
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    async with get_conn() as conn:
        items = await conn.fetch(
            """
            SELECT i.row_index, i.input_address, i.status,
                   i.report_id, i.error_message,
                   ra.risk_score, ra.risk_tier,
                   (SELECT COUNT(*) FROM jsonb_array_elements(ra.flags_json)) AS flag_count
            FROM batch_job_item i
            LEFT JOIN report_audit ra ON ra.report_id = i.report_id::text
            WHERE i.batch_id = $1
            ORDER BY i.row_index
            """,
            batch_id,
        )

    item_list = []
    scores = []
    tiers: dict[str, int] = {}

    for it in items:
        risk_score = it["risk_score"]
        risk_tier = it["risk_tier"]
        fc = it["flag_count"] if it["flag_count"] is not None else None

        item_list.append(
            BatchItemStatus(
                row_index=it["row_index"],
                input_address=it["input_address"],
                status=it["status"],
                report_id=str(it["report_id"]) if it["report_id"] else None,
                risk_score=risk_score,
                risk_tier=risk_tier,
                flag_count=fc,
                error_message=it["error_message"],
            )
        )

        if risk_score is not None:
            scores.append(risk_score)
        if risk_tier:
            tiers[risk_tier] = tiers.get(risk_tier, 0) + 1

    avg_score = round(sum(scores) / len(scores), 1) if scores else None

    return BatchSummary(
        batch_id=str(batch["batch_id"]),
        batch_name=batch["batch_name"],
        total_count=batch["total_count"],
        completed_count=batch["completed_count"],
        failed_count=batch["failed_count"],
        status=batch["status"],
        created_at=batch["created_at"].isoformat() if hasattr(batch["created_at"], "isoformat") else str(batch["created_at"]),
        completed_at=batch["completed_at"].isoformat() if batch["completed_at"] and hasattr(batch["completed_at"], "isoformat") else None,
        items=item_list,
        avg_risk_score=avg_score,
        tier_distribution=tiers,
    )
