from fastapi import APIRouter, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi import HTTPException
from core.database import fetch_all, fetch_one, fetch_val
from core.security import verify_token
from core.redis_client import cache_get, cache_set

router = APIRouter()
security = HTTPBearer()

def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = verify_token(credentials.credentials)
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="فقط ادمین دسترسی دارد")
    return payload

@router.get("/dashboard")
async def get_dashboard(admin=Depends(get_current_admin)):
    cached = await cache_get("stats:dashboard")
    if cached:
        return cached

    # سشن‌ها
    session_rows = await fetch_all("SELECT status, COUNT(*) as count FROM sessions GROUP BY status")
    sessions = {r["status"]: int(r["count"]) for r in session_rows}
    sessions["total"] = sum(sessions.values())

    # تسک‌ها
    task_rows = await fetch_all("SELECT status, COUNT(*) as count FROM tasks GROUP BY status")
    tasks = {r["status"]: int(r["count"]) for r in task_rows}
    tasks["total"] = sum(tasks.values())

    # کاربران
    user_row = await fetch_one(
        "SELECT COUNT(*) as total, "
        "COUNT(*) FILTER (WHERE is_banned=TRUE) as banned "
        "FROM users"
    )
    users = {
        "total": int(user_row["total"]) if user_row else 0,
        "banned": int(user_row["banned"]) if user_row else 0,
    }

    # درآمد امروز
    order_today = await fetch_one(
        "SELECT COALESCE(SUM(amount), 0) as total_usd, COUNT(*) as count "
        "FROM orders WHERE status='confirmed' AND confirmed_at >= CURRENT_DATE"
    )
    orders_today = {
        "total_usd": float(order_today["total_usd"]) if order_today else 0.0,
        "count": int(order_today["count"]) if order_today else 0,
    }

    # درآمد کل
    total_rev = await fetch_val(
        "SELECT COALESCE(SUM(amount), 0) FROM orders WHERE status='confirmed'"
    )

    # پروکسی‌ها
    proxy_row = await fetch_one(
        "SELECT COUNT(*) as total, "
        "COUNT(*) FILTER (WHERE is_active=TRUE) as active "
        "FROM proxies"
    )
    proxies = {
        "total": int(proxy_row["total"]) if proxy_row else 0,
        "active": int(proxy_row["active"]) if proxy_row else 0,
    }

    # سفارشات در انتظار
    pending_orders = await fetch_val(
        "SELECT COUNT(*) FROM orders WHERE status IN ('pending','confirming')"
    )

    result = {
        "sessions": sessions,
        "tasks": tasks,
        "users": users,
        "orders_today": orders_today,
        "total_revenue": float(total_rev or 0),
        "proxies": proxies,
        "pending_orders": int(pending_orders or 0),
    }
    await cache_set("stats:dashboard", result, ttl=30)
    return result

@router.get("/sessions/history")
async def session_history(
    days: int = Query(7, ge=1, le=90),
    admin=Depends(get_current_admin)
):
    # ── رفع باگ interval — استفاده از make_interval ──────────
    rows = await fetch_all(
        "SELECT DATE(created_at) as date, COUNT(*) as count "
        "FROM sessions "
        "WHERE created_at >= NOW() - make_interval(days => $1) "
        "GROUP BY DATE(created_at) ORDER BY date",
        days
    )
    return [{"date": str(r["date"]), "count": int(r["count"])} for r in rows]

@router.get("/tasks/history")
async def task_history(
    days: int = Query(7, ge=1, le=90),
    admin=Depends(get_current_admin)
):
    rows = await fetch_all(
        "SELECT DATE(created_at) as date, status, COUNT(*) as count "
        "FROM tasks "
        "WHERE created_at >= NOW() - make_interval(days => $1) "
        "GROUP BY DATE(created_at), status ORDER BY date",
        days
    )
    return [{"date": str(r["date"]), "status": r["status"], "count": int(r["count"])} for r in rows]

@router.get("/orders/history")
async def order_history(
    days: int = Query(30, ge=1, le=365),
    admin=Depends(get_current_admin)
):
    rows = await fetch_all(
        "SELECT DATE(created_at) as date, "
        "COUNT(*) as count, "
        "COALESCE(SUM(amount) FILTER (WHERE status='confirmed'), 0) as revenue "
        "FROM orders "
        "WHERE created_at >= NOW() - make_interval(days => $1) "
        "GROUP BY DATE(created_at) ORDER BY date",
        days
    )
    return [
        {"date": str(r["date"]), "count": int(r["count"]), "revenue": float(r["revenue"])}
        for r in rows
    ]
