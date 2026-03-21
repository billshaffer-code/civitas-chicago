"""
Tests for tasks.staleness_check.
"""

from __future__ import annotations

from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock

import pytest

from tasks.tests.conftest import FakeCursor, FakeConn


class TestStalenessCheck:
    """Test the staleness_check task."""

    def _make_conn(self, rows):
        """Build a FakeConn whose first cursor returns the given rows."""
        cur = FakeCursor(fetchall_return=rows)
        return FakeConn(cursor=cur)

    def _run_with_conn(self, conn):
        """Patch get_conn and run the task."""
        with patch("tasks.staleness_check.get_conn", return_value=conn):
            from tasks.staleness_check import run
            return run()

    def test_all_fresh(self):
        """All datasets within threshold → no alerts."""
        now = datetime.now(timezone.utc)
        fresh = now - timedelta(hours=1)
        rows = [
            ("building_violations", fresh),
            ("food_inspections", fresh),
            ("building_permits", fresh),
            ("311_service_requests", fresh),
            ("cook_county_tax_liens", fresh),
            ("vacant_building_violations", fresh),
        ]
        conn = self._make_conn(rows)
        result = self._run_with_conn(conn)

        assert result["all_fresh"] is True
        assert result["alerts"] == []
        assert result["datasets_checked"] == 6

    def test_one_stale(self):
        """One dataset exceeds threshold → one alert."""
        now = datetime.now(timezone.utc)
        fresh = now - timedelta(hours=1)
        stale = now - timedelta(hours=200)
        rows = [
            ("building_violations", stale),
            ("food_inspections", fresh),
            ("building_permits", fresh),
            ("311_service_requests", fresh),
            ("cook_county_tax_liens", fresh),
            ("vacant_building_violations", fresh),
        ]
        conn = self._make_conn(rows)
        result = self._run_with_conn(conn)

        assert result["all_fresh"] is False
        assert "building_violations" in result["alerts"]

    def test_missing_dataset(self):
        """Missing dataset (no ingestion rows) → alert fires."""
        now = datetime.now(timezone.utc)
        fresh = now - timedelta(hours=1)
        # Omit building_violations entirely
        rows = [
            ("food_inspections", fresh),
            ("building_permits", fresh),
            ("311_service_requests", fresh),
            ("cook_county_tax_liens", fresh),
            ("vacant_building_violations", fresh),
        ]
        conn = self._make_conn(rows)
        result = self._run_with_conn(conn)

        assert result["all_fresh"] is False
        assert "building_violations" in result["alerts"]

    def test_webhook_called_when_alerts(self):
        """Webhook POST called when ALERT_WEBHOOK_URL set and alerts exist."""
        now = datetime.now(timezone.utc)
        stale = now - timedelta(hours=200)
        rows = [
            ("building_violations", stale),
        ]
        conn = self._make_conn(rows)

        mock_post = MagicMock()
        with patch("tasks.staleness_check.get_conn", return_value=conn), \
             patch.dict("os.environ", {"ALERT_WEBHOOK_URL": "https://hooks.example.com/test"}), \
             patch("requests.post", mock_post):
            from tasks.staleness_check import run
            run()

        mock_post.assert_called_once()
        call_kwargs = mock_post.call_args
        assert call_kwargs[1]["json"]["type"] == "staleness_alert"

    def test_results_written_to_quality_check(self):
        """Results are written to data_quality_check table."""
        now = datetime.now(timezone.utc)
        fresh = now - timedelta(hours=1)
        rows = [
            ("building_violations", fresh),
            ("food_inspections", fresh),
            ("building_permits", fresh),
            ("311_service_requests", fresh),
            ("cook_county_tax_liens", fresh),
            ("vacant_building_violations", fresh),
        ]
        cur = FakeCursor(fetchall_return=rows)
        conn = FakeConn(cursor=cur)

        with patch("tasks.staleness_check.get_conn", return_value=conn):
            from tasks.staleness_check import run
            run()

        # First call is the SELECT, subsequent calls are INSERTs
        insert_calls = [c for c in cur.executed if "INSERT INTO data_quality_check" in c[0]]
        assert len(insert_calls) == 6
