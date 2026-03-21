"""
CIVITAS Task – Data Staleness Check.

Checks each dataset's most recent ingestion against configurable thresholds.
Schedule: 0 8 * * * (8 AM daily)
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

from tasks.common.db import get_conn
from tasks.common.registry import register

log = logging.getLogger(__name__)

# Default staleness thresholds in hours
THRESHOLDS = {
    "building_violations": int(os.environ.get("STALENESS_THRESHOLD_VIOLATIONS", 72)),
    "food_inspections": int(os.environ.get("STALENESS_THRESHOLD_INSPECTIONS", 72)),
    "building_permits": int(os.environ.get("STALENESS_THRESHOLD_PERMITS", 72)),
    "311_service_requests": int(os.environ.get("STALENESS_THRESHOLD_311", 72)),
    "cook_county_tax_liens": int(os.environ.get("STALENESS_THRESHOLD_TAX_LIENS", 168)),
    "vacant_building_violations": int(os.environ.get("STALENESS_THRESHOLD_VACANT", 168)),
}


def run() -> dict[str, Any]:
    """Check data freshness per dataset and log alerts."""
    conn = get_conn()
    alerts = []
    checks = []

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT source_dataset, MAX(completed_at) AS latest
                FROM ingestion_batch
                WHERE status = 'complete'
                GROUP BY source_dataset
                """
            )
            rows = cur.fetchall()

        now = datetime.now(timezone.utc)
        freshness = {row[0]: row[1] for row in rows}

        for dataset, threshold_hours in THRESHOLDS.items():
            latest = freshness.get(dataset)
            if latest is None:
                age_hours = None
                is_alert = True
            else:
                if latest.tzinfo is None:
                    from datetime import timezone as tz
                    latest = latest.replace(tzinfo=tz.utc)
                age_hours = round((now - latest).total_seconds() / 3600, 1)
                is_alert = age_hours > threshold_hours

            check = {
                "dataset": dataset,
                "age_hours": age_hours,
                "threshold_hours": threshold_hours,
                "is_alert": is_alert,
            }
            checks.append(check)

            if is_alert:
                alerts.append(dataset)
                log.warning("STALE: %s (age=%.1fh, threshold=%dh)",
                            dataset, age_hours or -1, threshold_hours)

            # Write to data_quality_check
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO data_quality_check
                        (check_type, dataset, metric_name, metric_value, threshold, is_alert, details)
                    VALUES ('staleness', %s, 'age_hours', %s, %s, %s, %s)
                    """,
                    (dataset, age_hours, threshold_hours, is_alert, json.dumps(check)),
                )
            conn.commit()

        # Optional webhook
        webhook_url = os.environ.get("ALERT_WEBHOOK_URL")
        if webhook_url and alerts:
            try:
                import requests
                requests.post(webhook_url, json={
                    "type": "staleness_alert",
                    "stale_datasets": alerts,
                    "checks": checks,
                }, timeout=10)
            except Exception as e:
                log.error("Webhook POST failed: %s", e)

    finally:
        conn.close()

    return {
        "datasets_checked": len(checks),
        "alerts": alerts,
        "all_fresh": len(alerts) == 0,
    }


register("staleness_check", run, "0 8 * * *")
