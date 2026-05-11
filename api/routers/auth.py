from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from core.database import fetch_one, execute
from core.security import verify_token, create_access_token, hash_password, verify_password
import os

router = APIRouter()
security = HTTPBearer()

class AdminLogin(BaseModel):
    username: str
    password: str

class UserRegister(BaseModel):
    user_id: int
    username: str
    full_name: str
    language: str = "fa"

@router.post("/admin/login")
async def admin_login(data: AdminLogin):
    if data.username != os.getenv("ADMIN_USERNAME") or data.password != os.getenv("ADMIN_PASSWORD"):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token({"role": "admin", "username": data.username})
    return {"access_token": token, "token_type": "bearer"}

@router.post("/user/register")
async def register_user(data: UserRegister):
    existing = await fetch_one("SELECT id FROM users WHERE id=$1", data.user_id)
    if existing:
        token = create_access_token({"user_id": data.user_id, "role": "user"})
        return {"access_token": token, "token_type": "bearer", "is_new": False}
    await execute(
        "INSERT INTO users (id, username, full_name, language) VALUES ($1,$2,$3,$4)",
        data.user_id, data.username, data.full_name, data.language
    )
    token = create_access_token({"user_id": data.user_id, "role": "user"})
    return {"access_token": token, "token_type": "bearer", "is_new": True}

@router.get("/me")
async def get_me(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = verify_token(credentials.credentials)
    if payload.get("role") == "admin":
        return {"role": "admin", "username": payload.get("username")}
    user = await fetch_one("SELECT id,username,full_name,balance,language,created_at FROM users WHERE id=$1", payload.get("user_id"))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return dict(user)
