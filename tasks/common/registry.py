"""
CIVITAS Tasks – Task registry mapping names to callables and cron schedules.
"""

from __future__ import annotations

from typing import Callable

_registry: dict[str, tuple[Callable, str]] = {}


def register(name: str, func: Callable, cron: str):
    """Register a task with its name, callable, and cron expression."""
    _registry[name] = (func, cron)


def get_task(name: str) -> tuple[Callable, str] | None:
    """Return (callable, cron) for a task name, or None."""
    return _registry.get(name)


def list_tasks() -> dict[str, str]:
    """Return {name: cron_expression} for all registered tasks."""
    return {name: cron for name, (_, cron) in _registry.items()}


def _register_all():
    """Import all task modules to trigger their registration."""
    from tasks import nightly_etl  # noqa: F401
    from tasks import staleness_check  # noqa: F401
    from tasks import quality_audit  # noqa: F401
    from tasks import refresh_scores  # noqa: F401
    from tasks import report_staleness  # noqa: F401
    from tasks import usage_analytics  # noqa: F401
