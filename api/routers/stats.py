from fastapi import APIRouter, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from core.database import fetch_one, fetch_all
from core.security import verify_token
from core.redis_client import cache_set, cache_get
from datetime import datetime, timedelta

router = APIRouter()
security = HTTPBearer()

def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = verify_token(credentials.credentials)
    if payload.get("role") != "admin":
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Admin only")
    return payload

@router.get("/dashboard")
async def dashboard_stats(admin=Depends(get_current_admin)):
    cached = await cache_get("stats:dashboard")
    if cached: return cached

    sessions_by_status = await fetch_all("SELECT status, COUNT(*) as count FROM sessions GROUP BY status")
    tasks_by_status = await fetch_all("SELECT status, COUNT(*) as count FROM tasks GROUP BY status")
    orders_today = await fetch_one(
        "SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as total FROM orders WHERE status='confirmed' AND created_at >= NOW()-INTERVAL '1 day'"
    )
    users_total = await fetch_one("SELECT COUNT(*) as count FROM users")
    users_today = await fetch_one("SELECT COUNT(*) as count FROM users WHERE created_at >= NOW()-INTERVAL '1 day'")
    recent_logs = await fetch_all(
        "SELECT event, COUNT(*) as count FROM session_logs WHERE created_at >= NOW()-INTERVAL '1 hour' GROUP BY event ORDER BY count DESC"
    )

    result = {
        "sessions": {r["status"]: r["count"] for r in sessions_by_status},
        "tasks": {r["status"]: r["count"] for r in tasks_by_status},
        "orders_today": {"count": orders_today["count"], "total_usd": float(orders_today["total"])},
        "users": {"total": users_total["count"], "today": users_today["count"]},
        "recent_events": {r["event"]: r["count"] for r in recent_logs}
    }
    await cache_set("stats:dashboard", result, ttl=30)
    return result

@router.get("/sessions/timeline")
async def sessions_timeline(days: int = 7, admin=Depends(get_current_admin)):
    rows = await fetch_all(
        """SELECT DATE(created_at) as date, status, COUNT(*) as count
           FROM session_logs WHERE created_at >= NOW()-($1 || ' days')::INTERVAL
           GROUP BY DATE(created_at), status ORDER BY date""",
        str(days)
    )
    return [dict(r) for r in rows]
