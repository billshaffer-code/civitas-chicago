"""
CIVITAS MCP – Civitas Database Server.

Read-only access to the Civitas PostgreSQL database.
Provides property lookup, flags, scores, address search, freshness, and ad-hoc SQL.
Transport: stdio (standard for Claude Desktop).
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

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(server: FastMCP) -> AsyncIterator[None]:
    await db.init_pool(read_only=True)
    log.info("civitas-db MCP server started")
    yield
    await db.close_pool()
    log.info("civitas-db MCP server stopped")


mcp = FastMCP(
    "civitas-db",
    description="Read-only access to the Civitas municipal intelligence database",
    lifespan=lifespan,
)


# ── Tools ────────────────────────────────────────────────────────────────────

@mcp.tool()
async def query_property(address: str, pin: str | None = None) -> dict[str, Any]:
    """
    Resolve an address (and optional PIN) to a property in the Civitas database.
    Returns location details, parcel info, and match confidence.
    Uses the same tier 1-4 resolution as the main application.
    """
    async with db.get_conn() as conn:
        # Tier 1: PIN match
        if pin:
            norm_pin = re.sub(r"\D", "", pin or "")
            if len(norm_pin) == 14:
                row = await conn.fetchrow(
                    """
                    SELECT p.parcel_sk, p.parcel_id,
                           l.location_sk, l.full_address_standardized,
                           l.house_number, l.street_direction, l.street_name,
                           l.street_type, l.zip, l.lat, l.lon
                    FROM dim_parcel p
                    JOIN dim_location l ON l.location_sk = p.location_sk
                    WHERE p.parcel_id = $1
                    """,
                    norm_pin,
                )
                if row:
                    return _row_dict(row) | {"match_confidence": "EXACT_PIN"}

        # Tier 2: Address matching
        address_upper = address.strip().upper()
        if address_upper:
            # Try exact full address match
            row = await conn.fetchrow(
                """
                SELECT l.location_sk, l.full_address_standardized,
                       l.house_number, l.street_direction, l.street_name,
                       l.street_type, l.zip, l.lat, l.lon,
                       p.parcel_id
                FROM dim_location l
                LEFT JOIN dim_parcel p ON p.location_sk = l.location_sk
                WHERE l.full_address_standardized = $1
                LIMIT 1
                """,
                address_upper,
            )
            if row:
                return _row_dict(row) | {"match_confidence": "EXACT_ADDRESS"}

            # Try ILIKE fallback
            row = await conn.fetchrow(
                """
                SELECT l.location_sk, l.full_address_standardized,
                       l.house_number, l.street_direction, l.street_name,
                       l.street_type, l.zip, l.lat, l.lon,
                       p.parcel_id
                FROM dim_location l
                LEFT JOIN dim_parcel p ON p.location_sk = l.location_sk
                WHERE l.full_address_standardized ILIKE $1
                LIMIT 1
                """,
                f"%{address_upper}%",
            )
            if row:
                return _row_dict(row) | {"match_confidence": "FUZZY_ADDRESS"}

    return {"resolved": False, "warning": "No matching property found"}


@mcp.tool()
async def get_flags(location_sk: int) -> list[dict[str, Any]]:
    """
    Get all triggered findings/flags for a property from the rule engine.
    Returns flag code, category, description, severity score, and action group.
    """
    async with db.get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT flag_code, category, description, severity_score,
                   supporting_count, action_group
            FROM view_property_flags
            WHERE location_sk = $1
            ORDER BY category, severity_score DESC
            """,
            location_sk,
        )
    return [_row_dict(r) for r in rows]


@mcp.tool()
async def get_score(location_sk: int) -> dict[str, Any]:
    """
    Get the activity score and level for a property.
    Returns raw_score, activity_level, flag_count, and triggered_flags.
    """
    async with db.get_conn() as conn:
        row = await conn.fetchrow(
            """
            SELECT raw_score, activity_level, flag_count, triggered_flags
            FROM view_property_score
            WHERE location_sk = $1
            """,
            location_sk,
        )
    if not row:
        return {"raw_score": 0, "activity_level": "QUIET", "flag_count": 0, "triggered_flags": []}
    return _row_dict(row)


@mcp.tool()
async def search_addresses(query: str, limit: int = 20) -> list[dict[str, Any]]:
    """
    Search for addresses in the database using ILIKE matching.
    Returns matching addresses with location_sk for further queries.
    """
    limit = min(limit, 100)
    async with db.get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT l.location_sk, l.full_address_standardized,
                   l.house_number, l.street_name, l.zip,
                   p.parcel_id
            FROM dim_location l
            LEFT JOIN dim_parcel p ON p.location_sk = l.location_sk
            WHERE l.full_address_standardized ILIKE $1
            ORDER BY l.full_address_standardized
            LIMIT $2
            """,
            f"%{query.strip().upper()}%",
            limit,
        )
    return [_row_dict(r) for r in rows]


@mcp.tool()
async def get_data_freshness() -> dict[str, Any]:
    """
    Return the most recent ingestion timestamp per source dataset.
    Useful for checking how current the data is.
    """
    async with db.get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT source_dataset,
                   MAX(completed_at) AS latest
            FROM ingestion_batch
            WHERE status = 'complete'
            GROUP BY source_dataset
            """
        )
    return {r["source_dataset"]: r["latest"].isoformat() if r["latest"] else None for r in rows}


@mcp.tool()
async def run_sql(query: str, params: list[Any] | None = None) -> list[dict[str, Any]]:
    """
    Execute a read-only SQL SELECT query against the Civitas database.
    Only SELECT and WITH statements are allowed. Results limited to 1000 rows.
    Use parameterized queries with $1, $2, etc. for user-supplied values.
    """
    # Validate: only SELECT/WITH allowed
    stripped = re.sub(r"--[^\n]*", "", query)  # strip line comments
    stripped = re.sub(r"/\*.*?\*/", "", stripped, flags=re.DOTALL)  # strip block comments
    stripped = stripped.strip()
    first_word = stripped.split()[0].upper() if stripped.split() else ""
    if first_word not in ("SELECT", "WITH"):
        return [{"error": "Only SELECT and WITH queries are allowed"}]

    max_rows = settings.mcp_db_max_query_rows
    params = params or []

    async with db.get_conn() as conn:
        rows = await conn.fetch(query, *params)

    result = [_row_dict(r) for r in rows[:max_rows]]
    if len(rows) > max_rows:
        result.append({"_truncated": True, "_total_rows": len(rows), "_max_rows": max_rows})
    return result


# ── Helpers ──────────────────────────────────────────────────────────────────

def _row_dict(row) -> dict[str, Any]:
    """Convert asyncpg Record to JSON-safe dict."""
    from decimal import Decimal
    d = dict(row)
    for k, v in d.items():
        if hasattr(v, "isoformat"):
            d[k] = v.isoformat()
        elif isinstance(v, Decimal):
            d[k] = float(v)
    return d


# ── Entrypoint ───────────────────────────────────────────────────────────────

def main():
    logging.basicConfig(level=logging.INFO)
    mcp.run()


if __name__ == "__main__":
    main()
