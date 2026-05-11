from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from core.database import fetch_all, fetch_one, execute
from core.security import verify_token

router = APIRouter()
security = HTTPBearer()

def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = verify_token(credentials.credentials)
    if not payload.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return payload

@router.get("")
async def list_users(page: int = 1, limit: int = 50, admin=Depends(get_current_admin)):
    offset = (page - 1) * limit
    rows = await fetch_all("SELECT id, username, full_name, balance, total_spent, is_banned, created_at FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2", limit, offset)
    total = await fetch_one("SELECT COUNT(*) FROM users")
    return {"data": [dict(r) for r in rows], "total": total[0]}

@router.post("/{user_id}/ban")
async def ban_user(user_id: int, reason: str = "", admin=Depends(get_current_admin)):
    await execute("UPDATE users SET is_banned = TRUE, ban_reason = $1 WHERE id = $2", reason, user_id)
    return {"success": True}

@router.post("/{user_id}/unban")
async def unban_user(user_id: int, admin=Depends(get_current_admin)):
    await execute("UPDATE users SET is_banned = FALSE, ban_reason = NULL WHERE id = $1", user_id)
    return {"success": True}

@router.post("/{user_id}/add-balance")
async def add_balance(user_id: int, amount: float, admin=Depends(get_current_admin)):
    await execute("UPDATE users SET balance = balance + $1 WHERE id = $2", amount, user_id)
    return {"success": True}
