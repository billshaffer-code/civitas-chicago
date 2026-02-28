"""
CIVITAS – Property lookup router.

POST /api/v1/property/lookup
  Body:     { "address": "...", "pin": "..." }
  Response: PropertyLookupResponse
"""

from fastapi import APIRouter

from backend.app.schemas.property import PropertyLookupRequest, PropertyLookupResponse
from backend.app.services.address import resolve_address

router = APIRouter(prefix="/api/v1/property", tags=["property"])


@router.post("/lookup", response_model=PropertyLookupResponse)
async def lookup_property(body: PropertyLookupRequest):
    result = await resolve_address(address=body.address, pin=body.pin)
    return PropertyLookupResponse(**result)
