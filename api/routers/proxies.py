from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional, List
import uuid
from core.database import fetch_all, fetch_one, execute
from core.security import verify_token

router = APIRouter()
security = HTTPBearer()

def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = verify_token(credentials.credentials)
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="فقط ادمین دسترسی دارد")
    return payload

class ProxyCreate(BaseModel):
    host: str
    port: int
    proxy_type: str = "socks5"
    username: Optional[str] = None
    password: Optional[str] = None
    country: Optional[str] = None

class ProxyBulkCreate(BaseModel):
    proxies: List[ProxyCreate]

@router.get("/")
async def list_proxies(
    active_only: bool = False,
    admin=Depends(get_current_admin)
):
    where = "WHERE is_active=TRUE" if active_only else ""
    rows = await fetch_all(
        f"SELECT id, host, port, proxy_type, username, country, is_active, "
        f"success_count, fail_count, avg_latency_ms, created_at "
        f"FROM proxies {where} ORDER BY created_at DESC"
    )
    return [dict(r) for r in rows]

@router.post("/")
async def create_proxy(data: ProxyCreate, admin=Depends(get_current_admin)):
    # بررسی تکراری نبودن
    existing = await fetch_one(
        "SELECT id FROM proxies WHERE host=$1 AND port=$2", data.host, data.port
    )
    if existing:
        raise HTTPException(status_code=409, detail="این پروکسی قبلاً ثبت شده")
    proxy_id = str(uuid.uuid4())
    await execute(
        "INSERT INTO proxies (id, host, port, proxy_type, username, password, country) "
        "VALUES ($1,$2,$3,$4,$5,$6,$7)",
        proxy_id, data.host, data.port, data.proxy_type,
        data.username, data.password, data.country
    )
    return {"id": proxy_id, "success": True}

@router.post("/bulk")
async def bulk_create_proxies(data: ProxyBulkCreate, admin=Depends(get_current_admin)):
    added = 0
    skipped = 0
    for p in data.proxies:
        existing = await fetch_one("SELECT id FROM proxies WHERE host=$1 AND port=$2", p.host, p.port)
        if existing:
            skipped += 1
            continue
        proxy_id = str(uuid.uuid4())
        await execute(
            "INSERT INTO proxies (id, host, port, proxy_type, username, password, country) "
            "VALUES ($1,$2,$3,$4,$5,$6,$7)",
            proxy_id, p.host, p.port, p.proxy_type, p.username, p.password, p.country
        )
        added += 1
    return {"added": added, "skipped": skipped}

@router.patch("/{proxy_id}/toggle")
async def toggle_proxy(proxy_id: str, admin=Depends(get_current_admin)):
    row = await fetch_one("SELECT id FROM proxies WHERE id=$1", uuid.UUID(proxy_id))
    if not row:
        raise HTTPException(status_code=404, detail="پروکسی یافت نشد")
    await execute("UPDATE proxies SET is_active=NOT is_active WHERE id=$1", uuid.UUID(proxy_id))
    return {"success": True}

@router.delete("/{proxy_id}")
async def delete_proxy(proxy_id: str, admin=Depends(get_current_admin)):
    await execute("DELETE FROM proxies WHERE id=$1", uuid.UUID(proxy_id))
    return {"success": True}

@router.delete("/bulk/inactive")
async def delete_inactive_proxies(admin=Depends(get_current_admin)):
    await execute("DELETE FROM proxies WHERE is_active=FALSE OR fail_count > 50")
    return {"success": True}
