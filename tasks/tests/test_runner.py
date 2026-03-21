"""
Tests for tasks.common.runner.
"""

from __future__ import annotations

from unittest.mock import patch, MagicMock

import pytest

from tasks.common.runner import run_task


class TestRunTask:
    """Test the run_task function."""

    def test_calls_logging_and_func(self):
        """run_task calls log_task_start + func + log_task_complete."""
        mock_func = MagicMock(return_value={"ok": True})
        mock_start = MagicMock(return_value=42)
        mock_complete = MagicMock()

        with patch("tasks.common.runner.get_task", return_value=(mock_func, "0 * * * *")), \
             patch("tasks.common.runner.log_task_start", mock_start), \
             patch("tasks.common.runner.log_task_complete", mock_complete):
            run_task("test_task", triggered_by="test")

        mock_start.assert_called_once_with("test_task", "test")
        mock_func.assert_called_once()
        mock_complete.assert_called_once_with(42, {"ok": True})

    def test_failure_calls_log_failure(self):
        """run_task with failing func calls log_task_failure."""
        mock_func = MagicMock(side_effect=ValueError("boom"))
        mock_start = MagicMock(return_value=42)
        mock_failure = MagicMock()

        with patch("tasks.common.runner.get_task", return_value=(mock_func, "0 * * * *")), \
             patch("tasks.common.runner.log_task_start", mock_start), \
             patch("tasks.common.runner.log_task_complete"), \
             patch("tasks.common.runner.log_task_failure", mock_failure):
            # triggered_by != "cli" so it won't sys.exit
            run_task("test_task", triggered_by="scheduler")

        mock_failure.assert_called_once()
        assert "ValueError: boom" in mock_failure.call_args[0][1]

    def test_unknown_task_exits(self):
        """Unknown task name → sys.exit."""
        with patch("tasks.common.runner.get_task", return_value=None):
            with pytest.raises(SystemExit):
                run_task("nonexistent_task")
