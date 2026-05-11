import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
import asyncpg
import aioredis
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from routers import auth, sessions, tasks, orders, users, stats, settings, proxies
from core.database import init_db
from core.redis_client import init_redis
from core.security import verify_api_key

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address)

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await init_redis()
    logger.info("✅ API started successfully")
    yield
    logger.info("API shutting down...")

app = FastAPI(
    title="Session Manager Pro API",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(sessions.router, prefix="/api/sessions", tags=["sessions"])
app.include_router(tasks.router, prefix="/api/tasks", tags=["tasks"])
app.include_router(orders.router, prefix="/api/orders", tags=["orders"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(stats.router, prefix="/api/stats", tags=["stats"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(proxies.router, prefix="/api/proxies", tags=["proxies"])

@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error: {exc}", exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
