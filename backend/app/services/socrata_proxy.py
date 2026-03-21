"""
CIVITAS – Async Socrata proxy for backend API endpoints.

Wraps the Socrata SODA2 API with async httpx calls and simple TTL caching.
Reuses dataset IDs and patterns from mcp_servers/common/socrata.py.
"""

from __future__ import annotations

import re
import time
from typing import Any

import httpx

from backend.app.config import settings

# ── Input sanitization ──────────────────────────────────────────────────────

def _sanitize(value: str) -> str:
    """Sanitize user input for SoQL interpolation.

    Escapes single quotes (SoQL escape) and strips control characters.
    """
    # Strip control characters (keep printable + spaces)
    cleaned = re.sub(r'[\x00-\x1f\x7f]', '', value)
    # Escape single quotes for SoQL
    return cleaned.replace("'", "''")


# ── Known dataset IDs ────────────────────────────────────────────────────────

CHICAGO_BASE = "https://data.cityofchicago.org"
COOK_COUNTY_BASE = "https://datacatalog.cookcountyil.gov"

KNOWN_DATASETS = {
    "violations": {"id": "22u3-xenr", "base": CHICAGO_BASE, "label": "Building Violations"},
    "inspections": {"id": "4ijn-s7e5", "base": CHICAGO_BASE, "label": "Food Inspections"},
    "permits": {"id": "ydr8-5enu", "base": CHICAGO_BASE, "label": "Building Permits"},
    "311": {"id": "v6vf-nfxy", "base": CHICAGO_BASE, "label": "311 Service Requests"},
    "vacant_buildings": {"id": "kc9i-wq85", "base": CHICAGO_BASE, "label": "Vacant Buildings"},
    "tax_annual": {"id": "55ju-2fs9", "base": CHICAGO_BASE, "label": "Tax Liens (Annual)"},
    "tax_scavenger": {"id": "ydgz-vkrp", "base": CHICAGO_BASE, "label": "Tax Liens (Scavenger)"},
}

COOK_COUNTY_ASSESSMENT_DATASET = "62wk-jnfm"

# ── Simple TTL cache ─────────────────────────────────────────────────────────

_cache: dict[str, tuple[float, Any]] = {}


def _cache_get(key: str, ttl_seconds: float) -> Any | None:
    entry = _cache.get(key)
    if entry and (time.monotonic() - entry[0]) < ttl_seconds:
        return entry[1]
    return None


def _cache_set(key: str, value: Any) -> None:
    _cache[key] = (time.monotonic(), value)


# ── Async Socrata client ─────────────────────────────────────────────────────

def _get_headers() -> dict[str, str]:
    headers: dict[str, str] = {}
    token = getattr(settings, "socrata_app_token", "")
    if token:
        headers["X-App-Token"] = token
    return headers


async def socrata_query(
    base_url: str,
    dataset_id: str,
    *,
    select: str | None = None,
    where: str | None = None,
    order: str | None = None,
    limit: int = 1000,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """Execute a SoQL query and return rows."""
    params: dict[str, Any] = {"$limit": limit, "$offset": offset}
    if select:
        params["$select"] = select
    if where:
        params["$where"] = where
    if order:
        params["$order"] = order

    url = f"{base_url}/resource/{dataset_id}.json"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url, params=params, headers=_get_headers())
        resp.raise_for_status()
        return resp.json()


async def socrata_metadata(base_url: str, dataset_id: str) -> dict[str, Any]:
    """Fetch dataset metadata (includes rowsUpdatedAt, etc.)."""
    url = f"{base_url}/api/views/{dataset_id}.json"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url, headers=_get_headers())
        resp.raise_for_status()
        return resp.json()


# ── Feature-specific helpers ─────────────────────────────────────────────────

async def get_assessment_history(pin: str) -> list[dict[str, Any]]:
    """Fetch Cook County assessment history for a 14-digit PIN (cached 10 min)."""
    cache_key = f"assessment:{pin}"
    cached = _cache_get(cache_key, ttl_seconds=600)
    if cached is not None:
        return cached

    # Cook County Assessor dataset uses 10-digit PIN (no dashes, no check digit)
    clean_pin = pin.replace("-", "")
    if len(clean_pin) == 14:
        clean_pin = clean_pin[:10]

    rows = await socrata_query(
        COOK_COUNTY_BASE,
        COOK_COUNTY_ASSESSMENT_DATASET,
        where=f"pin='{_sanitize(clean_pin)}'",
        order="tax_year DESC",
        limit=20,
    )
    _cache_set(cache_key, rows)
    return rows


