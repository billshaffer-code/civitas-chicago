"""
CIVITAS – Request logging middleware.

Logs method, path, status code, and duration for every request.
"""

import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

log = logging.getLogger("civitas.requests")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = uuid.uuid4().hex[:12]
        start = time.monotonic()

        try:
            response = await call_next(request)
        except Exception:
            duration_ms = round((time.monotonic() - start) * 1000, 1)
            log.error(
                "req=%s %s %s -> 500 (unhandled) %.1fms",
                request_id, request.method, request.url.path, duration_ms,
            )
            raise

        duration_ms = round((time.monotonic() - start) * 1000, 1)
        log.info(
            "req=%s %s %s -> %s %.1fms",
            request_id, request.method, request.url.path,
            response.status_code, duration_ms,
        )
        response.headers["X-Request-ID"] = request_id
        return response
