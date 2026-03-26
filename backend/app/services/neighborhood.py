"""
CIVITAS – Neighborhood (community area) analytics service.

Provides neighborhood-level baselines and summaries from the
view_community_area_summary materialized view.
"""

from __future__ import annotations

import json
from typing import Optional

from backend.app.database import get_conn


async def get_neighborhood_list() -> list[dict]:
    """Return all 77 community areas with summary stats."""
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT community_area_id, community_area_name,
                   property_count, avg_activity_score, median_activity_score,
                   quiet_count, typical_count, active_count, complex_count,
                   avg_violations, avg_active_violations, avg_311_12mo,
                   avg_lien_events, avg_permit_processing_days,
                   avg_failed_inspections_24mo,
                   total_violations, total_311_12mo, total_lien_events,
                   total_lien_amount, total_vacant_violations
            FROM view_community_area_summary
            ORDER BY community_area_name
            """
        )
    return [dict(r) for r in rows]


async def get_neighborhood_detail(community_area_id: int) -> Optional[dict]:
    """Return full detail for one community area including GeoJSON boundary."""
    async with get_conn() as conn:
        row = await conn.fetchrow(
            """
            SELECT cas.community_area_id, cas.community_area_name,
                   cas.property_count, cas.avg_activity_score, cas.median_activity_score,
                   cas.quiet_count, cas.typical_count, cas.active_count, cas.complex_count,
                   cas.avg_violations, cas.avg_active_violations, cas.avg_311_12mo,
                   cas.avg_lien_events, cas.avg_permit_processing_days,
                   cas.avg_failed_inspections_24mo,
                   cas.total_violations, cas.total_311_12mo, cas.total_lien_events,
                   cas.total_lien_amount, cas.total_vacant_violations,
                   ST_AsGeoJSON(ca.geom)::json AS boundary_geojson
            FROM view_community_area_summary cas
            JOIN dim_community_area ca USING (community_area_id)
            WHERE cas.community_area_id = $1
            """,
            community_area_id,
        )
    if not row:
        return None
    result = dict(row)
    if isinstance(result.get("boundary_geojson"), str):
        result["boundary_geojson"] = json.loads(result["boundary_geojson"])
    return result


async def get_neighborhood_properties(
    community_area_id: int,
    page: int = 1,
    page_size: int = 25,
    sort_by: str = "violations",
    sort_dir: str = "desc",
    address: Optional[str] = None,
    activity_level: Optional[list] = None,
) -> dict:
    """Return paginated property list for a community area.

    Uses only the materialized view_property_summary (indexed) to avoid the
    expensive view_property_score view which computes flags on-the-fly.
    When activity_level filter is provided, joins view_property_score to filter
    and includes score/level in the response.
    """
    offset = (page - 1) * page_size

    allowed_sorts = {
        "address": "vps.full_address_standardized",
        "violations": "vps.total_violations",
        "311": "vps.sr_count_12mo",
        "liens": "vps.total_lien_events",
        "score": "sc.raw_score",
    }
    order_col = allowed_sorts.get(sort_by, "vps.total_violations")
    order_dir = "ASC" if sort_dir.lower() == "asc" else "DESC"

    # If sorting by score but no level filter, fall back to violations
    if sort_by == "score" and not activity_level:
        order_col = "vps.total_violations"

    # Build dynamic clauses
    params: list = [community_area_id]
    extra_clauses = ""
    score_join = ""
    score_select = ""

    if address and address.strip():
        params.append(address.strip())
        extra_clauses += (
            f" AND vps.full_address_standardized ILIKE '%' || ${len(params)} || '%'"
        )

    # Validated activity levels
    valid_levels = {"QUIET", "TYPICAL", "ACTIVE", "COMPLEX"}
    if activity_level:
        filtered = [lv.upper() for lv in activity_level if lv.upper() in valid_levels]
        if filtered:
            params.append(filtered)
            score_join = " JOIN view_property_score sc ON sc.location_sk = vps.location_sk"
            extra_clauses += f" AND sc.activity_level = ANY(${len(params)})"
            score_select = ", sc.raw_score, sc.activity_level"

    param_offset = len(params)

    async with get_conn() as conn:
        count = await conn.fetchval(
            f"""
            SELECT COUNT(*)
            FROM dim_location dl
            JOIN view_property_summary vps ON vps.location_sk = dl.location_sk
            {score_join}
            WHERE dl.community_area_id = $1{extra_clauses}
            """,
            *params,
        )

        rows = await conn.fetch(
            f"""
            SELECT vps.location_sk, vps.full_address_standardized,
                   vps.lat, vps.lon,
                   vps.total_violations, vps.active_violation_count,
                   vps.sr_count_12mo, vps.total_lien_events,
                   vps.total_lien_events AS lien_count,
                   vps.failed_inspection_count_24mo,
                   vps.vacant_violation_count
                   {score_select}
            FROM dim_location dl
            JOIN view_property_summary vps ON vps.location_sk = dl.location_sk
            {score_join}
            WHERE dl.community_area_id = $1{extra_clauses}
            ORDER BY {order_col} {order_dir}
            LIMIT ${param_offset + 1} OFFSET ${param_offset + 2}
            """,
            *params,
            page_size,
            offset,
        )

    return {
        "total": count,
        "page": page,
        "page_size": page_size,
        "properties": [dict(r) for r in rows],
    }


async def get_neighborhood_geojson() -> dict:
    """Return FeatureCollection of all 77 community areas with stats for choropleth."""
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT cas.community_area_id, cas.community_area_name,
                   cas.property_count, cas.avg_activity_score,
                   cas.quiet_count, cas.typical_count, cas.active_count, cas.complex_count,
                   cas.avg_violations, cas.avg_311_12mo, cas.avg_lien_events,
                   ST_AsGeoJSON(ca.geom)::json AS geometry
            FROM view_community_area_summary cas
            JOIN dim_community_area ca USING (community_area_id)
            ORDER BY cas.community_area_id
            """
        )

    features = []
    for r in rows:
        geom = r["geometry"]
        if isinstance(geom, str):
            geom = json.loads(geom)
        features.append({
            "type": "Feature",
            "geometry": geom,
            "properties": {
                "community_area_id": r["community_area_id"],
                "community_area_name": r["community_area_name"],
                "property_count": r["property_count"],
                "avg_activity_score": float(r["avg_activity_score"] or 0),
                "quiet_count": r["quiet_count"],
                "typical_count": r["typical_count"],
                "active_count": r["active_count"],
                "complex_count": r["complex_count"],
                "avg_violations": float(r["avg_violations"] or 0),
                "avg_311_12mo": float(r["avg_311_12mo"] or 0),
                "avg_lien_events": float(r["avg_lien_events"] or 0),
            },
        })

    return {"type": "FeatureCollection", "features": features}


async def get_neighborhood_baselines(community_area_id: int) -> Optional[dict]:
    """Return neighborhood-specific baselines in the same shape as CHICAGO_BASELINES."""
    async with get_conn() as conn:
        row = await conn.fetchrow(
            """
            SELECT avg_violations, avg_311_12mo, avg_lien_events,
                   avg_permit_processing_days, avg_failed_inspections_24mo,
                   property_count, total_lien_amount
            FROM view_community_area_summary
            WHERE community_area_id = $1
            """,
            community_area_id,
        )

    if not row:
        return None

    property_count = row["property_count"] or 1
    return {
        "avg_violations_per_property": float(row["avg_violations"] or 0),
        "avg_311_requests_12mo": float(row["avg_311_12mo"] or 0),
        "avg_tax_lien_amount": float(row["total_lien_amount"] or 0) / property_count,
        "avg_permit_processing_days": float(row["avg_permit_processing_days"] or 0),
        "avg_inspection_failure_rate": float(row["avg_failed_inspections_24mo"] or 0),
    }
