"""
CIVITAS – Tests for the batch/portfolio analysis endpoints.
"""

from __future__ import annotations

import io
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch
from uuid import UUID

import pytest
import httpx


MOCK_BATCH_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"


# ── Helpers ──────────────────────────────────────────────────────────────────

def make_csv(rows: list[str], header: str = "address") -> bytes:
    lines = [header] + rows
    return "\n".join(lines).encode()


def upload_form(csv_bytes: bytes, filename: str = "test.csv"):
    return {"file": (filename, io.BytesIO(csv_bytes), "text/csv")}


# ── Upload Tests ─────────────────────────────────────────────────────────────

async def test_upload_valid_csv(client):
    csv = make_csv(["123 N MAIN ST", "456 S OAK AVE"])

    with patch("backend.app.routers.batch.get_conn") as mock_gc:
        conn = AsyncMock()
        conn.fetchrow = AsyncMock(return_value={"batch_id": UUID(MOCK_BATCH_ID)})
        conn.execute = AsyncMock()

        @asynccontextmanager
        async def _gc():
            yield conn

        mock_gc.side_effect = _gc

        resp = await client.post(
            "/api/v1/batch/upload",
            files={"file": ("test.csv", io.BytesIO(csv), "text/csv")},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["batch_id"] == MOCK_BATCH_ID
    assert data["total_count"] == 2


async def test_upload_missing_address_column(client):
    csv = b"name,zip\nFoo,60601\n"

    resp = await client.post(
        "/api/v1/batch/upload",
        files={"file": ("test.csv", io.BytesIO(csv), "text/csv")},
    )

    assert resp.status_code == 400
    assert "address column" in resp.json()["detail"].lower()


async def test_upload_empty_csv(client):
    csv = b"address\n"

    resp = await client.post(
        "/api/v1/batch/upload",
        files={"file": ("test.csv", io.BytesIO(csv), "text/csv")},
    )

    assert resp.status_code == 400
    assert "no valid" in resp.json()["detail"].lower()


async def test_upload_exceeds_row_limit(client):
    rows = [f"{i} N TEST ST" for i in range(51)]
    csv = make_csv(rows)

    with patch("backend.app.routers.batch.get_conn") as mock_gc:
        conn = AsyncMock()

        @asynccontextmanager
        async def _gc():
            yield conn

        mock_gc.side_effect = _gc

        resp = await client.post(
            "/api/v1/batch/upload",
            files={"file": ("test.csv", io.BytesIO(csv), "text/csv")},
        )

    assert resp.status_code == 400
    assert "50" in resp.json()["detail"]


async def test_upload_non_csv(client):
    resp = await client.post(
        "/api/v1/batch/upload",
        files={"file": ("test.txt", io.BytesIO(b"hello"), "text/plain")},
    )
    assert resp.status_code == 400
    assert "csv" in resp.json()["detail"].lower()


# ── Get Batch Tests ──────────────────────────────────────────────────────────

async def test_get_batch_not_found(client):
    with patch("backend.app.routers.batch.get_conn") as mock_gc:
        conn = AsyncMock()
        conn.fetchrow = AsyncMock(return_value=None)

        @asynccontextmanager
        async def _gc():
            yield conn

        mock_gc.side_effect = _gc

        resp = await client.get(f"/api/v1/batch/{MOCK_BATCH_ID}")

    assert resp.status_code == 404


async def test_get_batch_found(client):
    batch_row = {
        "batch_id": UUID(MOCK_BATCH_ID),
        "batch_name": "Test Batch",
        "total_count": 2,
        "completed_count": 2,
        "failed_count": 0,
        "status": "completed",
        "created_at": datetime(2025, 6, 1, tzinfo=timezone.utc),
        "completed_at": datetime(2025, 6, 1, tzinfo=timezone.utc),
        "user_id": UUID("00000000-0000-0000-0000-000000000001"),
    }

    item_rows = [
        {
            "row_index": 0,
            "input_address": "123 N MAIN ST",
            "status": "completed",
            "report_id": UUID("11111111-1111-1111-1111-111111111111"),
            "error_message": None,
            "risk_score": 55,
            "risk_tier": "ACTIVE",
            "flag_count": 2,
        },
        {
            "row_index": 1,
            "input_address": "456 S OAK AVE",
            "status": "completed",
            "report_id": UUID("22222222-2222-2222-2222-222222222222"),
            "error_message": None,
            "risk_score": 10,
            "risk_tier": "QUIET",
            "flag_count": 0,
        },
    ]

    call_count = 0

    with patch("backend.app.routers.batch.get_conn") as mock_gc:
        @asynccontextmanager
        async def _gc():
            nonlocal call_count
            conn = AsyncMock()
            if call_count == 0:
                conn.fetchrow = AsyncMock(return_value=batch_row)
            else:
                conn.fetch = AsyncMock(return_value=item_rows)
            call_count += 1
            yield conn

        mock_gc.side_effect = _gc

        resp = await client.get(f"/api/v1/batch/{MOCK_BATCH_ID}")

    assert resp.status_code == 200
    data = resp.json()
    assert data["batch_id"] == MOCK_BATCH_ID
    assert data["total_count"] == 2
    assert len(data["items"]) == 2
    assert data["avg_activity_score"] == 32.5
    assert data["level_distribution"]["ACTIVE"] == 1
    assert data["level_distribution"]["QUIET"] == 1


# ── My Batches Test ──────────────────────────────────────────────────────────

async def test_my_batches(client):
    rows = [
        {
            "batch_id": UUID(MOCK_BATCH_ID),
            "batch_name": "Test",
            "total_count": 3,
            "completed_count": 3,
            "failed_count": 0,
            "status": "completed",
            "created_at": datetime(2025, 6, 1, tzinfo=timezone.utc),
        }
    ]

    with patch("backend.app.routers.batch.get_conn") as mock_gc:
        conn = AsyncMock()
        conn.fetch = AsyncMock(return_value=rows)

        @asynccontextmanager
        async def _gc():
            yield conn

        mock_gc.side_effect = _gc

        resp = await client.get("/api/v1/batch/my-batches")

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["batch_id"] == MOCK_BATCH_ID
