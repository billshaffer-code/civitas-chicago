"""
CIVITAS – Property lookup router.

POST /api/v1/property/lookup
GET /api/v1/property/autocomplete?q={prefix}&limit=10
GET /api/v1/property/neighbors?location_sk=...&radius=500
GET /api/v1/property/assessment-history?pin=...
GET /api/v1/property/parcel-search?address=...
GET /api/v1/property/parcel-verify?pin=...
"""

from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.app.database import get_conn
from backend.app.dependencies import get_current_user
from backend.app.schemas.property import (
    AutocompleteItem,
    NeighborProperty,
    PropertyLookupRequest,
    PropertyLookupResponse,
)
from backend.app.services.address import resolve_address
from backend.app.services.socrata_proxy import (
    get_assessment_history,
    search_parcels_by_address,
    verify_parcel,
)

router = APIRouter(prefix="/api/v1/property", tags=["property"])


@router.post("/lookup", response_model=PropertyLookupResponse)
async def lookup_property(body: PropertyLookupRequest, user: dict = Depends(get_current_user)):
    result = await resolve_address(address=body.address, pin=body.pin)
    return PropertyLookupResponse(**result)


@router.get("/neighbors", response_model=List[NeighborProperty])
async def get_neighbors(
    location_sk: int = Query(..., description="Subject property location_sk"),
    radius: int = Query(default=500, ge=50, le=2000, description="Search radius in meters"),
    user: dict = Depends(get_current_user),
):
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            WITH target AS (
                SELECT geom FROM dim_location WHERE location_sk = $1 AND geom IS NOT NULL
            ),
            neighbors AS (
                SELECT l.location_sk, l.full_address_standardized, l.lat, l.lon,
                       ST_Distance(l.geom::geography, t.geom::geography) AS distance_m
                FROM dim_location l, target t
                WHERE l.location_sk != $1
                  AND l.geom IS NOT NULL
                  AND l.lat IS NOT NULL
                  AND ST_DWithin(l.geom::geography, t.geom::geography, $2)
                ORDER BY distance_m
                LIMIT 100
            )
            SELECT n.location_sk, n.full_address_standardized, n.lat, n.lon, n.distance_m,
                   COALESCE(s.raw_score, 0) AS activity_score,
                   COALESCE(s.activity_level, 'QUIET') AS activity_level,
                   COALESCE(s.flag_count, 0) AS flag_count,
                   f.description AS top_finding
            FROM neighbors n
            LEFT JOIN view_property_score s ON s.location_sk = n.location_sk
            LEFT JOIN LATERAL (
                SELECT description FROM view_property_flags
                WHERE location_sk = n.location_sk
                ORDER BY severity_score DESC
                LIMIT 1
            ) f ON TRUE
            ORDER BY n.distance_m
            """,
            location_sk,
            float(radius),
        )
    return [
        NeighborProperty(
            location_sk=r["location_sk"],
            full_address=r["full_address_standardized"],
            lat=float(r["lat"]),
            lon=float(r["lon"]),
            activity_score=int(r["activity_score"]),
            activity_level=r["activity_level"],
            flag_count=int(r["flag_count"]),
            top_finding=r["top_finding"],
            distance_m=float(r["distance_m"]),
        )
        for r in rows
    ]


@router.get("/autocomplete", response_model=List[AutocompleteItem])
async def autocomplete_address(
    q: str = Query(..., min_length=2, description="Address prefix"),
    limit: int = Query(default=10, ge=1, le=50),
    user: dict = Depends(get_current_user),
):
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT DISTINCT ON (norm_addr)
                   location_sk, full_address_standardized
            FROM (
                SELECT location_sk, full_address_standardized,
                       REPLACE(
                           REGEXP_REPLACE(full_address_standardized, ',\\s*CHICAGO.*$', ''),
                           ' PKY', ' PKWY'
                       ) AS norm_addr
                FROM dim_location
                WHERE full_address_standardized ILIKE $1
            ) sub
            ORDER BY norm_addr, LENGTH(full_address_standardized)
            LIMIT $2
            """,
            q + "%",
            limit,
        )
    return [
        AutocompleteItem(location_sk=r["location_sk"], full_address=r["full_address_standardized"])
        for r in rows
    ]


@router.get("/assessment-history")
async def assessment_history(
    pin: str = Query(..., description="14-digit Cook County PIN"),
    user: dict = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    """Proxy assessment history from Cook County Assessor Socrata API."""
    if not pin or len(pin.replace("-", "")) < 10:
        raise HTTPException(status_code=400, detail="Invalid PIN format")
    try:
        return await get_assessment_history(pin)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Cook County API error: {exc}")


@router.get("/parcel-search")
async def parcel_search(
    address: str = Query(..., min_length=3, description="Address to search"),
    user: dict = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    """Search Cook County Assessor for parcels matching an address."""
    try:
        return await search_parcels_by_address(address)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Cook County API error: {exc}")


@router.get("/parcel-verify")
async def parcel_verify_endpoint(
    pin: str = Query(..., description="PIN to verify"),
    user: dict = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    """Verify a parcel PIN against Cook County Assessor."""
    if not pin or len(pin.replace("-", "")) < 10:
        raise HTTPException(status_code=400, detail="Invalid PIN format")
    try:
        return await verify_parcel(pin)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Cook County API error: {exc}")
