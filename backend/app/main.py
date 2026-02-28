"""
CIVITAS – FastAPI application entry point.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.database import init_pool, close_pool
from backend.app.routers import property as property_router
from backend.app.routers import report as report_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    yield
    await close_pool()


app = FastAPI(
    title="CIVITAS Municipal Risk API",
    description="Chicago v1 – Deterministic property risk intelligence",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(property_router.router)
app.include_router(report_router.router)


@app.get("/api/v1/health")
async def health():
    from backend.app.database import get_conn
    from datetime import datetime, timezone

    try:
        async with get_conn() as conn:
            await conn.fetchval("SELECT 1")
        db_ok = True
    except Exception:
        db_ok = False

    return {
        "status": "ok" if db_ok else "degraded",
        "db_connected": db_ok,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
