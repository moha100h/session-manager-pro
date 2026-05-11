from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional
import uuid
from core.database import fetch_all, fetch_one, execute
from core.security import verify_token

router = APIRouter()
security = HTTPBearer()

def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = verify_token(credentials.credentials)
    if payload.get("role") != "admin":
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Admin only")
    return payload

class ProxyCreate(BaseModel):
    host: str
    port: int
    proxy_type: str = "socks5"
    username: Optional[str] = None
    password: Optional[str] = None
    country: Optional[str] = None

@router.post("/")
async def add_proxy(data: ProxyCreate, admin=Depends(get_current_admin)):
    pid = str(uuid.uuid4())
    await execute(
        "INSERT INTO proxies (id,host,port,proxy_type,username,password,country) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        pid, data.host, data.port, data.proxy_type, data.username, data.password, data.country
    )
    return {"id": pid}

@router.post("/bulk")
async def bulk_add_proxies(proxies: list[ProxyCreate], admin=Depends(get_current_admin)):
    added = 0
    for p in proxies:
        pid = str(uuid.uuid4())
        await execute(
            "INSERT INTO proxies (id,host,port,proxy_type,username,password,country) VALUES ($1,$2,$3,$4,$5,$6,$7)",
            pid, p.host, p.port, p.proxy_type, p.username, p.password, p.country
        )
        added += 1
    return {"added": added}

@router.get("/")
async def list_proxies(page: int = 1, limit: int = 50, admin=Depends(get_current_admin)):
    offset = (page - 1) * limit
    rows = await fetch_all(
        "SELECT id,host,port,proxy_type,country,is_active,success_count,fail_count,avg_latency_ms FROM proxies ORDER BY created_at DESC LIMIT $1 OFFSET $2",
        limit, offset
    )
    return [dict(r) for r in rows]

@router.delete("/{proxy_id}")
async def delete_proxy(proxy_id: str, admin=Depends(get_current_admin)):
    await execute("DELETE FROM proxies WHERE id=$1", uuid.UUID(proxy_id))
    return {"success": True}

@router.patch("/{proxy_id}/toggle")
async def toggle_proxy(proxy_id: str, admin=Depends(get_current_admin)):
    await execute("UPDATE proxies SET is_active=NOT is_active WHERE id=$1", uuid.UUID(proxy_id))
    return {"success": True}
