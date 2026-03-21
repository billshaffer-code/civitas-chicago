"""
CIVITAS MCP – Socrata SODA2 API wrapper.
"""

from __future__ import annotations

from typing import Any

import requests

from mcp_servers.common.config import settings

# Known Chicago / Cook County Socrata dataset IDs
KNOWN_DATASETS = {
    "violations": "22u3-xenr",
    "inspections": "4ijn-s7e5",
    "permits": "ydr8-5enu",
    "311": "v6vf-nfxy",
    "vacant_buildings": "kc9i-wq85",
    "tax_annual": "55ju-2fs9",
    "tax_scavenger": "ydgz-vkrp",
}

SOCRATA_BASE = "https://data.cityofchicago.org"
COOK_COUNTY_BASE = "https://datacatalog.cookcountyil.gov"


class SocrataClient:
    """Thin wrapper around the Socrata SODA2 API."""

    def __init__(self, base_url: str = SOCRATA_BASE, app_token: str | None = None):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        token = app_token or settings.socrata_app_token
        if token:
            self.session.headers["X-App-Token"] = token

    def query(
        self,
        dataset_id: str,
        *,
        select: str | None = None,
        where: str | None = None,
        order: str | None = None,
        limit: int = 1000,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Execute a SoQL query and return rows as dicts."""
        params: dict[str, Any] = {"$limit": limit, "$offset": offset}
        if select:
            params["$select"] = select
        if where:
            params["$where"] = where
        if order:
            params["$order"] = order

        url = f"{self.base_url}/resource/{dataset_id}.json"
        resp = self.session.get(url, params=params, timeout=30)
        resp.raise_for_status()
        return resp.json()

    def count(self, dataset_id: str, *, where: str | None = None) -> int:
        """Return record count for a dataset with optional filter."""
        rows = self.query(dataset_id, select="count(*) as cnt", where=where, limit=1)
        return int(rows[0]["cnt"]) if rows else 0

    def metadata(self, dataset_id: str) -> dict[str, Any]:
        """Fetch dataset metadata (columns, row count, last updated)."""
        url = f"{self.base_url}/api/views/{dataset_id}.json"
        resp = self.session.get(url, timeout=30)
        resp.raise_for_status()
        return resp.json()

    def freshness(self, dataset_id: str) -> dict[str, Any]:
        """Return rowsUpdatedAt and age in hours."""
        meta = self.metadata(dataset_id)
        rows_updated = meta.get("rowsUpdatedAt")
        result = {"dataset_id": dataset_id, "rowsUpdatedAt": rows_updated}
        if rows_updated:
            from datetime import datetime, timezone
            updated_dt = datetime.fromtimestamp(rows_updated, tz=timezone.utc)
            age_hours = (datetime.now(timezone.utc) - updated_dt).total_seconds() / 3600
            result["age_hours"] = round(age_hours, 1)
        return result
