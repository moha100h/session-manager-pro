from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import logging
import time

from core.database import init_db, close_db
from core.redis_client import init_redis, close_redis
from routers import auth, sessions, tasks, orders, users, stats, proxies, settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("api")

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await init_db()
        await init_redis()
        logger.info("✅ API started successfully")
        yield
    except Exception as exc:
        logger.exception(f"❌ Startup failed: {exc}")
        raise
    finally:
        await close_db()
        await close_redis()
        logger.info("🛑 API stopped")

app = FastAPI(
    title="Session Manager Pro API",
    description="سیستم مدیریت سشن تلگرام",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# ── Rate limiting ساده بدون SlowAPI ───────────────────────────
from collections import defaultdict
_request_counts: dict = defaultdict(list)

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    client_ip = request.client.host if request.client else "unknown"
    now = time.time()
    window = 60  # ثانیه
    max_requests = 200

    # پاک‌سازی درخواست‌های قدیمی
    _request_counts[client_ip] = [t for t in _request_counts[client_ip] if now - t < window]

    if len(_request_counts[client_ip]) >= max_requests:
        return JSONResponse(
            status_code=429,
            content={"detail": "تعداد درخواست‌ها بیش از حد مجاز است. لطفاً کمی صبر کنید."}
        )

    _request_counts[client_ip].append(now)
    response = await call_next(request)
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "Session Manager Pro", "version": "1.0.0"}

app.include_router(auth.router,     prefix="/api/auth",     tags=["auth"])
app.include_router(sessions.router, prefix="/api/sessions", tags=["sessions"])
app.include_router(tasks.router,    prefix="/api/tasks",    tags=["tasks"])
app.include_router(orders.router,   prefix="/api/orders",   tags=["orders"])
app.include_router(users.router,    prefix="/api/users",    tags=["users"])
app.include_router(stats.router,    prefix="/api/stats",    tags=["stats"])
app.include_router(proxies.router,  prefix="/api/proxies",  tags=["proxies"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
