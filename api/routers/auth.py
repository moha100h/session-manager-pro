from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional
import os
from core.database import fetch_one, execute
from core.security import create_access_token, verify_token, hash_password, verify_password

router = APIRouter()
security = HTTPBearer()

ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")

if not ADMIN_PASSWORD:
    import logging
    logging.getLogger("auth").warning("⚠️  ADMIN_PASSWORD is not set!")

# ── hash رمز ادمین یک‌بار هنگام startup ──────────────────────
_ADMIN_PASSWORD_HASH = hash_password(ADMIN_PASSWORD) if ADMIN_PASSWORD else ""

class AdminLogin(BaseModel):
    username: str
    password: str

class UserRegister(BaseModel):
    user_id: int
    username: Optional[str] = None
    full_name: str = "کاربر"
    language: str = "fa"

@router.post("/admin/login")
async def admin_login(data: AdminLogin):
    if data.username != ADMIN_USERNAME:
        raise HTTPException(status_code=401, detail="نام کاربری یا رمز عبور اشتباه است")
    if not verify_password(data.password, _ADMIN_PASSWORD_HASH):
        raise HTTPException(status_code=401, detail="نام کاربری یا رمز عبور اشتباه است")
    # ── payload استاندارد با role ──────────────────────────────
    token = create_access_token({
        "user_id": 0,
        "role": "admin",
        "username": data.username,
    })
    return {"access_token": token, "token_type": "bearer", "role": "admin"}

@router.post("/user/register")
async def register_user(data: UserRegister):
    """ثبت یا بروزرسانی کاربر — از بات فراخوانی می‌شود"""
    await execute(
        """
        INSERT INTO users (id, username, full_name, language)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE
          SET username = EXCLUDED.username,
              full_name = EXCLUDED.full_name,
              updated_at = NOW()
        """,
        data.user_id, data.username, data.full_name, data.language,
    )
    row = await fetch_one(
        "SELECT id, balance, is_banned, ban_reason FROM users WHERE id=$1",
        data.user_id
    )
    if not row:
        raise HTTPException(status_code=500, detail="خطا در ثبت کاربر")
    return dict(row)

@router.post("/user/token")
async def user_token(data: UserRegister):
    """دریافت توکن کاربر — از بات فراخوانی می‌شود"""
    row = await fetch_one("SELECT id, is_banned FROM users WHERE id=$1", data.user_id)
    if not row:
        # اگر کاربر وجود نداشت، ثبتش کن
        await register_user(data)
        row = await fetch_one("SELECT id, is_banned FROM users WHERE id=$1", data.user_id)
    if row["is_banned"]:
        raise HTTPException(status_code=403, detail="حساب شما مسدود شده است")
    token = create_access_token({
        "user_id": data.user_id,
        "role": "user",
        "username": data.username,
    })
    return {"access_token": token, "token_type": "bearer", "role": "user"}

@router.get("/me")
async def get_me(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = verify_token(credentials.credentials)
    role = payload.get("role", "user")
    if role == "admin":
        return {"user_id": 0, "role": "admin", "username": payload.get("username")}
    user_id = payload.get("user_id")
    row = await fetch_one(
        "SELECT id, username, full_name, balance, is_banned FROM users WHERE id=$1",
        user_id
    )
    if not row:
        raise HTTPException(status_code=404, detail="کاربر یافت نشد")
    return {**dict(row), "role": "user"}
