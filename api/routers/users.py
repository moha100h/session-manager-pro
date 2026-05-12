from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional
from core.database import fetch_all, fetch_one, execute, fetch_val
from core.security import verify_token

router = APIRouter()
security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    return verify_token(credentials.credentials)

def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = verify_token(credentials.credentials)
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="فقط ادمین دسترسی دارد")
    return payload

class BalanceData(BaseModel):
    amount: float

class BanData(BaseModel):
    reason: str = ""

# ── upsert کاربر (از auth router فراخوانی می‌شه) ──────────
async def upsert_user(user_id: int, username: str, full_name: str, language: str):
    # FIX: language هم در ON CONFLICT آپدیت می‌شه
    await execute(
        """INSERT INTO users (id, username, full_name, language)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE
           SET username=$2, full_name=$3, language=$4, updated_at=NOW()""",
        user_id, username or "", full_name or "کاربر", language or "fa"
    )

@router.get("/")
async def list_users(
    search:    Optional[str] = None,
    is_banned: Optional[bool] = None,
    limit:     int = Query(50, ge=1, le=200),
    page:      int = Query(1, ge=1),
    admin=Depends(get_current_admin)
):
    offset = (page - 1) * limit
    conditions, params = [], []

    if search:
        params.append(f"%{search}%")
        conditions.append(f"(username ILIKE ${len(params)} OR full_name ILIKE ${len(params)})")
    if is_banned is not None:
        params.append(is_banned)
        conditions.append(f"is_banned=${len(params)}")

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    params.extend([limit, offset])

    rows = await fetch_all(
        f"""SELECT id, username, full_name, language, balance, total_spent,
                   is_banned, ban_reason, created_at, updated_at
            FROM users {where}
            ORDER BY created_at DESC
            LIMIT ${len(params)-1} OFFSET ${len(params)}""",
        *params
    )
    return [dict(r) for r in rows]

@router.get("/me")
async def get_me(user=Depends(get_current_user)):
    user_id = user.get("user_id")
    row = await fetch_one(
        "SELECT id, username, full_name, language, balance, total_spent, is_banned, created_at FROM users WHERE id=$1",
        user_id
    )
    if not row:
        raise HTTPException(status_code=404, detail="کاربر یافت نشد")
    return dict(row)

@router.get("/{user_id}")
async def get_user(user_id: int, admin=Depends(get_current_admin)):
    row = await fetch_one(
        "SELECT id, username, full_name, language, balance, total_spent, is_banned, ban_reason, created_at FROM users WHERE id=$1",
        user_id
    )
    if not row:
        raise HTTPException(status_code=404, detail="کاربر یافت نشد")
    return dict(row)

@router.post("/{user_id}/balance")
async def add_balance(user_id: int, data: BalanceData, admin=Depends(get_current_admin)):
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="مبلغ باید مثبت باشد")
    row = await fetch_one("SELECT id FROM users WHERE id=$1", user_id)
    if not row:
        raise HTTPException(status_code=404, detail="کاربر یافت نشد")
    # FIX: فقط balance شارژ می‌شه — total_spent فقط در confirm order آپدیت می‌شه
    await execute(
        "UPDATE users SET balance=balance+$1, updated_at=NOW() WHERE id=$2",
        data.amount, user_id
    )
    new_balance = await fetch_val("SELECT balance FROM users WHERE id=$1", user_id)
    return {"success": True, "new_balance": float(new_balance or 0)}

@router.post("/{user_id}/ban")
async def ban_user(user_id: int, data: BanData, admin=Depends(get_current_admin)):
    row = await fetch_one("SELECT id, is_banned FROM users WHERE id=$1", user_id)
    if not row:
        raise HTTPException(status_code=404, detail="کاربر یافت نشد")
    if row["is_banned"]:
        raise HTTPException(status_code=400, detail="کاربر قبلاً بن شده است")
    await execute(
        "UPDATE users SET is_banned=TRUE, ban_reason=$1, updated_at=NOW() WHERE id=$2",
        data.reason, user_id
    )
    return {"success": True}

@router.post("/{user_id}/unban")
async def unban_user(user_id: int, admin=Depends(get_current_admin)):
    row = await fetch_one("SELECT id, is_banned FROM users WHERE id=$1", user_id)
    if not row:
        raise HTTPException(status_code=404, detail="کاربر یافت نشد")
    if not row["is_banned"]:
        raise HTTPException(status_code=400, detail="کاربر بن نشده است")
    await execute(
        "UPDATE users SET is_banned=FALSE, ban_reason=NULL, updated_at=NOW() WHERE id=$1",
        user_id
    )
    return {"success": True}
