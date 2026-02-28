"""
CIVITAS ETL Base – BatchTracker and AddressStandardizer.

BatchTracker: opens/closes ingestion_batch records.
AddressStandardizer: normalizes raw address components into
a canonical full_address_standardized string and returns
structured fields for dim_location upsert.
"""

from __future__ import annotations

import os
import re
import logging
from dataclasses import dataclass
from typing import Optional

import psycopg2
import psycopg2.extras
import usaddress

log = logging.getLogger(__name__)

# ─── DB helpers ───────────────────────────────────────────────────────────────

def get_conn():
    """Return a new psycopg2 connection from DATABASE_URL env var."""
    dsn = os.environ.get("DATABASE_URL", "postgresql://civitas:civitas@localhost:5432/civitas")
    return psycopg2.connect(dsn)


# ─── BatchTracker ─────────────────────────────────────────────────────────────

class BatchTracker:
    """Context manager that opens and closes an ingestion_batch record."""

    def __init__(self, source_dataset: str, file_path: str = ""):
        self.source_dataset = source_dataset
        self.file_path = file_path
        self.batch_id: Optional[int] = None
        self._conn = None

    def __enter__(self) -> "BatchTracker":
        self._conn = get_conn()
        with self._conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO ingestion_batch (source_dataset, file_path, status)
                VALUES (%s, %s, 'running')
                RETURNING ingestion_batch_id
                """,
                (self.source_dataset, self.file_path),
            )
            self.batch_id = cur.fetchone()[0]
        self._conn.commit()
        log.info("Opened batch %d for %s", self.batch_id, self.source_dataset)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            self._finalize("failed", 0)
        # rows_loaded is set explicitly via complete()
        return False

    def complete(self, rows_loaded: int):
        self._finalize("complete", rows_loaded)

    def _finalize(self, status: str, rows: int):
        with self._conn.cursor() as cur:
            cur.execute(
                """
                UPDATE ingestion_batch
                   SET status = %s, rows_loaded = %s, completed_at = NOW()
                 WHERE ingestion_batch_id = %s
                """,
                (status, rows, self.batch_id),
            )
        self._conn.commit()
        self._conn.close()
        log.info("Batch %d closed: %s (%d rows)", self.batch_id, status, rows)


# ─── Street-type and direction normalization tables ───────────────────────────

_STREET_TYPE = {
    "AVENUE": "AVE", "BOULEVARD": "BLVD", "CIRCLE": "CIR", "COURT": "CT",
    "DRIVE": "DR", "EXPRESSWAY": "EXPY", "HIGHWAY": "HWY", "LANE": "LN",
    "PARKWAY": "PKWY", "PLACE": "PL", "ROAD": "RD", "SQUARE": "SQ",
    "STREET": "ST", "TERRACE": "TER", "TRAIL": "TRL", "WAY": "WAY",
}

_DIRECTION = {
    "NORTH": "N", "SOUTH": "S", "EAST": "E", "WEST": "W",
    "NORTHEAST": "NE", "NORTHWEST": "NW", "SOUTHEAST": "SE", "SOUTHWEST": "SW",
}


def _norm_type(val: Optional[str]) -> Optional[str]:
    if not val:
        return None
    v = val.strip().upper().rstrip(".")
    return _STREET_TYPE.get(v, v) or None


def _norm_dir(val: Optional[str]) -> Optional[str]:
    if not val:
        return None
    v = val.strip().upper().rstrip(".")
    return _DIRECTION.get(v, v) or None


# ─── ParsedAddress dataclass ──────────────────────────────────────────────────

@dataclass
class ParsedAddress:
    house_number: Optional[str]
    street_direction: Optional[str]
    street_name: Optional[str]
    street_type: Optional[str]
    unit: Optional[str]
    zip: Optional[str]
    full_address_standardized: str
    confidence: str          # HIGH | LOW | FAILED


# ─── AddressStandardizer ──────────────────────────────────────────────────────

class AddressStandardizer:
    """
    Produces ParsedAddress from raw CSV fields.

    Strategy 1 (preferred): use structured columns (STREET NUMBER, DIRECTION,
    STREET NAME, STREET TYPE) when available – avoids parser ambiguity.
    Strategy 2: parse the free-form ADDRESS string with usaddress.
    """

    def parse(
        self,
        raw_address: str = "",
        street_number: str = "",
        street_direction: str = "",
        street_name: str = "",
        street_type: str = "",
        zip_code: str = "",
        unit: str = "",
    ) -> ParsedAddress:

        # ── Strategy 1: structured columns ──────────────────────────────────
        if street_number.strip() and street_name.strip():
            return self._from_structured(
                street_number, street_direction, street_name, street_type,
                zip_code, unit,
            )

        # ── Strategy 2: free-form parsing ────────────────────────────────────
        if raw_address.strip():
            return self._from_raw(raw_address, zip_code)

        return ParsedAddress(
            house_number=None, street_direction=None, street_name=None,
            street_type=None, unit=None, zip=None,
            full_address_standardized="", confidence="FAILED",
        )

    def _from_structured(
        self,
        number: str, direction: str, name: str, stype: str,
        zip_code: str, unit: str,
    ) -> ParsedAddress:
        hn   = number.strip().upper()[:20]   # truncate; skip garbage like narrative descriptions
        dire = _norm_dir(direction)
        nm   = name.strip().upper()
        st   = _norm_type(stype)
        u    = unit.strip() or None
        z    = re.sub(r"\D", "", zip_code)[:5] or None

        parts = [p for p in [hn, dire, nm, st] if p]
        addr  = " ".join(parts)
        if z:
            addr = f"{addr}, CHICAGO IL {z}"

        return ParsedAddress(
            house_number=hn or None,
            street_direction=dire,
            street_name=nm or None,
            street_type=st,
            unit=u,
            zip=z,
            full_address_standardized=addr,
            confidence="HIGH" if hn and nm else "LOW",
        )

    def _from_raw(self, raw: str, zip_hint: str = "") -> ParsedAddress:
        try:
            tagged, _ = usaddress.tag(raw)
        except usaddress.RepeatedLabelError:
            return ParsedAddress(
                house_number=None, street_direction=None, street_name=None,
                street_type=None, unit=None, zip=None,
                full_address_standardized="", confidence="FAILED",
            )

        hn   = tagged.get("AddressNumber", "").upper().strip() or None
        dire = _norm_dir(tagged.get("StreetNamePreDirectional", ""))
        nm   = tagged.get("StreetName", "").upper().strip() or None
        st   = _norm_type(tagged.get("StreetNamePostType", ""))
        u    = tagged.get("OccupancyIdentifier") or None
        z    = tagged.get("ZipCode", zip_hint)
        z    = re.sub(r"\D", "", z or "")[:5] or None

        parts = [p for p in [hn, dire, nm, st] if p]
        addr  = " ".join(parts) if parts else ""
        if z and addr:
            addr = f"{addr}, CHICAGO IL {z}"

        confidence = "HIGH" if hn and nm else ("LOW" if nm else "FAILED")
        return ParsedAddress(
            house_number=hn,
            street_direction=dire,
            street_name=nm,
            street_type=st,
            unit=u,
            zip=z,
            full_address_standardized=addr,
            confidence=confidence,
        )


# ─── Location upsert ──────────────────────────────────────────────────────────

def upsert_location(
    conn,
    parsed: ParsedAddress,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
) -> Optional[int]:
    """
    Returns location_sk from dim_location.
    Uses INSERT ... ON CONFLICT DO NOTHING RETURNING + fallback SELECT
    to safely handle concurrent inserts without deadlocks.
    Returns None if the address could not be standardized.
    """
    if not parsed.full_address_standardized:
        return None

    with conn.cursor() as cur:
        if lat and lon:
            cur.execute(
                """
                INSERT INTO dim_location
                    (full_address_standardized, house_number, street_direction,
                     street_name, street_type, unit, zip, lat, lon, geom,
                     source_address_raw, city_id)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,
                        ST_SetSRID(ST_MakePoint(%s,%s),4326),
                        %s, 1)
                ON CONFLICT (full_address_standardized) DO NOTHING
                RETURNING location_sk
                """,
                (
                    parsed.full_address_standardized,
                    parsed.house_number, parsed.street_direction,
                    parsed.street_name, parsed.street_type,
                    parsed.unit, parsed.zip,
                    lat, lon, lon, lat,
                    parsed.full_address_standardized,
                ),
            )
        else:
            cur.execute(
                """
                INSERT INTO dim_location
                    (full_address_standardized, house_number, street_direction,
                     street_name, street_type, unit, zip,
                     source_address_raw, city_id)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,1)
                ON CONFLICT (full_address_standardized) DO NOTHING
                RETURNING location_sk
                """,
                (
                    parsed.full_address_standardized,
                    parsed.house_number, parsed.street_direction,
                    parsed.street_name, parsed.street_type,
                    parsed.unit, parsed.zip,
                    parsed.full_address_standardized,
                ),
            )
        row = cur.fetchone()
        if row:
            return row[0]
        # Another process inserted it concurrently – fetch the existing row
        cur.execute(
            "SELECT location_sk FROM dim_location WHERE full_address_standardized = %s",
            (parsed.full_address_standardized,),
        )
        row = cur.fetchone()
        return row[0] if row else None
