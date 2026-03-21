"""
Tests for tasks.usage_analytics.
"""

from __future__ import annotations

from unittest.mock import patch

from tasks.tests.conftest import FakeCursor, FakeConn


class TestUsageAnalytics:
    """Test the usage_analytics task."""

    def _make_conn(self, reports_count, top_addresses):
        """Build a FakeConn that cycles through expected query results."""
        class MultiCursor(FakeCursor):
            def __init__(self):
                super().__init__()
                self._call = 0

            def fetchone(self):
                self._call += 1
                return (reports_count,)

            def fetchall(self):
                return top_addresses

        cur = MultiCursor()
        return FakeConn(cursor=cur)

    def test_returns_expected_keys(self):
        """Returns reports_generated + top_addresses keys."""
        conn = self._make_conn(5, [("123 N MAIN ST", 3), ("456 S OAK AVE", 2)])

        with patch("tasks.usage_analytics.get_conn", return_value=conn):
            from tasks.usage_analytics import run
            result = run()

        assert "reports_generated" in result
        assert "top_addresses" in result
        assert result["reports_generated"] == 5
        assert len(result["top_addresses"]) == 2

    def test_writes_to_analytics_table(self):
        """Writes to usage_analytics table."""
        cur_instance = type("MCur", (FakeCursor,), {
            "_call": 0,
            "fetchone": lambda self: (10,),
            "fetchall": lambda self: [],
        })()
        conn = FakeConn(cursor=cur_instance)

        with patch("tasks.usage_analytics.get_conn", return_value=conn):
            from tasks.usage_analytics import run
            run()

        insert_calls = [c for c in cur_instance.executed if "INSERT INTO usage_analytics" in c[0]]
        assert len(insert_calls) == 1
