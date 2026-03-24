"""
CIVITAS – Neighborhood (community area) analytics router.

GET /api/v1/neighborhood/list         — All 77 areas with summary stats
GET /api/v1/neighborhood/geojson      — FeatureCollection for choropleth
GET /api/v1/neighborhood/{id}         — Full detail for one area + boundary
GET /api/v1/neighborhood/{id}/properties — Paginated property list with scores
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.app.dependencies import get_current_user
from backend.app.services.neighborhood import (
    get_neighborhood_detail,
    get_neighborhood_geojson,
    get_neighborhood_list,
    get_neighborhood_properties,
)

router = APIRouter(prefix="/api/v1/neighborhood", tags=["neighborhood"])


@router.get("/list")
async def list_neighborhoods(user: dict = Depends(get_current_user)):
    """Return all 77 community areas with summary statistics."""
    return await get_neighborhood_list()


@router.get("/geojson")
async def neighborhood_geojson(user: dict = Depends(get_current_user)):
    """Return GeoJSON FeatureCollection of all community areas for choropleth map."""
    return await get_neighborhood_geojson()


@router.get("/{community_area_id}")
async def neighborhood_detail(
    community_area_id: int,
    user: dict = Depends(get_current_user),
):
    """Return full detail for one community area including GeoJSON boundary."""
    result = await get_neighborhood_detail(community_area_id)
    if not result:
        raise HTTPException(status_code=404, detail="Community area not found")
    return result


@router.get("/{community_area_id}/properties")
async def neighborhood_properties(
    community_area_id: int,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    sort_by: str = Query(default="violations"),
    sort_dir: str = Query(default="desc"),
    address: str = Query(default=None),
    user: dict = Depends(get_current_user),
):
    """Return paginated property list for a community area."""
    return await get_neighborhood_properties(
        community_area_id,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_dir=sort_dir,
        address=address,
    )
