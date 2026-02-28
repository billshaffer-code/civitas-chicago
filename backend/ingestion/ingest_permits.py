"""
CIVITAS ETL – Building Permits ingestion.
Source: chicago_datasets/building_permits.csv
Target: fact_permit  (and dim_parcel for PIN linkage)
"""

from __future__ import annotations

import csv
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Optional

import psycopg2.extras

from backend.ingestion.base import (
    AddressStandardizer, BatchTracker, get_conn, upsert_location,
)

log = logging.getLogger(__name__)

CSV_PATH = Path(__file__).parents[2] / "chicago_datasets" / "building_permits.csv"
SOURCE   = "building_permits"
BATCH_SZ = 5_000


def _parse_date(val: str) -> Optional[datetime.date]:
    val = (val or "").strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(val, fmt).date()
        except ValueError:
            continue
    return None


def _normalize_pin(raw: str) -> Optional[str]:
    """Strip all non-digit characters; return 14-digit string or None."""
    digits = re.sub(r"\D", "", raw or "")
    return digits if len(digits) == 14 else None


def upsert_parcel(conn, pin: str, loc_sk: int) -> Optional[int]:
    """Insert or return parcel_sk for a given 14-digit PIN."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO dim_parcel (parcel_id, location_sk)
            VALUES (%s, %s)
            ON CONFLICT (parcel_id) DO UPDATE SET updated_at = NOW()
            RETURNING parcel_sk
            """,
            (pin, loc_sk),
        )
        return cur.fetchone()[0]


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
                        street_number=row.get("STREET_NUMBER", ""),
                        street_direction=row.get("STREET_DIRECTION", ""),
                        street_name=row.get("STREET_NAME", ""),
                    )

                    loc_sk = upsert_location(conn, parsed, lat, lon)
                    if loc_sk is None:
                        skipped += 1
                        continue

                    # PIN / parcel linkage
                    parcel_sk = None
                    pin_raw = row.get("PIN_LIST", "")
                    # PIN_LIST may be blank or contain multiple PINs; take the first valid one
                    for candidate in re.split(r"[;,\s]+", pin_raw):
                        pin = _normalize_pin(candidate)
                        if pin:
                            parcel_sk = upsert_parcel(conn, pin, loc_sk)
                            break

                    proc_time = row.get("PROCESSING_TIME", "")
                    try:
                        pt = int(float(proc_time)) if proc_time.strip() else None
                    except (ValueError, AttributeError):
                        pt = None

                    total_fee = row.get("TOTAL_FEE", "")
                    try:
                        tf = float(total_fee) if total_fee.strip() else None
                    except (ValueError, AttributeError):
                        tf = None

                    buf.append((
                        loc_sk,
                        parcel_sk,
                        row.get("ID"),
                        row.get("PERMIT#"),
                        row.get("PERMIT_STATUS"),
                        row.get("PERMIT_TYPE"),
                        _parse_date(row.get("APPLICATION_START_DATE", "")),
                        _parse_date(row.get("ISSUE_DATE", "")),
                        pt,
                        tf,
                        row.get("WORK_DESCRIPTION"),
                        SOURCE,
                        batch.batch_id,
                    ))

                    if len(buf) >= BATCH_SZ:
                        _flush(conn, buf)
                        total += len(buf)
                        buf.clear()
                        log.info("Permits: %d loaded …", total)

                except Exception as exc:
                    log.warning("Row skipped: %s", exc)
                    skipped += 1

            if buf:
                _flush(conn, buf)
                total += len(buf)

        conn.close()
        batch.complete(total)
        log.info("Permits complete. Loaded=%d  Skipped=%d", total, skipped)


def _flush(conn, rows: list[tuple]):
    with conn.cursor() as cur:
        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO fact_permit
                (location_sk, parcel_sk, source_id, permit_number,
                 permit_status, permit_type,
                 application_start_date, issue_date, processing_time,
                 total_fee, work_description,
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
