"""TaskFlow FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.logging import logger, setup_logging
from app.db.session import engine, Base

# Import models to register them with Base
import app.models.models  # noqa: F401

from app.api.v1 import auth, jobs, workers, analytics


setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("TaskFlow API starting up...")
    # Create all tables (use Alembic in production)
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables ensured")
    yield
    logger.info("TaskFlow API shutting down")


app = FastAPI(
    title="TaskFlow API",
    description="Distributed Job Queue & Task Processing Platform",
    version=settings.APP_VERSION,
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
API_PREFIX = "/api/v1"
app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(jobs.router, prefix=API_PREFIX)
app.include_router(workers.router, prefix=API_PREFIX)
app.include_router(analytics.router, prefix=API_PREFIX)


@app.get("/")
def root():
    return {"name": "TaskFlow", "version": settings.APP_VERSION, "status": "running"}


@app.get("/health")
def health():
    from app.services.queue import ping_redis
    from sqlalchemy import text

    db_ok = False
    redis_ok = False

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        pass

    try:
        redis_ok = ping_redis()
    except Exception:
        pass

    overall = "healthy" if db_ok and redis_ok else "degraded"
    return {
        "status": overall,
        "database": "ok" if db_ok else "error",
        "redis": "ok" if redis_ok else "error",
        "version": settings.APP_VERSION,
    }


@app.get("/health/live")
def health_live():
    return {"status": "alive"}


@app.get("/health/ready")
def health_ready():
    from app.services.queue import ping_redis
    from sqlalchemy import text

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        from fastapi import Response
        return Response(content='{"status":"not ready","reason":"database"}', status_code=503)

    if not ping_redis():
        from fastapi import Response
        return Response(content='{"status":"not ready","reason":"redis"}', status_code=503)

    return {"status": "ready"}
