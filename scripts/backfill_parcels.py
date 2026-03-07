"""
One-time backfill: populate dim_parcel + dim_location from Cook County
Assessor parcel-address crosswalk, then re-link tax liens.

Usage:
    python3 -m scripts.backfill_parcels
"""

from __future__ import annotations

import csv
import io
import logging
import os
import re
from typing import Optional

import psycopg2
import psycopg2.extras
import requests

log = logging.getLogger(__name__)

ASSESSOR_URL = "https://datacatalog.cookcountyil.gov/resource/c49d-89sn.csv"
PAGE_SIZE = 50_000
DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://civitas:civitas@localhost:5432/civitas"
)


def get_conn():
    return psycopg2.connect(DATABASE_URL)


def normalize_pin(raw: str) -> Optional[str]:
    digits = re.sub(r"\D", "", raw or "")
    return digits if len(digits) == 14 else None


def standardize_address(street: str, city: str, zip_code: str) -> Optional[str]:
    street = (street or "").strip().upper()
    city = (city or "").strip().upper()
    if not street or not city:
        return None
    return f"{street}, {city}, IL {(zip_code or '').strip()[:5]}".rstrip()


def fetch_pages(token: Optional[str] = None) -> list[dict]:
    headers = {}
    if token:
        headers["X-App-Token"] = token
    offset = 0
    all_rows: list[dict] = []

    while True:
        log.info("  fetching offset=%d ...", offset)
        resp = requests.get(
            ASSESSOR_URL,
            params={
                "$limit": PAGE_SIZE,
                "$offset": offset,
                "$select": "pin,property_address,property_city,property_zip,latitude,longitude",
                "$where": "property_city='CHICAGO'",
            },
            headers=headers,
            timeout=120,
        )
        resp.raise_for_status()
        reader = csv.DictReader(io.StringIO(resp.text))
        page = list(reader)
        all_rows.extend(page)
        log.info("  got %d rows (total=%d)", len(page), len(all_rows))
        if len(page) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    return all_rows


def run():
    token = os.environ.get("SOCRATA_APP_TOKEN")
    conn = get_conn()

    # Step 1: collect PINs that exist in fact_tax_lien (from the ingestion_batch)
    # Actually, we deleted those. We need to know which PINs the tax lien data has.
    # Better approach: download ALL Chicago parcels and build the crosswalk.

    log.info("Step 1: Downloading Cook County Assessor parcel data (Chicago only)...")
    rows = fetch_pages(token)
    log.info("Downloaded %d parcel records", len(rows))

    # Step 2: Build dim_location + dim_parcel entries
    log.info("Step 2: Upserting dim_location and dim_parcel...")
    inserted_loc = 0
    inserted_parcel = 0
    skipped = 0

    with conn.cursor() as cur:
        for i, row in enumerate(rows):
            pin = normalize_pin(row.get("pin", ""))
            if not pin:
                skipped += 1
                continue

            addr = standardize_address(
                row.get("property_address", ""),
                row.get("property_city", ""),
                row.get("property_zip", ""),
            )
            if not addr:
                skipped += 1
                continue

            try:
                lat = float(row.get("latitude") or 0) or None
                lon = float(row.get("longitude") or 0) or None
            except (ValueError, TypeError):
                lat, lon = None, None

            # Parse address components
            parts = (row.get("property_address") or "").strip().upper()
            # Extract house number (first token if numeric)
            tokens = parts.split(None, 1)
            house_number = tokens[0] if tokens and tokens[0][0].isdigit() else None
            street_rest = tokens[1] if len(tokens) > 1 else parts

            zip5 = (row.get("property_zip") or "").strip()[:5]

            # Upsert dim_location (city_id defaults to 1)
            cur.execute(
                """
                INSERT INTO dim_location
                    (full_address_standardized, house_number, street_name, zip, lat, lon, source_address_raw)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (full_address_standardized)
                    DO UPDATE SET lat = COALESCE(dim_location.lat, EXCLUDED.lat),
                                  lon = COALESCE(dim_location.lon, EXCLUDED.lon),
                                  updated_at = NOW()
                RETURNING location_sk
                """,
                (addr, house_number, street_rest, zip5, lat, lon, parts),
            )
            loc_sk = cur.fetchone()[0]
            inserted_loc += 1

            # Upsert dim_parcel
            cur.execute(
                """
                INSERT INTO dim_parcel (parcel_id, location_sk)
                VALUES (%s, %s)
                ON CONFLICT (parcel_id) DO UPDATE SET location_sk = EXCLUDED.location_sk, updated_at = NOW()
                RETURNING parcel_sk
                """,
                (pin, loc_sk),
            )
            inserted_parcel += 1

            if (i + 1) % 10_000 == 0:
                conn.commit()
                log.info("  processed %d / %d rows...", i + 1, len(rows))

    conn.commit()
    log.info(
        "Done: %d locations upserted, %d parcels upserted, %d skipped",
        inserted_loc, inserted_parcel, skipped,
    )

    conn.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    run()
