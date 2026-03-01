"""
Tests for /api/v1/property endpoints.
"""

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import pytest

from tests.conftest import FakeConnection


@pytest.mark.asyncio
async def test_lookup_resolved(client):
    mock_result = {
        "resolved": True,
        "location_sk": 42,
        "full_address": "123 N MAIN ST 60601",
        "house_number": "123",
        "street_direction": "N",
        "street_name": "MAIN",
        "street_type": "ST",
        "zip": "60601",
        "lat": 41.8781,
        "lon": -87.6298,
        "parcel_id": None,
        "match_confidence": "EXACT_ADDRESS",
        "warning": None,
    }

    with patch("backend.app.routers.property.resolve_address", new_callable=AsyncMock, return_value=mock_result):
        resp = await client.post("/api/v1/property/lookup", json={"address": "123 N Main St"})

    assert resp.status_code == 200
    data = resp.json()
    assert data["resolved"] is True
    assert data["location_sk"] == 42


@pytest.mark.asyncio
async def test_lookup_no_match(client):
    mock_result = {
        "resolved": False,
        "location_sk": None,
        "full_address": None,
        "house_number": None,
        "street_direction": None,
        "street_name": None,
        "street_type": None,
        "zip": None,
        "lat": None,
        "lon": None,
        "parcel_id": None,
        "match_confidence": "NO_MATCH",
        "warning": "Address match uncertain – manual verification recommended.",
    }

    with patch("backend.app.routers.property.resolve_address", new_callable=AsyncMock, return_value=mock_result):
        resp = await client.post("/api/v1/property/lookup", json={"address": "999 Fake St"})

    assert resp.status_code == 200
    assert resp.json()["resolved"] is False


@pytest.mark.asyncio
async def test_autocomplete(client):
    rows = [
        {"location_sk": 1, "full_address_standardized": "100 N STATE ST 60602"},
        {"location_sk": 2, "full_address_standardized": "101 N STATE ST 60602"},
    ]
    conn = FakeConnection(fetch_return=rows)

    @asynccontextmanager
    async def _get_conn():
        yield conn

    with patch("backend.app.routers.property.get_conn", _get_conn):
        resp = await client.get("/api/v1/property/autocomplete", params={"q": "100 N"})

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["full_address"] == "100 N STATE ST 60602"
