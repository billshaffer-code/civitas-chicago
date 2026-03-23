"""
Ingest Chicago community area boundaries into dim_community_area.

Downloads the official 77 community area GeoJSON from the Chicago Data Portal
and loads boundary polygons into PostGIS.

Usage:
    python3 -m scripts.ingest_community_areas
"""

from __future__ import annotations

import json
import logging
import os
import sys

import psycopg2
import requests

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://civitas:civitas@localhost:5432/civitas"
)

# Chicago Data Portal community area boundaries (SODA2 GeoJSON endpoint)
GEOJSON_URL = (
    "https://data.cityofchicago.org/resource/igwz-8jzy.geojson"
    "?$limit=100"
)


def get_conn():
    return psycopg2.connect(DATABASE_URL)


def download_geojson() -> dict:
    """Download community area boundaries GeoJSON."""
    log.info("Downloading community area boundaries from Chicago Data Portal...")
    resp = requests.get(GEOJSON_URL, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    log.info("Downloaded %d features", len(data.get("features", [])))
    return data


def ingest(geojson: dict):
    """Insert community area boundaries into dim_community_area."""
    conn = get_conn()
    cur = conn.cursor()

    inserted = 0
    skipped = 0

    for feature in geojson["features"]:
        props = feature["properties"]
        geom = feature["geometry"]

        # Chicago Data Portal uses 'area_numbe' (truncated) and 'community'
        area_id = int(props.get("area_numbe") or props.get("area_num_1", 0))
        name = (props.get("community") or "").strip().upper()

        if not area_id or not name:
            log.warning("Skipping feature with missing id/name: %s", props)
            skipped += 1
            continue

        geom_json = json.dumps(geom)

        cur.execute(
            """
            INSERT INTO dim_community_area (community_area_id, name, geom)
            VALUES (%s, %s, ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326))
            ON CONFLICT (community_area_id) DO UPDATE
                SET name = EXCLUDED.name,
                    geom = EXCLUDED.geom
            """,
            (area_id, name, geom_json),
        )
        inserted += 1

    conn.commit()
    cur.close()
    conn.close()
    log.info("Ingested %d community areas (%d skipped)", inserted, skipped)


def main():
    geojson = download_geojson()
    ingest(geojson)


if __name__ == "__main__":
    main()
