from fastapi import APIRouter, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from core.database import fetch_all, fetch_one
from core.security import verify_token
from core.redis_client import cache_get, cache_set

router = APIRouter()
security = HTTPBearer()

def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = verify_token(credentials.credentials)
    if payload.get("role") != "admin":
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="فقط ادمین دسترسی دارد")
    return payload

@router.get("/dashboard")
async def get_dashboard(admin=Depends(get_current_admin)):
    cached = await cache_get("stats:dashboard")
    if cached:
        return cached

    # سشن‌ها
    session_rows = await fetch_all("SELECT status, COUNT(*) as count FROM sessions GROUP BY status")
    sessions = {r["status"]: r["count"] for r in session_rows}

    # تسک‌ها
    task_rows = await fetch_all("SELECT status, COUNT(*) as count FROM tasks GROUP BY status")
    tasks = {r["status"]: r["count"] for r in task_rows}

    # کاربران
    user_row = await fetch_one("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_banned) as banned FROM users")
    users = {"total": user_row["total"], "banned": user_row["banned"]} if user_row else {}

    # درآمد امروز
    order_row = await fetch_one(
        "SELECT COALESCE(SUM(amount), 0) as total_usd, COUNT(*) as count "
        "FROM orders WHERE status='confirmed' AND confirmed_at >= CURRENT_DATE"
    )
    orders_today = {"total_usd": float(order_row["total_usd"]), "count": order_row["count"]} if order_row else {}

    # درآمد کل
    total_row = await fetch_one("SELECT COALESCE(SUM(amount), 0) as total FROM orders WHERE status='confirmed'")
    total_revenue = float(total_row["total"]) if total_row else 0

    # پروکسی‌ها
    proxy_row = await fetch_one("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active) as active FROM proxies")
    proxies = {"total": proxy_row["total"], "active": proxy_row["active"]} if proxy_row else {}

    result = {
        "sessions": sessions,
        "tasks": tasks,
        "users": users,
        "orders_today": orders_today,
        "total_revenue": total_revenue,
        "proxies": proxies,
    }
    await cache_set("stats:dashboard", result, ttl=30)
    return result

@router.get("/sessions/history")
async def session_history(days: int = 7, admin=Depends(get_current_admin)):
    rows = await fetch_all(
        "SELECT DATE(created_at) as date, COUNT(*) as count "
        "FROM sessions WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL "
        "GROUP BY DATE(created_at) ORDER BY date",
        str(days)
    )
    return [{"date": str(r["date"]), "count": r["count"]} for r in rows]

@router.get("/tasks/history")
async def task_history(days: int = 7, admin=Depends(get_current_admin)):
    rows = await fetch_all(
        "SELECT DATE(created_at) as date, status, COUNT(*) as count "
        "FROM tasks WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL "
        "GROUP BY DATE(created_at), status ORDER BY date",
        str(days)
    )
    return [{"date": str(r["date"]), "status": r["status"], "count": r["count"]} for r in rows]
