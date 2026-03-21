"""
Tests for tasks.quality_audit.
"""

from __future__ import annotations

from unittest.mock import patch

from tasks.tests.conftest import FakeCursor, FakeConn


class TestQualityAudit:
    """Test the quality_audit task."""

    def _make_conn(self, counts):
        """Build a FakeConn whose cursor cycles through count values."""
        class MultiCursor(FakeCursor):
            def __init__(self, values):
                super().__init__()
                self._values = list(values)
                self._idx = 0

            def fetchone(self):
                val = self._values[self._idx % len(self._values)]
                self._idx += 1
                return (val,)

        cur = MultiCursor(counts)
        return FakeConn(cursor=cur)

    def test_all_clean(self):
        """All counts zero → clean report."""
        conn = self._make_conn([0, 0, 0, 0, 0, 0, 0])

        with patch("tasks.quality_audit.get_conn", return_value=conn):
            from tasks.quality_audit import run
            result = run()

        assert all(v == 0 for v in result.values())
        assert len(result) == 7

    def test_orphan_alert(self):
        """Non-zero orphan count → present in results."""
        # First metric (orphaned_tax_liens) = 42, rest = 0
        conn = self._make_conn([42, 0, 0, 0, 0, 0, 0])

        with patch("tasks.quality_audit.get_conn", return_value=conn):
            from tasks.quality_audit import run
            result = run()

        assert result["orphaned_tax_liens"] == 42

    def test_all_seven_metrics(self):
        """Result summary contains all 7 metrics."""
        conn = self._make_conn([1, 2, 3, 4, 5, 6, 7])

        with patch("tasks.quality_audit.get_conn", return_value=conn):
            from tasks.quality_audit import run
            result = run()

        expected_keys = {
            "orphaned_tax_liens",
            "duplicate_locations",
            "null_location_violations",
            "null_location_inspections",
            "null_location_permits",
            "null_location_311",
            "unlinked_parcels",
        }
        assert set(result.keys()) == expected_keys
