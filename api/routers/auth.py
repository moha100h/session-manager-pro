from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import os
from core.security import verify_token, create_access_token, hash_password, verify_password
from core.database import fetch_one, execute
from core.redis_client import cache_set, cache_get

router = APIRouter()
security = HTTPBearer()

class AdminLogin(BaseModel):
    username: str
    password: str

class UserAuth(BaseModel):
    user_id: int
    username: str
    full_name: str
    language: str = "fa"

@router.post("/admin/login")
async def admin_login(data: AdminLogin):
    if data.username != os.getenv("ADMIN_USERNAME") or data.password != os.getenv("ADMIN_PASSWORD"):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token({"user_id": 0, "is_admin": True, "username": data.username})
    return {"access_token": token, "token_type": "bearer"}

@router.post("/user/register")
async def register_user(data: UserAuth):
    existing = await fetch_one("SELECT id FROM users WHERE id = $1", data.user_id)
    if not existing:
        await execute(
            "INSERT INTO users (id, username, full_name, language) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
            data.user_id, data.username, data.full_name, data.language
        )
    token = create_access_token({"user_id": data.user_id, "is_admin": False, "username": data.username})
    return {"access_token": token, "token_type": "bearer"}

@router.get("/me")
async def get_me(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = verify_token(credentials.credentials)
    if payload.get("is_admin"):
        return {"is_admin": True, "username": payload.get("username")}
    user = await fetch_one("SELECT id, username, full_name, balance, language, created_at FROM users WHERE id = $1", payload.get("user_id"))
    if not user: raise HTTPException(status_code=404, detail="User not found")
    return dict(user)
