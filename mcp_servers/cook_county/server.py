"""
CIVITAS MCP – Cook County Property Server.

Parcel data from Cook County Assessor (Socrata platform) + local dim_parcel.
Transport: stdio.
"""

from __future__ import annotations

import re
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from mcp.server.fastmcp import FastMCP

from mcp_servers.common.config import settings
from mcp_servers.common import db
from mcp_servers.common.socrata import SocrataClient, COOK_COUNTY_BASE

log = logging.getLogger(__name__)

# Cook County Assessor dataset IDs
ASSESSOR_PARCEL = "62wk-jnfm"

_client: SocrataClient | None = None


@asynccontextmanager
async def lifespan(server: FastMCP) -> AsyncIterator[None]:
    global _client
    _client = SocrataClient(base_url=COOK_COUNTY_BASE)
    await db.init_pool(read_only=True)
    log.info("cook-county MCP server started")
    yield
    await db.close_pool()
    log.info("cook-county MCP server stopped")


mcp = FastMCP(
    "cook-county",
    description="Cook County Assessor parcel and assessment data",
    lifespan=lifespan,
)


def _normalize_pin(raw: str) -> str | None:
    digits = re.sub(r"\D", "", raw or "")
    return digits if len(digits) == 14 else None


@mcp.tool()
async def lookup_parcel_by_pin(pin: str) -> dict[str, Any]:
    """
    Look up a parcel by PIN. Checks local dim_parcel first,
    then falls back to Cook County Assessor API.
    """
    norm = _normalize_pin(pin)
    if not norm:
        return {"error": f"Invalid PIN format: {pin}. Expected 14 digits."}

    # Try local DB first
    async with db.get_conn() as conn:
        row = await conn.fetchrow(
            """
            SELECT p.parcel_sk, p.parcel_id, p.property_class,
                   p.lot_size, p.assessed_value,
                   l.full_address_standardized, l.lat, l.lon
            FROM dim_parcel p
            LEFT JOIN dim_location l ON l.location_sk = p.location_sk
            WHERE p.parcel_id = $1
            """,
            norm,
        )
    if row:
        from mcp_servers.civitas_db.server import _row_dict
        return _row_dict(row) | {"source": "civitas_db"}

    # Fallback to Assessor API
    formatted = f"{norm[:2]}-{norm[2:4]}-{norm[4:7]}-{norm[7:10]}-{norm[10:]}"
    results = _client.query(ASSESSOR_PARCEL, where=f"pin='{formatted}'", limit=1)
    if results:
        return results[0] | {"source": "cook_county_assessor"}

    return {"error": f"No parcel found for PIN {pin}"}


@mcp.tool()
async def get_assessment_history(pin: str) -> list[dict[str, Any]]:
    """Get historical assessed values for a PIN from Cook County Assessor."""
    norm = _normalize_pin(pin)
    if not norm:
        return [{"error": f"Invalid PIN format: {pin}"}]

    formatted = f"{norm[:2]}-{norm[2:4]}-{norm[4:7]}-{norm[7:10]}-{norm[10:]}"
    return _client.query(
        ASSESSOR_PARCEL,
        where=f"pin='{formatted}'",
        order="tax_year DESC",
        limit=20,
    )


@mcp.tool()
async def search_parcels_by_address(address: str, limit: int = 20) -> list[dict[str, Any]]:
    """Search Cook County parcels by address string."""
    addr_upper = address.strip().upper()
    results = _client.query(
        ASSESSOR_PARCEL,
        where=f"upper(property_address) like '%{addr_upper}%'",
        limit=min(limit, 100),
    )
    return results


def main():
    logging.basicConfig(level=logging.INFO)
    mcp.run()


if __name__ == "__main__":
    main()
