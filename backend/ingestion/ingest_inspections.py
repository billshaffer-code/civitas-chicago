"""
CIVITAS ETL – Food Inspections ingestion.
Source: chicago_datasets/food_inspections.csv
Target: fact_inspection
"""

from __future__ import annotations

import csv
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

import psycopg2.extras

from backend.ingestion.base import (
    AddressStandardizer, BatchTracker, get_conn, upsert_location,
)

log = logging.getLogger(__name__)

CSV_PATH = Path(__file__).parents[2] / "chicago_datasets" / "food_inspections.csv"
SOURCE   = "food_inspections"
BATCH_SZ = 5_000


def _parse_date(val: str) -> Optional[datetime.date]:
    val = (val or "").strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(val, fmt).date()
        except ValueError:
            continue
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
                    lat = float(row.get("Latitude") or 0) or None
                    lon = float(row.get("Longitude") or 0) or None
                    zip_code = row.get("Zip", "")

                    parsed = std.parse(
                        raw_address=row.get("Address", ""),
                        zip_code=zip_code,
                    )

                    loc_sk = upsert_location(conn, parsed, lat, lon)
                    if loc_sk is None:
                        skipped += 1
                        continue

                    buf.append((
                        loc_sk,
                        row.get("Inspection ID"),
                        row.get("DBA Name"),
                        row.get("Facility Type"),
                        row.get("Risk"),
                        _parse_date(row.get("Inspection Date", "")),
                        row.get("Inspection Type"),
                        row.get("Results"),
                        row.get("Violations"),
                        SOURCE,
                        batch.batch_id,
                    ))

                    if len(buf) >= BATCH_SZ:
                        _flush(conn, buf)
                        total += len(buf)
                        buf.clear()
                        log.info("Inspections: %d loaded …", total)

                except Exception as exc:
                    log.warning("Row skipped: %s", exc)
                    skipped += 1

            if buf:
                _flush(conn, buf)
                total += len(buf)

        conn.close()
        batch.complete(total)
        log.info("Inspections complete. Loaded=%d  Skipped=%d", total, skipped)


def _flush(conn, rows: list[tuple]):
    with conn.cursor() as cur:
        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO fact_inspection
                (location_sk, source_id, dba_name, facility_type, risk_level,
                 inspection_date, inspection_type, results, violations_text,
                 source_dataset, ingestion_batch_id)
            VALUES %s
            ON CONFLICT DO NOTHING
            """,
            rows,
            page_size=1000,
        )
    conn.commit()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
