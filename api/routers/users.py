from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional
from core.database import fetch_all, fetch_one, execute
from core.security import verify_token

router = APIRouter()
security = HTTPBearer()

def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = verify_token(credentials.credentials)
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="فقط ادمین دسترسی دارد")
    return payload

class BalanceUpdate(BaseModel):
    amount: float

class UserUpsert(BaseModel):
    id: int
    username: Optional[str] = None
    full_name: str = "کاربر"
    language: str = "fa"

@router.get("/")
async def list_users(
    search: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    page: int = Query(1, ge=1),
    admin=Depends(get_current_admin)
):
    offset = (page - 1) * limit
    where = ""
    params = []
    if search:
        where = "WHERE full_name ILIKE $1 OR username ILIKE $1"
        params = [f"%{search}%", limit, offset]
    else:
        params = [limit, offset]
    idx = len(params) - 1
    rows = await fetch_all(
        f"SELECT id, username, full_name, language, balance, total_spent, "
        f"is_banned, ban_reason, created_at "
        f"FROM users {where} ORDER BY created_at DESC LIMIT ${idx} OFFSET ${idx+1}",
        *params
    )
    return [dict(r) for r in rows]

@router.get("/{user_id}")
async def get_user(user_id: int, admin=Depends(get_current_admin)):
    row = await fetch_one(
        "SELECT id, username, full_name, language, balance, total_spent, "
        "is_banned, ban_reason, created_at FROM users WHERE id=$1",
        user_id
    )
    if not row:
        raise HTTPException(status_code=404, detail="کاربر یافت نشد")
    return dict(row)

@router.post("/upsert")
async def upsert_user(data: UserUpsert):
    """ثبت یا بروزرسانی کاربر — بدون نیاز به توکن (از بات فراخوانی می‌شود)"""
    await execute(
        "INSERT INTO users (id, username, full_name, language) VALUES ($1,$2,$3,$4) "
        "ON CONFLICT (id) DO UPDATE SET username=$2, full_name=$3, updated_at=NOW()",
        data.id, data.username, data.full_name, data.language
    )
    row = await fetch_one("SELECT id, balance, is_banned FROM users WHERE id=$1", data.id)
    return dict(row) if row else {"id": data.id, "balance": 0, "is_banned": False}

@router.post("/{user_id}/balance")
async def add_balance(user_id: int, data: BalanceUpdate, admin=Depends(get_current_admin)):
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="مبلغ باید مثبت باشد")
    row = await fetch_one("SELECT id FROM users WHERE id=$1", user_id)
    if not row:
        raise HTTPException(status_code=404, detail="کاربر یافت نشد")
    await execute(
        "UPDATE users SET balance=balance+$1, total_spent=total_spent+$1 WHERE id=$2",
        data.amount, user_id
    )
    updated = await fetch_one("SELECT balance FROM users WHERE id=$1", user_id)
    return {"success": True, "new_balance": float(updated["balance"])}

@router.post("/{user_id}/ban")
async def ban_user(user_id: int, reason: Optional[str] = None, admin=Depends(get_current_admin)):
    row = await fetch_one("SELECT id FROM users WHERE id=$1", user_id)
    if not row:
        raise HTTPException(status_code=404, detail="کاربر یافت نشد")
    await execute(
        "UPDATE users SET is_banned=TRUE, ban_reason=$1 WHERE id=$2",
        reason, user_id
    )
    return {"success": True}

@router.post("/{user_id}/unban")
async def unban_user(user_id: int, admin=Depends(get_current_admin)):
    await execute("UPDATE users SET is_banned=FALSE, ban_reason=NULL WHERE id=$1", user_id)
    return {"success": True}
