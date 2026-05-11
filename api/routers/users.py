from fastapi import APIRouter, HTTPException, Depends
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
        raise HTTPException(status_code=403, detail="Admin only")
    return payload

class BalanceAdjust(BaseModel):
    amount: float
    note: Optional[str] = None

@router.get("/")
async def list_users(page: int = 1, limit: int = 50, search: Optional[str] = None, admin=Depends(get_current_admin)):
    offset = (page - 1) * limit
    where = "WHERE username ILIKE $1 OR full_name ILIKE $1" if search else ""
    params = [f"%{search}%", limit, offset] if search else [limit, offset]
    i = 2 if search else 1
    rows = await fetch_all(
        f"SELECT id,username,full_name,balance,total_spent,is_banned,language,created_at FROM users {where} ORDER BY created_at DESC LIMIT ${i} OFFSET ${i+1}",
        *params
    )
    return [dict(r) for r in rows]

@router.get("/{user_id}")
async def get_user(user_id: int, admin=Depends(get_current_admin)):
    user = await fetch_one("SELECT * FROM users WHERE id=$1", user_id)
    if not user: raise HTTPException(status_code=404, detail="User not found")
    return dict(user)

@router.post("/{user_id}/balance")
async def adjust_balance(user_id: int, data: BalanceAdjust, admin=Depends(get_current_admin)):
    await execute("UPDATE users SET balance=balance+$1 WHERE id=$2", data.amount, user_id)
    return {"success": True}

@router.post("/{user_id}/ban")
async def ban_user(user_id: int, reason: str, admin=Depends(get_current_admin)):
    await execute("UPDATE users SET is_banned=TRUE, ban_reason=$1 WHERE id=$2", reason, user_id)
    return {"success": True}

@router.post("/{user_id}/unban")
async def unban_user(user_id: int, admin=Depends(get_current_admin)):
    await execute("UPDATE users SET is_banned=FALSE, ban_reason=NULL WHERE id=$1", user_id)
    return {"success": True}
