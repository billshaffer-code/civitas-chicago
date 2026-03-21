"""
CIVITAS – Data browse router.

GET /api/v1/data/browse?table=violations&page=1&page_size=25&filter=&sort=&sort_dir=asc
GET /api/v1/data/health  — dataset freshness dashboard
GET /api/v1/data/live-check?dataset=violations&address=...&since=...
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.app.database import get_conn
from backend.app.dependencies import get_current_user
from backend.app.services.socrata_proxy import (
    KNOWN_DATASETS,
    get_dataset_freshness,
    live_record_check,
)

router = APIRouter(prefix="/api/v1/data", tags=["data"])

# Allowed tables and their column definitions (whitelist to prevent SQL injection)
TABLE_CONFIG = {
    "violations": {
        "fact": "fact_violation",
        "columns": [
            "violation_date", "violation_code", "violation_status",
            "violation_description", "inspection_status",
        ],
        "date_col": "violation_date",
    },
    "inspections": {
        "fact": "fact_inspection",
        "columns": [
            "inspection_date", "dba_name", "facility_type",
            "risk_level", "results",
        ],
        "date_col": "inspection_date",
    },
    "permits": {
        "fact": "fact_permit",
        "columns": [
            "permit_number", "permit_type", "permit_status",
            "application_start_date", "issue_date", "processing_time",
        ],
        "date_col": "application_start_date",
    },
    "service_311": {
        "fact": "fact_311",
        "columns": [
            "source_id", "sr_type", "sr_short_code",
            "status", "created_date", "closed_date",
        ],
        "date_col": "created_date",
    },
    "tax_liens": {
        "fact": "fact_tax_lien",
        "columns": [
            "tax_sale_year", "lien_type", "sold_at_sale",
            "total_amount_offered", "buyer_name",
        ],
        "date_col": "tax_sale_year",
    },
    "vacant_buildings": {
        "fact": "fact_vacant_building",
        "columns": [
            "docket_number", "issued_date", "violation_type",
            "disposition_description", "current_amount_due", "total_paid",
        ],
        "date_col": "issued_date",
    },
}


@router.get("/browse")
async def browse_data(
    table: str = Query(..., description="Table name"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    address: Optional[str] = Query(None, description="Address filter (persists across tabs)"),
    filter: Optional[str] = Query(None, description="Column text filter"),
    sort: Optional[str] = Query(None, description="Column to sort by"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
    user: dict = Depends(get_current_user),
):
    cfg = TABLE_CONFIG.get(table)
    if not cfg:
        raise HTTPException(status_code=400, detail=f"Unknown table: {table}")

    fact_table = cfg["fact"]
    columns = cfg["columns"]
    date_col = cfg["date_col"]

    # Build SELECT with address join
    select_cols = ", ".join(f"f.{c}" for c in columns)
    base_query = f"""
        FROM {fact_table} f
        LEFT JOIN dim_location d ON f.location_sk = d.location_sk
    """

    # Filter clause
    where_parts = []
    params = []
    param_idx = 1

    if address and address.strip():
        where_parts.append(f"d.full_address_standardized ILIKE ${param_idx}")
        params.append(f"%{address.strip()}%")
        param_idx += 1

    if filter and filter.strip():
        filter_conditions = []
        for col in columns:
            filter_conditions.append(f"CAST(f.{col} AS TEXT) ILIKE ${param_idx}")
            params.append(f"%{filter.strip()}%")
            param_idx += 1
        where_parts.append(f"({' OR '.join(filter_conditions)})")

    where_clause = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""

    # Sort clause — validate sort column is in whitelist
    if sort and sort in columns:
        order_clause = f"ORDER BY f.{sort} {sort_dir} NULLS LAST"
    elif sort == "address":
        order_clause = f"ORDER BY d.full_address_standardized {sort_dir} NULLS LAST"
    else:
        order_clause = f"ORDER BY f.{date_col} DESC NULLS LAST"

    offset = (page - 1) * page_size

    async with get_conn() as conn:
        # Total count
        count_sql = f"SELECT count(*) {base_query} {where_clause}"
        total = await conn.fetchval(count_sql, *params)

        # Data query
        data_sql = f"""
            SELECT d.full_address_standardized AS address, {select_cols}
            {base_query}
            {where_clause}
            {order_clause}
            LIMIT {page_size} OFFSET {offset}
        """
        rows = await conn.fetch(data_sql, *params)

    return {
        "rows": [dict(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/tables")
async def list_tables(user: dict = Depends(get_current_user)):
    """Return available tables and their row counts."""
    async with get_conn() as conn:
        counts = {}
        for key, cfg in TABLE_CONFIG.items():
            count = await conn.fetchval(f"SELECT count(*) FROM {cfg['fact']}")
            counts[key] = count

    return {
        "tables": [
            {"key": key, "label": key.replace("_", " ").title(), "count": counts.get(key, 0)}
            for key in TABLE_CONFIG
        ]
    }


@router.get("/health")
async def data_health(user: dict = Depends(get_current_user)) -> Dict[str, Any]:
    """Return data health: local ingestion timestamps, portal freshness, record counts, quality alerts."""
    import asyncio

    # 1. Local ingestion timestamps + record counts
    local_data: Dict[str, Dict[str, Any]] = {}
    async with get_conn() as conn:
        for key, cfg in TABLE_CONFIG.items():
            count = await conn.fetchval(f"SELECT count(*) FROM {cfg['fact']}")

            # Try to get last ingestion time from ingestion_batch table
            last_ingested = None
            try:
                last_ingested = await conn.fetchval(
                    "SELECT MAX(completed_at) FROM ingestion_batch WHERE source_dataset = $1",
                    key,
                )
            except Exception:
                pass

            local_data[key] = {
                "record_count": count,
                "last_ingested": last_ingested.isoformat() if last_ingested else None,
                "label": cfg.get("label", key.replace("_", " ").title()),
            }

        # Check for quality alerts from data_quality_check if table exists
        quality_alerts: List[Dict[str, Any]] = []
        try:
            alerts = await conn.fetch(
                """SELECT source_dataset, check_name, status, message, checked_at
                   FROM data_quality_check
                   WHERE status != 'pass'
                   ORDER BY checked_at DESC
                   LIMIT 20"""
            )
            quality_alerts = [dict(r) for r in alerts]
        except Exception:
            pass  # Table may not exist

    # 2. Portal freshness (parallel async calls)
    portal_datasets = ["violations", "inspections", "permits", "311", "vacant_buildings"]
    freshness_tasks = [get_dataset_freshness(ds) for ds in portal_datasets]
    freshness_results = await asyncio.gather(*freshness_tasks, return_exceptions=True)

    portal_freshness: Dict[str, Any] = {}
    for ds_key, result in zip(portal_datasets, freshness_results):
        if isinstance(result, Exception):
            portal_freshness[ds_key] = {"error": str(result)}
        else:
            portal_freshness[ds_key] = result

    # 3. Combine into per-dataset response
    datasets: List[Dict[str, Any]] = []
    for key in TABLE_CONFIG:
        entry = {
            "key": key,
            **(local_data.get(key, {})),
        }
        # Merge portal freshness if available
        if key in portal_freshness:
            pf = portal_freshness[key]
            entry["portal_updated_at"] = pf.get("rows_updated_iso")
            entry["portal_age_hours"] = pf.get("age_hours")
            entry["portal_error"] = pf.get("error")

            # Staleness indicator
            age = pf.get("age_hours")
            if age is not None:
                if age < 48:
                    entry["staleness"] = "fresh"
                elif age < 168:
                    entry["staleness"] = "stale"
                else:
                    entry["staleness"] = "very_stale"
        datasets.append(entry)

    return {
        "datasets": datasets,
        "quality_alerts": quality_alerts,
    }


@router.get("/live-check")
async def data_live_check(
    dataset: str = Query(..., description="Dataset key (violations, inspections, etc.)"),
    address: str = Query(..., min_length=3, description="Property address"),
    since: str = Query(..., description="ISO datetime — check for records after this"),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Query Chicago Data Portal for records newer than our last ingestion."""
    if dataset not in KNOWN_DATASETS:
        raise HTTPException(status_code=400, detail=f"Unknown dataset: {dataset}")
    try:
        return await live_record_check(dataset, address, since)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Socrata API error: {exc}")
