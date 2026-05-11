from fastapi import APIRouter, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from core.database import fetch_all, execute
from core.security import verify_token
from core.redis_client import cache_delete

router = APIRouter()
security = HTTPBearer()

def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = verify_token(credentials.credentials)
    if payload.get("role") != "admin":
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Admin only")
    return payload

class SettingUpdate(BaseModel):
    value: str

@router.get("/")
async def get_settings(admin=Depends(get_current_admin)):
    rows = await fetch_all("SELECT key, value, description FROM settings ORDER BY key")
    return {r["key"]: {"value": r["value"], "description": r["description"]} for r in rows}

@router.patch("/{key}")
async def update_setting(key: str, data: SettingUpdate, admin=Depends(get_current_admin)):
    await execute("UPDATE settings SET value=$1, updated_at=NOW() WHERE key=$2", data.value, key)
    await cache_delete("stats:dashboard")
    return {"success": True}
