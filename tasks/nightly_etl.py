"""
CIVITAS Task – Nightly ETL.

Runs all 6 ingestion scripts sequentially, then refreshes the materialized view.
Schedule: 0 2 * * * (2 AM daily)
"""

from __future__ import annotations

import logging
import time
from typing import Any

from tasks.common.db import get_conn
from tasks.common.registry import register

log = logging.getLogger(__name__)

# Ingestion modules and their run() functions
SCRIPTS = [
    ("violations", "backend.ingestion.ingest_violations"),
    ("inspections", "backend.ingestion.ingest_inspections"),
    ("permits", "backend.ingestion.ingest_permits"),
    ("311", "backend.ingestion.ingest_311"),
    ("tax_liens", "backend.ingestion.ingest_tax_liens"),
    ("vacant_buildings", "backend.ingestion.ingest_vacant_buildings"),
]


def run() -> dict[str, Any]:
    """Execute all ingestion scripts and refresh materialized view."""
    total_start = time.time()
    results = []

    for name, module_path in SCRIPTS:
        script_start = time.time()
        try:
            import importlib
            mod = importlib.import_module(module_path)
            mod.run()
            duration = round(time.time() - script_start, 1)
            results.append({"name": name, "status": "ok", "duration_s": duration})
            log.info("ETL %s completed in %.1fs", name, duration)
        except Exception as e:
            duration = round(time.time() - script_start, 1)
            results.append({"name": name, "status": "failed", "error": str(e), "duration_s": duration})
            log.error("ETL %s failed: %s", name, e)

    # Refresh materialized view
    matview_refreshed = False
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY view_property_summary")
        conn.commit()
        conn.close()
        matview_refreshed = True
        log.info("Materialized view refreshed")
    except Exception as e:
        log.error("Materialized view refresh failed: %s", e)

    total_duration = round(time.time() - total_start, 1)
    return {
        "scripts": results,
        "total_duration_s": total_duration,
        "matview_refreshed": matview_refreshed,
        "succeeded": sum(1 for r in results if r["status"] == "ok"),
        "failed": sum(1 for r in results if r["status"] == "failed"),
    }


register("nightly_etl", run, "0 2 * * *")
