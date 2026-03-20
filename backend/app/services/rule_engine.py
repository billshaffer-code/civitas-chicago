"""
CIVITAS – Rule engine service.

Queries the three SQL view layers and assembles structured report data.
No scoring logic lives in Python – all computation is in the SQL views.
"""

from __future__ import annotations

import asyncio
from typing import Any

from backend.app.database import get_conn


async def get_score_and_flags(location_sk: int) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """
    Fetch score and flags in parallel using separate connections.

    Both views read from the materialized view_property_summary, so running
    them concurrently is safe and avoids sequential latency.
    """
    score_task, flags_task = await asyncio.gather(
        get_score(location_sk),
        get_flags(location_sk),
    )
    return score_task, flags_task


async def get_score(location_sk: int) -> dict[str, Any]:
    """
    Query VIEW_PROPERTY_SCORE for one location.
    Returns score=0, tier=LOW, empty flags if no data exists.
    """
    async with get_conn() as conn:
        row = await conn.fetchrow(
            """
            SELECT raw_score, activity_level, flag_count, triggered_flags
            FROM view_property_score
            WHERE location_sk = $1
            """,
            location_sk,
        )

    if not row:
        return {"raw_score": 0, "activity_level": "QUIET", "flag_count": 0, "triggered_flags": []}

    return dict(row)


async def get_flags(location_sk: int) -> list[dict[str, Any]]:
    """
    Query VIEW_PROPERTY_FLAGS for one location.
    Returns list of triggered flags with full metadata.
    """
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT flag_code, category, description, severity_score,
                   supporting_count, action_group
            FROM view_property_flags
            WHERE location_sk = $1
            ORDER BY category, severity_score DESC
            """,
            location_sk,
        )

    return [_date_dict(r) for r in rows]


async def get_summary(location_sk: int) -> dict[str, Any]:
    """Query VIEW_PROPERTY_SUMMARY for freshness timestamps and counts."""
    async with get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM view_property_summary WHERE location_sk = $1",
            location_sk,
        )
    return dict(row) if row else {}


async def get_all_supporting_records(location_sk: int, limit: int = 50) -> dict[str, list[dict]]:
    """
    Fetch all 6 supporting record types in parallel using asyncio.gather().
    Returns a dict keyed by record type name.
    """
    results = await asyncio.gather(
        get_violations(location_sk, limit),
        get_inspections(location_sk, limit),
        get_permits(location_sk, limit),
        get_tax_liens(location_sk),
        get_311_requests(location_sk, limit),
        get_vacant_buildings(location_sk, limit),
    )
    return {
        "violations": results[0],
        "inspections": results[1],
        "permits": results[2],
        "tax_liens": results[3],
        "service_311": results[4],
        "vacant_buildings": results[5],
    }


async def get_violations(location_sk: int, limit: int = 50) -> list[dict]:
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT violation_date, violation_code, violation_status,
                   violation_description, inspection_status
            FROM fact_violation
            WHERE location_sk = $1
            ORDER BY violation_date DESC NULLS LAST
            LIMIT $2
            """,
            location_sk, limit,
        )
    return [_date_dict(r) for r in rows]


async def get_inspections(location_sk: int, limit: int = 50) -> list[dict]:
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT inspection_date, dba_name, facility_type, risk_level,
                   inspection_type, results
            FROM fact_inspection
            WHERE location_sk = $1
            ORDER BY inspection_date DESC NULLS LAST
            LIMIT $2
            """,
            location_sk, limit,
        )
    return [_date_dict(r) for r in rows]


async def get_permits(location_sk: int, limit: int = 50) -> list[dict]:
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT permit_number, permit_type, permit_status,
                   application_start_date, issue_date, processing_time
            FROM fact_permit
            WHERE location_sk = $1
            ORDER BY application_start_date DESC NULLS LAST
            LIMIT $2
            """,
            location_sk, limit,
        )
    return [_date_dict(r) for r in rows]


async def get_311_requests(location_sk: int, limit: int = 50) -> list[dict]:
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT source_id, sr_type, sr_short_code, status,
                   created_date, closed_date
            FROM fact_311
            WHERE location_sk = $1
            ORDER BY created_date DESC NULLS LAST
            LIMIT $2
            """,
            location_sk, limit,
        )
    return [_date_dict(r) for r in rows]


async def get_vacant_buildings(location_sk: int, limit: int = 50) -> list[dict]:
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT docket_number, violation_number, issued_date,
                   last_hearing_date, violation_type, entity_or_person,
                   disposition_description, total_fines,
                   current_amount_due, total_paid
            FROM fact_vacant_building
            WHERE location_sk = $1
            ORDER BY issued_date DESC NULLS LAST
            LIMIT $2
            """,
            location_sk, limit,
        )
    return [_date_dict(r) for r in rows]


async def get_tax_liens(location_sk: int) -> list[dict]:
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT tl.tax_sale_year, tl.lien_type, tl.sold_at_sale,
                   tl.total_amount_offered, tl.buyer_name
            FROM fact_tax_lien tl
            WHERE tl.location_sk = $1
               OR tl.parcel_sk IN (
                   SELECT parcel_sk FROM dim_parcel WHERE location_sk = $1
               )
            ORDER BY tl.tax_sale_year DESC
            """,
            location_sk,
        )
    return [_date_dict(r) for r in rows]


async def get_data_freshness() -> dict[str, str | None]:
    """Return the most recent ingestion completed_at per source dataset."""
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT source_dataset,
                   MAX(completed_at) AS latest
            FROM ingestion_batch
            WHERE status = 'complete'
            GROUP BY source_dataset
            """
        )
    mapping = {r["source_dataset"]: r["latest"] for r in rows}
    return {
        "violations_as_of": _fmt(mapping.get("building_violations")),
        "inspections_as_of": _fmt(mapping.get("food_inspections")),
        "permits_as_of": _fmt(mapping.get("building_permits")),
        "tax_liens_as_of": _fmt(mapping.get("cook_county_tax_liens")),
        "service_311_as_of": _fmt(mapping.get("311_service_requests")),
        "vacant_buildings_as_of": _fmt(mapping.get("vacant_building_violations")),
    }


def _fmt(ts) -> str | None:
    return ts.isoformat() if ts else None


def _date_dict(row) -> dict:
    from decimal import Decimal
    d = dict(row)
    for k, v in d.items():
        if hasattr(v, "isoformat"):
            d[k] = v.isoformat()
        elif isinstance(v, Decimal):
            d[k] = float(v)
    return d
