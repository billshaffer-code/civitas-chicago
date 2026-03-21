"""
CIVITAS Task – Report Staleness Check.

Finds reports generated before the latest ingestion and optionally regenerates them.
Schedule: 0 4 * * * (4 AM daily)
"""

from __future__ import annotations

import logging
import os
from typing import Any

from tasks.common.db import get_conn
from tasks.common.registry import register

log = logging.getLogger(__name__)


def run() -> dict[str, Any]:
    """Find and flag stale reports."""
    window_days = int(os.environ.get("REPORT_STALENESS_WINDOW_DAYS", 30))
    conn = get_conn()

    try:
        # Ensure is_stale column exists
        with conn.cursor() as cur:
            cur.execute(
                """
                DO $$
                BEGIN
                    ALTER TABLE report_audit ADD COLUMN IF NOT EXISTS is_stale BOOLEAN DEFAULT FALSE;
                EXCEPTION WHEN undefined_table THEN
                    NULL;
                END $$;
                """
            )
        conn.commit()

        # Find stale reports
        with conn.cursor() as cur:
            cur.execute(
                """
                WITH latest_ingestion AS (
                    SELECT MAX(completed_at) AS latest
                    FROM ingestion_batch
                    WHERE status = 'complete'
                )
                SELECT r.report_id, r.query_address, r.generated_at
                FROM report_audit r, latest_ingestion li
                WHERE r.generated_at < li.latest
                  AND r.generated_at > NOW() - INTERVAL '%s days'
                  AND (r.is_stale IS NULL OR r.is_stale = FALSE)
                """,
                (window_days,),
            )
            stale_reports = cur.fetchall()

        # Mark as stale
        stale_ids = [r[0] for r in stale_reports]
        if stale_ids:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE report_audit SET is_stale = TRUE WHERE report_id = ANY(%s)",
                    (stale_ids,),
                )
            conn.commit()
            log.info("Marked %d reports as stale", len(stale_ids))

        return {
            "stale_count": len(stale_ids),
            "window_days": window_days,
        }

    finally:
        conn.close()


register("report_staleness", run, "0 4 * * *")
