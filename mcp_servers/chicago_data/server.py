"""
CIVITAS MCP – Chicago Data Portal Server.

Live queries against the City of Chicago Socrata data portal.
Transport: stdio.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from mcp.server.fastmcp import FastMCP

from mcp_servers.common.socrata import SocrataClient, KNOWN_DATASETS, SOCRATA_BASE

log = logging.getLogger(__name__)

_client: SocrataClient | None = None


@asynccontextmanager
async def lifespan(server: FastMCP) -> AsyncIterator[None]:
    global _client
    _client = SocrataClient(base_url=SOCRATA_BASE)
    log.info("chicago-data MCP server started")
    yield
    log.info("chicago-data MCP server stopped")


mcp = FastMCP(
    "chicago-data",
    description="Live access to the City of Chicago Data Portal (Socrata SODA2 API)",
    lifespan=lifespan,
)


@mcp.tool()
async def query_dataset(
    dataset_id: str,
    where: str | None = None,
    select: str | None = None,
    order: str | None = None,
    limit: int = 1000,
) -> list[dict[str, Any]]:
    """
    Query any Chicago Data Portal dataset using SoQL.
    Use known dataset IDs: violations=22u3-xenr, inspections=4ijn-s7e5,
    permits=ydr8-5enu, 311=v6vf-nfxy, vacant=kc9i-wq85,
    tax_annual=55ju-2fs9, tax_scavenger=ydgz-vkrp.
    """
    return _client.query(dataset_id, select=select, where=where, order=order, limit=min(limit, 5000))


@mcp.tool()
async def get_dataset_metadata(dataset_id: str) -> dict[str, Any]:
    """
    Get metadata for a Socrata dataset: column names, types, row count, last updated.
    """
    meta = _client.metadata(dataset_id)
    columns = [{"name": c["fieldName"], "type": c.get("dataTypeName")}
               for c in meta.get("columns", [])]
    return {
        "id": dataset_id,
        "name": meta.get("name"),
        "description": meta.get("description"),
        "rows_updated_at": meta.get("rowsUpdatedAt"),
        "columns": columns,
    }


@mcp.tool()
async def check_freshness(dataset_id: str) -> dict[str, Any]:
    """Check how recently a dataset was updated. Returns age in hours."""
    return _client.freshness(dataset_id)


@mcp.tool()
async def count_records(dataset_id: str, where: str | None = None) -> dict[str, Any]:
    """Count records in a dataset with optional SoQL filter."""
    count = _client.count(dataset_id, where=where)
    return {"dataset_id": dataset_id, "count": count, "filter": where}


def main():
    logging.basicConfig(level=logging.INFO)
    mcp.run()


if __name__ == "__main__":
    main()
