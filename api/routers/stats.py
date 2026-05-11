from fastapi import APIRouter, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from core.database import fetch_one, fetch_all
from core.security import verify_token
from core.redis_client import cache_set, cache_get

router = APIRouter()
security = HTTPBearer()

def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = verify_token(credentials.credentials)
    if not payload.get("is_admin"):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Admin access required")
    return payload

@router.get("/dashboard")
async def dashboard_stats(admin=Depends(get_current_admin)):
    cached = await cache_get("stats:dashboard")
    if cached: return cached

    sessions_by_status = await fetch_all("SELECT status, COUNT(*) as count FROM sessions GROUP BY status")
    tasks_by_status = await fetch_all("SELECT status, COUNT(*) as count FROM tasks GROUP BY status")
    orders_pending = await fetch_one("SELECT COUNT(*), COALESCE(SUM(amount),0) as total FROM orders WHERE status = 'confirming'")
    users_total = await fetch_one("SELECT COUNT(*) FROM users")
    revenue = await fetch_one("SELECT COALESCE(SUM(amount),0) as total FROM orders WHERE status = 'confirmed'")
    recent_tasks = await fetch_all("SELECT id, type, target, session_count, sessions_done, status, created_at FROM tasks ORDER BY created_at DESC LIMIT 10")

    result = {
        "sessions": {r["status"]: r["count"] for r in sessions_by_status},
        "tasks": {r["status"]: r["count"] for r in tasks_by_status},
        "orders_pending": {"count": orders_pending[0], "amount": float(orders_pending["total"])},
        "users_total": users_total[0],
        "total_revenue": float(revenue["total"]),
        "recent_tasks": [dict(r) for r in recent_tasks]
    }
    await cache_set("stats:dashboard", result, ttl=30)
    return result

@router.get("/sessions/timeline")
async def sessions_timeline(days: int = 30, admin=Depends(get_current_admin)):
    rows = await fetch_all(
        """SELECT DATE(created_at) as date, status, COUNT(*) as count
           FROM session_logs WHERE created_at > NOW() - INTERVAL '1 day' * $1
           GROUP BY DATE(created_at), status ORDER BY date""",
        days
    )
    return [dict(r) for r in rows]
