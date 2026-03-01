"""
CIVITAS ETL – Vacant Building Violations from Chicago Data Portal.

Dataset: kc9i-wq85 (~5K rows)
Downloads JSON via Socrata API, parses free-form addresses,
and loads fact_vacant_building.

Usage:
    python -m backend.ingestion.ingest_vacant_buildings

Environment:
    SOCRATA_APP_TOKEN  – optional (raises rate limit)
    DATABASE_URL       – PostgreSQL DSN
"""

from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import Optional

import psycopg2.extras
import requests

from backend.ingestion.base import (
    AddressStandardizer,
    BatchTracker,
    get_conn,
    upsert_location,
)

log = logging.getLogger(__name__)

ENDPOINT  = "https://data.cityofchicago.org/resource/kc9i-wq85.json"
PAGE_SIZE = 50_000
SOURCE    = "vacant_building_violations"

addr_std = AddressStandardizer()


def _parse_date(val: Optional[str]) -> Optional[datetime]:
    """Parse ISO-ish date from Socrata JSON (e.g. '2015-06-23T00:00:00.000')."""
    if not val:
        return None
    try:
        return datetime.fromisoformat(val.replace("T00:00:00.000", "")).date()
    except (ValueError, AttributeError):
        return None


def _num(val: Optional[str]) -> Optional[float]:
    if not val:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _fetch_pages(token: Optional[str]) -> list[dict]:
    """Paginate through Socrata JSON endpoint."""
    headers = {}
    if token:
        headers["X-App-Token"] = token
    offset = 0
    all_rows: list[dict] = []

    while True:
        resp = requests.get(
            ENDPOINT,
            params={"$limit": PAGE_SIZE, "$offset": offset},
            headers=headers,
            timeout=60,
        )
        resp.raise_for_status()
        page = resp.json()
        all_rows.extend(page)
        log.info("  fetched %d rows (offset=%d)", len(page), offset)
        if len(page) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    return all_rows


def _flush(conn, rows: list[tuple]):
    with conn.cursor() as cur:
        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO fact_vacant_building
                (location_sk, source_id, docket_number, violation_number,
                 issued_date, last_hearing_date, violation_type,
                 entity_or_person, disposition_description,
                 total_fines, current_amount_due, total_paid,
                 source_dataset, ingestion_batch_id)
            VALUES %s
            ON CONFLICT DO NOTHING
            """,
            rows,
            page_size=1000,
        )
    conn.commit()


def run():
    token = os.environ.get("SOCRATA_APP_TOKEN")
    conn  = get_conn()
    total = 0
    skipped = 0

    with BatchTracker(SOURCE) as batch:
        log.info("Fetching vacant building violations …")
        rows_raw = _fetch_pages(token)
        log.info("Downloaded %d rows", len(rows_raw))

        buf: list[tuple] = []

        for row in rows_raw:
            # Parse address — dataset has free-form property_address
            raw_addr = row.get("property_address", "")
            lat = _num(row.get("latitude"))
            lon = _num(row.get("longitude"))

            parsed = addr_std.parse(raw_address=raw_addr)

            if parsed.confidence == "FAILED":
                skipped += 1
                continue

            location_sk = upsert_location(conn, parsed, lat=lat, lon=lon)
            if not location_sk:
                skipped += 1
                continue

            docket = (row.get("docket_number") or "").strip() or None
            violation_num = (row.get("violation_number") or "").strip() or None
            source_id = docket or violation_num

            buf.append((
                location_sk,
                source_id,
                docket,
                violation_num,
                _parse_date(row.get("issued_date")),
                _parse_date(row.get("last_hearing_date")),
                (row.get("violation_type") or "")[:200] or None,
                (row.get("entity_or_person_s_") or "")[:300] or None,
                row.get("disposition_description") or None,
                _num(row.get("total_fines")),
                _num(row.get("current_amount_due")),
                _num(row.get("total_paid")),
                SOURCE,
                batch.batch_id,
            ))

            if len(buf) >= 5_000:
                _flush(conn, buf)
                buf.clear()

        if buf:
            _flush(conn, buf)

        total = len(rows_raw) - skipped
        conn.close()
        batch.complete(total)
        log.info("Vacant buildings complete. Loaded=%d, skipped=%d", total, skipped)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
