"""
CIVITAS – Property resolution Pydantic models.
"""

from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, Field


class PropertyLookupRequest(BaseModel):
    address: str = Field(..., description="Free-form Chicago property address")
    pin: Optional[str] = Field(None, description="14-digit Cook County PIN (optional)")


class PropertyLookupResponse(BaseModel):
    resolved: bool
    location_sk: Optional[int] = None
    full_address: Optional[str] = None
    house_number: Optional[str] = None
    street_direction: Optional[str] = None
    street_name: Optional[str] = None
    street_type: Optional[str] = None
    zip: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    parcel_id: Optional[str] = None
    match_confidence: str = "NO_MATCH"   # EXACT_PIN | EXACT_ADDRESS | STREET_ZIP | GEOSPATIAL | NO_MATCH
    warning: Optional[str] = None
