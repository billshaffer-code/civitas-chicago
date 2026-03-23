"""
CIVITAS Task – Refresh Materialized View.

Schedule: 0 3 * * * (3 AM daily, after ETL)
"""

from __future__ import annotations

import logging
import time
from typing import Any

from tasks.common.db import get_conn
from tasks.common.registry import register

log = logging.getLogger(__name__)


def run() -> dict[str, Any]:
    """Refresh the property summary materialized view."""
    start = time.time()
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY view_property_summary")
            cur.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY view_community_area_summary")
        conn.commit()
        duration = round(time.time() - start, 1)
        log.info("Materialized view refreshed in %.1fs", duration)
        return {"duration_s": duration, "status": "refreshed"}
    finally:
        conn.close()


register("refresh_scores", run, "0 3 * * *")
