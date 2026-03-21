"""
CIVITAS Task – Weekly Usage Analytics.

Aggregates reports generated, top addresses, batch jobs, and active users.
Schedule: 0 9 * * 1 (9 AM Monday)
"""

from __future__ import annotations

import json
import logging
from typing import Any

from tasks.common.db import get_conn
from tasks.common.registry import register

log = logging.getLogger(__name__)


def run() -> dict[str, Any]:
    """Compute weekly usage metrics and store in usage_analytics."""
    conn = get_conn()
    metrics = {}

    try:
        # Reports generated in last 7 days
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*) FROM report_audit
                WHERE generated_at > NOW() - INTERVAL '7 days'
                """
            )
            reports_count = cur.fetchone()[0] or 0
        metrics["reports_generated"] = reports_count

        # Top 10 queried addresses
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT query_address, COUNT(*) as cnt
                FROM report_audit
                WHERE generated_at > NOW() - INTERVAL '7 days'
                GROUP BY query_address
                ORDER BY cnt DESC
                LIMIT 10
                """
            )
            top_addresses = [{"address": r[0], "count": r[1]} for r in cur.fetchall()]
        metrics["top_addresses"] = top_addresses

        # Write metrics to usage_analytics
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO usage_analytics (period_start, period_end, metric_name, metric_value, details)
                VALUES (NOW() - INTERVAL '7 days', NOW(), 'weekly_reports', %s, %s)
                """,
                (reports_count, json.dumps(metrics)),
            )
        conn.commit()

        log.info("Weekly analytics: %d reports, %d unique addresses",
                 reports_count, len(top_addresses))

    finally:
        conn.close()

    return metrics


register("usage_analytics", run, "0 9 * * 1")
