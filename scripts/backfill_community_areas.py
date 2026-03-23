"""
Backfill community_area_id on dim_location via PostGIS spatial join.

Assigns each property to one of Chicago's 77 community areas based on
its lat/lon point falling within the community area boundary polygon.

Idempotent — only updates rows where community_area_id IS NULL.

Usage:
    python3 -m scripts.backfill_community_areas
"""

from __future__ import annotations

import logging
import os

import psycopg2

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://civitas:civitas@localhost:5432/civitas"
)


def get_conn():
    return psycopg2.connect(DATABASE_URL)


def backfill():
    conn = get_conn()
    cur = conn.cursor()

    # Count unassigned locations with geometry
    cur.execute(
        """
        SELECT COUNT(*)
        FROM dim_location
        WHERE geom IS NOT NULL AND community_area_id IS NULL
        """
    )
    pending = cur.fetchone()[0]
    log.info("Found %d locations to assign", pending)

    if pending == 0:
        log.info("Nothing to do")
        cur.close()
        conn.close()
        return

    # Spatial join: assign community_area_id based on point-in-polygon
    log.info("Running spatial join (this may take a few minutes)...")
    cur.execute(
        """
        UPDATE dim_location l
        SET community_area_id = ca.community_area_id
        FROM dim_community_area ca
        WHERE l.geom IS NOT NULL
          AND l.community_area_id IS NULL
          AND ST_Within(l.geom, ca.geom)
        """
    )
    updated = cur.rowcount
    conn.commit()

    # Check how many remain unassigned (outside all boundaries)
    cur.execute(
        """
        SELECT COUNT(*)
        FROM dim_location
        WHERE geom IS NOT NULL AND community_area_id IS NULL
        """
    )
    remaining = cur.fetchone()[0]

    cur.close()
    conn.close()

    log.info(
        "Assigned %d locations to community areas (%d remain unassigned — outside boundaries)",
        updated,
        remaining,
    )


def main():
    backfill()


if __name__ == "__main__":
    main()
