"""
CIVITAS ETL – Building Violations ingestion.
Source: chicago_datasets/building_violations.csv
Target: fact_violation
"""

from __future__ import annotations

import csv
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Optional

from backend.ingestion.base import (
    AddressStandardizer, BatchTracker, get_conn, upsert_location,
)

log = logging.getLogger(__name__)

CSV_PATH = Path(__file__).parents[2] / "chicago_datasets" / "building_violations.csv"
SOURCE   = "building_violations"
BATCH_SZ = 10_000


def _parse_date(val: str) -> Optional[datetime.date]:
    val = (val or "").strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(val, fmt).date()
        except ValueError:
            continue
    return None


def _parse_bool(val: str) -> Optional[bool]:
    v = (val or "").strip().upper()
    if v in ("Y", "YES", "TRUE", "1"):
        return True
    if v in ("N", "NO", "FALSE", "0"):
        return False
    return None


def run():
    std  = AddressStandardizer()
    conn = get_conn()

    with BatchTracker(SOURCE, str(CSV_PATH)) as batch:
        total = 0
        skipped = 0
        buf: list[tuple] = []

        with open(CSV_PATH, encoding="utf-8-sig", newline="") as fh:
            reader = csv.DictReader(fh)

            for row in reader:
                try:
                    lat = float(row.get("LATITUDE") or 0) or None
                    lon = float(row.get("LONGITUDE") or 0) or None

                    parsed = std.parse(
                        raw_address=row.get("ADDRESS", ""),
                        street_number=row.get("STREET NUMBER", ""),
                        street_direction=row.get("STREET DIRECTION", ""),
                        street_name=row.get("STREET NAME", ""),
                        street_type=row.get("STREET TYPE", ""),
                    )

                    loc_sk = upsert_location(conn, parsed, lat, lon)
                    if loc_sk is None:
                        skipped += 1
                        continue

                    buf.append((
                        loc_sk,
                        row.get("ID"),
                        _parse_date(row.get("VIOLATION DATE", "")),
                        _parse_date(row.get("VIOLATION LAST MODIFIED DATE", "")),
                        row.get("VIOLATION CODE"),
                        row.get("VIOLATION STATUS"),
                        _parse_date(row.get("VIOLATION STATUS DATE", "")),
                        row.get("VIOLATION DESCRIPTION"),
                        row.get("VIOLATION ORDINANCE"),
                        row.get("VIOLATION INSPECTOR COMMENTS"),
                        row.get("INSPECTION NUMBER"),
                        row.get("INSPECTION STATUS"),
                        row.get("INSPECTION CATEGORY"),
                        row.get("DEPARTMENT BUREAU"),
                        SOURCE,
                        batch.batch_id,
                    ))

                    if len(buf) >= BATCH_SZ:
                        _flush(conn, buf)
                        total += len(buf)
                        buf.clear()
                        log.info("Violations: %d loaded …", total)

                except Exception as exc:
                    log.warning("Row skipped: %s", exc)
                    skipped += 1

            if buf:
                _flush(conn, buf)
                total += len(buf)

        conn.close()
        batch.complete(total)
        log.info("Violations complete. Loaded=%d  Skipped=%d", total, skipped)


def _flush(conn, rows: list[tuple]):
    with conn.cursor() as cur:
        psycopg2_extras_execute_values(cur, rows)
    conn.commit()


def psycopg2_extras_execute_values(cur, rows):
    import psycopg2.extras
    psycopg2.extras.execute_values(
        cur,
        """
        INSERT INTO fact_violation
            (location_sk, source_id,
             violation_date, violation_last_modified,
             violation_code, violation_status, violation_status_date,
             violation_description, violation_ordinance, inspector_comments,
             inspection_number, inspection_status, inspection_category,
             department_bureau, source_dataset, ingestion_batch_id)
        VALUES %s
        ON CONFLICT DO NOTHING
        """,
        rows,
        page_size=1000,
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
