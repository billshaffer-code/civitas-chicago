"""
CIVITAS MCP – Report Generation Server.

Generates, retrieves, and lists property reports via backend services.
Transport: stdio.
"""

from __future__ import annotations

import base64
import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from mcp.server.fastmcp import FastMCP

from mcp_servers.common import db

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(server: FastMCP) -> AsyncIterator[None]:
    # Report gen needs read-write for report_audit inserts
    await db.init_pool(read_only=False)
    log.info("civitas-reports MCP server started")
    yield
    await db.close_pool()
    log.info("civitas-reports MCP server stopped")


mcp = FastMCP(
    "civitas-reports",
    description="Generate and retrieve Civitas property intelligence reports",
    lifespan=lifespan,
)


@mcp.tool()
async def generate_report(
    address: str,
    pin: str = "",
    skip_narrative: bool = False,
) -> dict[str, Any]:
    """
    Generate a full property intelligence report for the given address.
    Returns report_id, score, level, and findings.
    Set skip_narrative=True to skip AI summary generation.
    """
    from backend.app.services.report import generate_single_report
    result = await generate_single_report(address, pin=pin, skip_narrative=skip_narrative)
    return result


@mcp.tool()
async def get_report(report_id: str) -> dict[str, Any]:
    """Fetch a previously generated report by ID."""
    async with db.get_conn() as conn:
        row = await conn.fetchrow(
            """
            SELECT report_id, query_address, location_sk,
                   risk_score, risk_tier,
                   generated_at, report_json
            FROM report_audit
            WHERE report_id = $1::uuid
            """,
            report_id,
        )
    if not row:
        return {"error": f"Report {report_id} not found"}
    from mcp_servers.civitas_db.server import _row_dict
    return _row_dict(row)


@mcp.tool()
async def list_reports(limit: int = 20, address_filter: str | None = None) -> list[dict[str, Any]]:
    """List recent reports, optionally filtered by address substring."""
    limit = min(limit, 100)
    if address_filter:
        query = """
            SELECT report_id, query_address, risk_score, risk_tier, generated_at
            FROM report_audit
            WHERE query_address ILIKE $1
            ORDER BY generated_at DESC
            LIMIT $2
        """
        params = [f"%{address_filter}%", limit]
    else:
        query = """
            SELECT report_id, query_address, risk_score, risk_tier, generated_at
            FROM report_audit
            ORDER BY generated_at DESC
            LIMIT $1
        """
        params = [limit]

    async with db.get_conn() as conn:
        rows = await conn.fetch(query, *params)
    from mcp_servers.civitas_db.server import _row_dict
    return [_row_dict(r) for r in rows]


@mcp.tool()
async def download_pdf(report_id: str) -> dict[str, Any]:
    """
    Generate a PDF for the given report and return it as base64.
    Returns {report_id, filename, pdf_base64}.
    """
    from backend.app.services.pdf import generate_pdf

    async with db.get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT report_json FROM report_audit WHERE report_id = $1::uuid",
            report_id,
        )
    if not row:
        return {"error": f"Report {report_id} not found"}

    report_data = json.loads(row["report_json"]) if isinstance(row["report_json"], str) else row["report_json"]
    pdf_bytes = generate_pdf(report_data)
    encoded = base64.b64encode(pdf_bytes).decode("ascii")

    return {
        "report_id": report_id,
        "filename": f"civitas_report_{report_id}.pdf",
        "pdf_base64": encoded,
    }


def main():
    logging.basicConfig(level=logging.INFO)
    mcp.run()


if __name__ == "__main__":
    main()
