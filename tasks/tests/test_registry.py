"""
Tests for tasks.common.registry.
"""

from __future__ import annotations

from unittest.mock import patch

from tasks.common.registry import register, get_task, list_tasks


class TestRegistry:
    """Test the task registry."""

    def test_register_and_get(self):
        """register + get_task returns (callable, cron)."""
        def my_func():
            return {"done": True}

        with patch.dict("tasks.common.registry._registry", {}, clear=True):
            register("test_task", my_func, "0 * * * *")
            result = get_task("test_task")

        assert result is not None
        func, cron = result
        assert func is my_func
        assert cron == "0 * * * *"

    def test_list_tasks(self):
        """list_tasks returns all registered tasks."""
        def a():
            pass

        def b():
            pass

        with patch.dict("tasks.common.registry._registry", {}, clear=True):
            register("task_a", a, "0 1 * * *")
            register("task_b", b, "0 2 * * *")
            tasks = list_tasks()

        assert "task_a" in tasks
        assert "task_b" in tasks
        assert tasks["task_a"] == "0 1 * * *"

    def test_get_unknown(self):
        """get_task for unknown name → None."""
        with patch.dict("tasks.common.registry._registry", {}, clear=True):
            assert get_task("nonexistent") is None