async def get_dataset_freshness(dataset_key: str) -> dict[str, Any]:
    """Check Socrata portal freshness for a known dataset (cached 30 min)."""
    cache_key = f"freshness:{dataset_key}"
    cached = _cache_get(cache_key, ttl_seconds=1800)
    if cached is not None:
        return cached

    ds = KNOWN_DATASETS.get(dataset_key)
    if not ds:
        return {"error": f"Unknown dataset: {dataset_key}"}

    try:
        meta = await socrata_metadata(ds["base"], ds["id"])
        rows_updated = meta.get("rowsUpdatedAt")
        result = {
            "dataset": dataset_key,
            "label": ds["label"],
            "rows_updated_at": rows_updated,
        }
        if rows_updated:
            from datetime import datetime, timezone
            updated_dt = datetime.fromtimestamp(rows_updated, tz=timezone.utc)
            age_hours = (datetime.now(timezone.utc) - updated_dt).total_seconds() / 3600
            result["age_hours"] = round(age_hours, 1)
            result["rows_updated_iso"] = updated_dt.isoformat()
        _cache_set(cache_key, result)
        return result
    except Exception as exc:
        return {"dataset": dataset_key, "label": ds.get("label", dataset_key), "error": str(exc)}


async def search_parcels_by_address(address: str) -> list[dict[str, Any]]:
    """Search Cook County Assessor parcels by address (cached 10 min)."""
    cache_key = f"parcel_search:{address.upper().strip()}"
    cached = _cache_get(cache_key, ttl_seconds=600)
    if cached is not None:
        return cached

    addr_upper = address.upper().strip()
    rows = await socrata_query(
        COOK_COUNTY_BASE,
        COOK_COUNTY_ASSESSMENT_DATASET,
        select="pin, property_address, property_city, property_zip, "
               "property_class, land_square_feet, building_square_feet, "
               "certified_total, tax_year",
        where=f"upper(property_address) LIKE '%{_sanitize(addr_upper)}%'",
        order="tax_year DESC",
        limit=20,
    )
    _cache_set(cache_key, rows)
    return rows


async def verify_parcel(pin: str) -> list[dict[str, Any]]:
    """Verify a parcel PIN against Cook County Assessor (cached 10 min)."""
    cache_key = f"parcel_verify:{pin}"
    cached = _cache_get(cache_key, ttl_seconds=600)
    if cached is not None:
        return cached

    clean_pin = pin.replace("-", "")
    if len(clean_pin) == 14:
        clean_pin = clean_pin[:10]

    rows = await socrata_query(
        COOK_COUNTY_BASE,
        COOK_COUNTY_ASSESSMENT_DATASET,
        where=f"pin='{_sanitize(clean_pin)}'",
        order="tax_year DESC",
        limit=5,
    )
    _cache_set(cache_key, rows)
    return rows


async def live_record_check(
    dataset_key: str,
    address: str,
    since_iso: str,
) -> dict[str, Any]:
    """Query Socrata for records newer than our last ingestion."""
    ds = KNOWN_DATASETS.get(dataset_key)
    if not ds:
        return {"error": f"Unknown dataset: {dataset_key}", "records": []}

    # Build address filter — Socrata datasets use different address columns
    addr_upper = address.upper().strip()
    # Remove city/state suffix for matching
    for suffix in [", CHICAGO, IL", ", CHICAGO IL"]:
        if addr_upper.endswith(suffix):
            addr_upper = addr_upper[: -len(suffix)].strip()

    # Dataset-specific address column and date column mapping
    ds_config = {
        "violations": {"addr_col": "address", "date_col": "violation_date"},
        "inspections": {"addr_col": "address", "date_col": "inspection_date"},
        "permits": {"addr_col": "street_number, street_direction, street_name", "date_col": "issue_date"},
        "311": {"addr_col": "street_address", "date_col": "created_date"},
        "vacant_buildings": {"addr_col": "address", "date_col": "date_issued"},
    }

    cfg = ds_config.get(dataset_key)
    if not cfg:
        return {"error": f"Live check not supported for: {dataset_key}", "records": []}

    # Build where clause
    addr_col = cfg["addr_col"]
    date_col = cfg["date_col"]

    # For permits, address is split across multiple columns — use simpler match
    if "," in addr_col:
        # Extract house number from the address for basic matching
        parts = addr_upper.split()
        if parts:
            where = f"starts_with(street_number, '{_sanitize(parts[0])}') AND {date_col} > '{_sanitize(since_iso)}'"
        else:
            return {"records": [], "count": 0}
    else:
        where = f"upper({addr_col}) LIKE '%{_sanitize(addr_upper)}%' AND {date_col} > '{_sanitize(since_iso)}'"

    try:
        rows = await socrata_query(
            ds["base"],
            ds["id"],
            where=where,
            order=f"{date_col} DESC",
            limit=20,
        )
        return {"records": rows, "count": len(rows)}
    except Exception as exc:
        return {"error": str(exc), "records": [], "count": 0}
