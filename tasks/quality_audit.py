"""
CIVITAS Task – Data Quality Audit.

Checks for orphaned records, duplicates, and null FK counts.
Schedule: 0 6 * * 0 (6 AM Sunday)
"""

from __future__ import annotations

import json
import logging
from typing import Any

from tasks.common.db import get_conn
from tasks.common.registry import register

log = logging.getLogger(__name__)

AUDIT_QUERIES = [
    {
        "metric": "orphaned_tax_liens",
        "sql": """
            SELECT COUNT(*) FROM fact_tax_lien
            WHERE location_sk IS NULL AND parcel_sk IS NULL
        """,
    },
    {
        "metric": "duplicate_locations",
        "sql": """
            SELECT COUNT(*) FROM (
                SELECT full_address_standardized
                FROM dim_location
                GROUP BY full_address_standardized
                HAVING COUNT(*) > 1
            ) dupes
        """,
    },
    {
        "metric": "null_location_violations",
        "sql": "SELECT COUNT(*) FROM fact_violation WHERE location_sk IS NULL",
    },
    {
        "metric": "null_location_inspections",
        "sql": "SELECT COUNT(*) FROM fact_inspection WHERE location_sk IS NULL",
    },
    {
        "metric": "null_location_permits",
        "sql": "SELECT COUNT(*) FROM fact_permit WHERE location_sk IS NULL",
    },
    {
        "metric": "null_location_311",
        "sql": "SELECT COUNT(*) FROM fact_311 WHERE location_sk IS NULL",
    },
    {
        "metric": "unlinked_parcels",
        "sql": "SELECT COUNT(*) FROM dim_parcel WHERE location_sk IS NULL",
    },
]


def run() -> dict[str, Any]:
    """Run all quality audit queries and log results."""
    conn = get_conn()
    results = {}

    try:
        for audit in AUDIT_QUERIES:
            metric = audit["metric"]
            with conn.cursor() as cur:
                cur.execute(audit["sql"])
                value = cur.fetchone()[0]

            results[metric] = value

            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO data_quality_check
                        (check_type, metric_name, metric_value, is_alert, details)
                    VALUES ('orphan_audit', %s, %s, %s, %s)
                    """,
                    (metric, value, value > 0, json.dumps({"count": value})),
                )
            conn.commit()

            if value > 0:
                log.warning("Quality issue: %s = %d", metric, value)
            else:
                log.info("Quality check: %s = 0 (clean)", metric)

    finally:
        conn.close()

    return results


register("quality_audit", run, "0 6 * * 0")
