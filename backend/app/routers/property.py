"""
CIVITAS – Property lookup router.

POST /api/v1/property/lookup
  Body:     { "address": "...", "pin": "..." }
  Response: PropertyLookupResponse

GET /api/v1/property/autocomplete?q={prefix}&limit=10
  Response: list[AutocompleteItem]
"""

from typing import List

from fastapi import APIRouter, Depends, Query

from backend.app.database import get_conn
from backend.app.dependencies import get_current_user
from backend.app.schemas.property import (
    AutocompleteItem,
    PropertyLookupRequest,
    PropertyLookupResponse,
)
from backend.app.services.address import resolve_address

router = APIRouter(prefix="/api/v1/property", tags=["property"])


@router.post("/lookup", response_model=PropertyLookupResponse)
async def lookup_property(body: PropertyLookupRequest, user: dict = Depends(get_current_user)):
    result = await resolve_address(address=body.address, pin=body.pin)
    return PropertyLookupResponse(**result)


@router.get("/autocomplete", response_model=List[AutocompleteItem])
async def autocomplete_address(
    q: str = Query(..., min_length=2, description="Address prefix"),
    limit: int = Query(default=10, ge=1, le=50),
    user: dict = Depends(get_current_user),
):
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT location_sk, full_address_standardized
            FROM dim_location
            WHERE full_address_standardized ILIKE $1
            ORDER BY full_address_standardized
            LIMIT $2
            """,
            q + "%",
            limit,
        )
    return [
        AutocompleteItem(location_sk=r["location_sk"], full_address=r["full_address_standardized"])
        for r in rows
    ]
