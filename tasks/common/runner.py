"""
CIVITAS Tasks – CLI runner and APScheduler daemon.

Usage:
    python -m tasks.common.runner --task nightly_etl     # Run one task now
    python -m tasks.common.runner --scheduler            # Start APScheduler loop
    python -m tasks.common.runner --list                 # List registered tasks
"""

from __future__ import annotations

import argparse
import logging
import sys
import traceback

from tasks.common.db import log_task_start, log_task_complete, log_task_failure
from tasks.common.registry import _register_all, get_task, list_tasks

log = logging.getLogger(__name__)


def run_task(task_name: str, triggered_by: str = "cli"):
    """Execute a single task with full logging."""
    entry = get_task(task_name)
    if not entry:
        log.error("Unknown task: %s", task_name)
        sys.exit(1)

    func, _ = entry
    run_id = log_task_start(task_name, triggered_by)

    try:
        summary = func()
        log_task_complete(run_id, summary or {})
        log.info("Task %s completed successfully", task_name)
    except Exception as e:
        log_task_failure(run_id, f"{type(e).__name__}: {e}\n{traceback.format_exc()}")
        log.error("Task %s failed: %s", task_name, e)
        if triggered_by == "cli":
            sys.exit(1)


def start_scheduler():
    """Start APScheduler with cron triggers for all registered tasks."""
    from apscheduler.schedulers.blocking import BlockingScheduler
    from apscheduler.triggers.cron import CronTrigger

    scheduler = BlockingScheduler()
    tasks = list_tasks()

    for name, cron_expr in tasks.items():
        entry = get_task(name)
        if not entry:
            continue
        func, _ = entry
        parts = cron_expr.split()
        trigger = CronTrigger(
            minute=parts[0],
            hour=parts[1],
            day=parts[2],
            month=parts[3],
            day_of_week=parts[4],
        )
        scheduler.add_job(
            run_task,
            trigger,
            args=[name, "scheduler"],
            id=name,
            name=name,
            misfire_grace_time=3600,
        )
        log.info("Scheduled task %s with cron %s", name, cron_expr)

    log.info("Scheduler started with %d tasks", len(tasks))
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        log.info("Scheduler shutting down")


def main():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    parser = argparse.ArgumentParser(description="CIVITAS Task Runner")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--task", help="Run a specific task by name")
    group.add_argument("--scheduler", action="store_true", help="Start the scheduler daemon")
    group.add_argument("--list", action="store_true", help="List all registered tasks")
    args = parser.parse_args()

    _register_all()

    if args.list:
        tasks = list_tasks()
        for name, cron in sorted(tasks.items()):
            print(f"  {name:25s}  {cron}")
        return

    if args.task:
        run_task(args.task)
        return

    if args.scheduler:
        start_scheduler()


if __name__ == "__main__":
    main()
