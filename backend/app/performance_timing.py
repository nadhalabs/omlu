"""Low-overhead, opt-in request/SQL timing for development and staging audits."""

from __future__ import annotations

import contextvars
import time
from typing import Any

from sqlalchemy import event
from sqlalchemy.engine import Engine


_request_metrics: contextvars.ContextVar[dict[str, Any] | None] = contextvars.ContextVar(
    "request_performance_metrics", default=None
)


def begin_request_metrics() -> tuple[dict[str, Any], contextvars.Token]:
    metrics: dict[str, Any] = {
        "started": time.perf_counter(),
        "sql_ms": 0.0,
        "sql_count": 0,
        "slowest_sql_ms": 0.0,
    }
    return metrics, _request_metrics.set(metrics)


def end_request_metrics(token: contextvars.Token) -> None:
    _request_metrics.reset(token)


def install_engine_timing(engine: Engine) -> None:
    if getattr(engine, "_omlu_timing_installed", False):
        return
    engine._omlu_timing_installed = True

    @event.listens_for(engine, "before_cursor_execute")
    def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        # Keep this entirely dormant outside an explicitly instrumented
        # development/staging request.  The engine listener remains installed,
        # but normal production requests do not take a clock reading per SQL.
        if _request_metrics.get() is None:
            return
        context._omlu_query_started = time.perf_counter()

    @event.listens_for(engine, "after_cursor_execute")
    def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        metrics = _request_metrics.get()
        started = getattr(context, "_omlu_query_started", None)
        if metrics is None or started is None:
            return
        elapsed_ms = (time.perf_counter() - started) * 1000
        metrics["sql_count"] += 1
        metrics["sql_ms"] += elapsed_ms
        metrics["slowest_sql_ms"] = max(metrics["slowest_sql_ms"], elapsed_ms)

