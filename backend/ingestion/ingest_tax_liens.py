"""
CIVITAS ETL – Tax Lien ingestion from Cook County Socrata API.

Downloads both Annual and Scavenger tax sale datasets, normalizes PINs,
matches to dim_parcel (and dim_location via parcel), and loads fact_tax_lien.

Usage:
    python -m backend.ingestion.ingest_tax_liens

Environment:
    SOCRATA_APP_TOKEN  – optional Cook County Socrata API token (raises rate limit)
    DATABASE_URL       – PostgreSQL DSN
"""

from __future__ import annotations

import logging
import os
import re
from typing import Optional

import psycopg2.extras
import requests

from backend.ingestion.base import BatchTracker, get_conn

log = logging.getLogger(__name__)

SOCRATA_ENDPOINTS = {
    "annual":    "https://datacatalog.cookcountyil.gov/resource/55ju-2fs9.csv",
    "scavenger": "https://datacatalog.cookcountyil.gov/resource/ydgz-vkrp.csv",
}
PAGE_SIZE = 50_000
SOURCE    = "cook_county_tax_liens"

# Column mapping for each dataset type
COLUMN_MAP = {
    "annual": {
        "year":    "tax_sale_year",
        "pin":     "pin",
        "sold":    "sold_at_sale",
        "tax_amt": "tax_amount_offered",
        "pen_amt": "penalty_amount_offered",
        "tot_amt": "total_tax_and_penalty_amount_offered",
        "forf":    "total_amount_forfeited",
        "buyer":   None,
        "from":    None,
        "to":      None,
    },
    "scavenger": {
        "year":    "tax_sale_year",
        "pin":     "pin",
        "sold":    "sold_at_sale",
        "tax_amt": None,
        "pen_amt": None,
        "tot_amt": "total_amount_paid",
        "forf":    None,
        "buyer":   "buyer_name",
        "from":    "from_year",
        "to":      "to_year",
    },
}


def _normalize_pin(raw: str) -> Optional[str]:
    digits = re.sub(r"\D", "", raw or "")
    return digits if len(digits) == 14 else None


def _get_parcel_and_location(conn, pin: str):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT parcel_sk, location_sk FROM dim_parcel WHERE parcel_id = %s",
            (pin,),
        )
        row = cur.fetchone()
    if row:
        return row[0], row[1]
    return None, None


def _fetch_pages(url: str, token: Optional[str]) -> list[dict]:
    """Paginate through Socrata CSV endpoint, return all rows as dicts."""
    headers = {}
    if token:
        headers["X-App-Token"] = token
    offset = 0
    all_rows: list[dict] = []

    while True:
        resp = requests.get(
            url,
            params={"$limit": PAGE_SIZE, "$offset": offset},
            headers=headers,
            timeout=60,
        )
        resp.raise_for_status()
        import csv, io
        reader = csv.DictReader(io.StringIO(resp.text))
        page = list(reader)
        all_rows.extend(page)
        log.info("  fetched %d rows (offset=%d)", len(page), offset)
        if len(page) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    return all_rows


def _run_dataset(conn, batch_id: int, lien_type: str, url: str, token: Optional[str]):
    cm = COLUMN_MAP[lien_type]
    rows_raw = _fetch_pages(url, token)
    log.info("%s: %d rows downloaded", lien_type, len(rows_raw))

    buf: list[tuple] = []
    skipped = 0

    for row in rows_raw:
        pin_raw = row.get(cm["pin"], "")
        pin = _normalize_pin(pin_raw)
        if not pin:
            skipped += 1
            continue

        parcel_sk, location_sk = _get_parcel_and_location(conn, pin)

        def _f(key, fallback=None):
            col = cm.get(key)
            if not col:
                return fallback
            val = row.get(col, "")
            return val.strip() or fallback

        def _num(key):
            col = cm.get(key)
            if not col:
                return None
            val = row.get(col, "").strip()
            try:
                return float(val) if val else None
            except ValueError:
                return None

        def _int(key):
            col = cm.get(key)
            if not col:
                return None
            val = row.get(col, "").strip()
            try:
                return int(val) if val else None
            except ValueError:
                return None

        def _bool(key):
            col = cm.get(key)
            if not col:
                return None
            val = (row.get(col, "") or "").strip().upper()
            return val in ("Y", "YES", "TRUE", "1") if val else None

        buf.append((
            parcel_sk,
            location_sk,
            None,                    # source_id (no unique key in Socrata)
            _int("year"),
            lien_type.upper(),
            _int("from"),
            _int("to"),
            _bool("sold"),
            _num("tax_amt"),
            _num("pen_amt"),
            _num("tot_amt"),
            _num("forf"),
            _f("buyer"),
            SOURCE,
            batch_id,
        ))

        if len(buf) >= 5_000:
            _flush(conn, buf)
            buf.clear()

    if buf:
        _flush(conn, buf)

    log.info("%s: loaded %d rows, skipped %d", lien_type, len(rows_raw) - skipped, skipped)
    return len(rows_raw) - skipped


def _flush(conn, rows: list[tuple]):
    with conn.cursor() as cur:
        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO fact_tax_lien
                (parcel_sk, location_sk, source_id,
                 tax_sale_year, lien_type, from_year, to_year,
                 sold_at_sale,
                 tax_amount_offered, penalty_amount_offered,
                 total_amount_offered, total_amount_forfeited,
                 buyer_name, source_dataset, ingestion_batch_id)
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

    with BatchTracker(SOURCE) as batch:
        for lien_type, url in SOCRATA_ENDPOINTS.items():
            log.info("Fetching %s tax liens …", lien_type)
            n = _run_dataset(conn, batch.batch_id, lien_type, url, token)
            total += n

        conn.close()
        batch.complete(total)
        log.info("Tax liens complete. Total loaded=%d", total)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
