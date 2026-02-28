"""
CIVITAS ETL – 311 Service Requests ingestion.
Source: chicago_datasets/311.csv  (~13.4 M rows)
Target: fact_311

Skips rows where DUPLICATE = true or address fields are null.
Commits every BATCH_SZ rows; logs progress every 100 k rows.
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

CSV_PATH = Path(__file__).parents[2] / "chicago_datasets" / "311.csv"
SOURCE   = "311_service_requests"
BATCH_SZ = 10_000
LOG_EVERY = 100_000


def _parse_ts(val: str) -> Optional[datetime]:
    val = (val or "").strip()
    for fmt in ("%m/%d/%Y %I:%M:%S %p", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(val, fmt)
        except ValueError:
            continue
    return None


def run():
    std  = AddressStandardizer()
    conn = get_conn()

    with BatchTracker(SOURCE, str(CSV_PATH)) as batch:
        total   = 0
        skipped = 0
        buf: list[tuple] = []

        with open(CSV_PATH, encoding="utf-8-sig", newline="") as fh:
            reader = csv.DictReader(fh)

            for row in reader:
                # Skip duplicates
                if (row.get("DUPLICATE") or "").strip().lower() in ("true", "1", "yes"):
                    skipped += 1
                    continue

                # Require at least a street address or street name
                street_name = row.get("STREET_NAME", "").strip()
                street_addr = row.get("STREET_ADDRESS", "").strip()
                if not street_name and not street_addr:
                    skipped += 1
                    continue

                try:
                    lat = float(row.get("LATITUDE") or 0) or None
                    lon = float(row.get("LONGITUDE") or 0) or None

                    parsed = std.parse(
                        raw_address=street_addr,
                        street_number=row.get("STREET_NUMBER", ""),
                        street_direction=row.get("STREET_DIRECTION", ""),
                        street_name=street_name,
                        street_type=row.get("STREET_TYPE", ""),
                        zip_code=row.get("ZIP_CODE", ""),
                    )

                    loc_sk = upsert_location(conn, parsed, lat, lon)
                    if loc_sk is None:
                        skipped += 1
                        continue

                    buf.append((
                        loc_sk,
                        row.get("SR_NUMBER"),
                        row.get("SR_TYPE"),
                        row.get("SR_SHORT_CODE"),
                        row.get("STATUS"),
                        _parse_ts(row.get("CREATED_DATE", "")),
                        _parse_ts(row.get("CLOSED_DATE", "")),
                        SOURCE,
                        batch.batch_id,
                    ))

                    if len(buf) >= BATCH_SZ:
                        _flush(conn, buf)
                        total += len(buf)
                        buf.clear()
                        if total % LOG_EVERY < BATCH_SZ:
                            log.info("311: %d loaded …", total)

                except Exception as exc:
                    log.warning("Row skipped: %s", exc)
                    conn.rollback()   # reset aborted-transaction state
                    skipped += 1

            if buf:
                _flush(conn, buf)
                total += len(buf)

        conn.close()
        batch.complete(total)
        log.info("311 complete. Loaded=%d  Skipped=%d", total, skipped)


def _flush(conn, rows: list[tuple]):
    try:
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO fact_311
                    (location_sk, source_id, sr_type, sr_short_code, status,
                     created_date, closed_date,
                     source_dataset, ingestion_batch_id)
                VALUES %s
                ON CONFLICT DO NOTHING
                """,
                rows,
                page_size=2000,
            )
        conn.commit()
    except Exception as exc:
        conn.rollback()
        log.warning("Batch flush failed (%d rows dropped): %s", len(rows), exc)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
