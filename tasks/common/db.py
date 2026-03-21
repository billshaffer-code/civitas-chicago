"""
CIVITAS Tasks – psycopg2 DB helpers for task run logging.
"""

from __future__ import annotations

import json
import os
import time
import logging
from typing import Any, Optional

import psycopg2
import psycopg2.extras

log = logging.getLogger(__name__)


def get_conn():
    """Return a new psycopg2 connection from DATABASE_URL env var."""
    dsn = os.environ.get("DATABASE_URL", "postgresql://civitas:civitas@localhost:5432/civitas")
    return psycopg2.connect(dsn)


def log_task_start(task_name: str, triggered_by: str = "scheduler") -> int:
    """Insert a task_run record and return the run_id."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO task_run (task_name, status, triggered_by)
                VALUES (%s, 'running', %s)
                RETURNING run_id
                """,
                (task_name, triggered_by),
            )
            run_id = cur.fetchone()[0]
        conn.commit()
        log.info("Task %s started (run_id=%d, triggered_by=%s)", task_name, run_id, triggered_by)
        return run_id
    finally:
        conn.close()


def log_task_complete(run_id: int, summary: dict[str, Any]):
    """Mark a task_run as completed with duration and summary."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE task_run
                SET status = 'completed',
                    completed_at = NOW(),
                    duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER * 1000,
                    result_summary = %s
                WHERE run_id = %s
                """,
                (json.dumps(summary), run_id),
            )
        conn.commit()
        log.info("Task run_id=%d completed", run_id)
    finally:
        conn.close()


def log_task_failure(run_id: int, error: str):
    """Mark a task_run as failed with error message."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE task_run
                SET status = 'failed',
                    completed_at = NOW(),
                    duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER * 1000,
                    error_message = %s
                WHERE run_id = %s
                """,
                (error, run_id),
            )
        conn.commit()
        log.error("Task run_id=%d failed: %s", run_id, error)
    finally:
        conn.close()
