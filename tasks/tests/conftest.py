"""
CIVITAS Tasks – Shared test fixtures.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


# ── Fake psycopg2 cursor ────────────────────────────────────────────────────

class FakeCursor:
    """Minimal stand-in for psycopg2 cursor."""

    def __init__(self, fetchone_return=None, fetchall_return=None):
        self.fetchone_return = fetchone_return or (0,)
        self.fetchall_return = fetchall_return or []
        self.executed = []

    def execute(self, query, params=None):
        self.executed.append((query, params))

    def fetchone(self):
        return self.fetchone_return

    def fetchall(self):
        return self.fetchall_return

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass


class FakeConn:
    """Minimal stand-in for psycopg2 connection."""

    def __init__(self, cursor=None):
        self._cursor = cursor or FakeCursor()

    def cursor(self):
        return self._cursor

    def commit(self):
        pass

    def close(self):
        pass


# ── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture
def fake_cursor():
    """Return a FakeCursor factory."""
    return FakeCursor


@pytest.fixture
def fake_conn():
    """Return a FakeConn factory."""
    return FakeConn


@pytest.fixture
def mock_task_db(fake_conn):
    """Patch tasks.common.db.get_conn to return a FakeConn."""
    conn = fake_conn()

    with patch("tasks.common.db.get_conn", return_value=conn):
        yield conn


@pytest.fixture(autouse=True)
def mock_task_logging():
    """Patch task logging functions to no-op (avoid real DB writes)."""
    with patch("tasks.common.db.log_task_start", return_value=1), \
         patch("tasks.common.db.log_task_complete"), \
         patch("tasks.common.db.log_task_failure"):
        yield
