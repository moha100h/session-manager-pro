from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, validator
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

def parse_uuid(val: str, label: str = "شناسه") -> uuid.UUID:
    try:
        return uuid.UUID(val)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail=f"{label} نامعتبر است")

class ProxyCreate(BaseModel):
    host:       str
    port:       int
    proxy_type: str = "socks5"
    username:   Optional[str] = None
    password:   Optional[str] = None
    country:    Optional[str] = None

    @validator("host")
    def host_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("host نمی‌تواند خالی باشد")
        return v.strip()

    @validator("port")
    def port_valid(cls, v):
        # FIX: validation پورت
        if not (1 <= v <= 65535):
            raise ValueError("پورت باید بین ۱ تا ۶۵۵۳۵ باشد")
        return v

    @validator("proxy_type")
    def type_valid(cls, v):
        allowed = {"socks5", "socks4", "http", "https"}
        if v.lower() not in allowed:
            raise ValueError(f"نوع پروکسی باید یکی از {allowed} باشد")
        return v.lower()

class ProxyBulkRequest(BaseModel):
    proxies: List[ProxyCreate]

@router.get("/")
async def list_proxies(
    active_only: bool = Query(False),
    limit:       int  = Query(100, ge=1, le=1000),
    page:        int  = Query(1, ge=1),
    admin=Depends(get_current_admin)
):
    offset = (page - 1) * limit
    where  = "WHERE is_active=TRUE" if active_only else ""
    rows = await fetch_all(
        f"""SELECT id, host, port, proxy_type, username, country,
                   is_active, success_count, fail_count, avg_latency_ms, created_at
            FROM proxies {where}
            ORDER BY is_active DESC, success_count DESC
            LIMIT $1 OFFSET $2""",
        limit, offset
    )
    return [dict(r) for r in rows]

@router.post("/")
async def create_proxy(data: ProxyCreate, admin=Depends(get_current_admin)):
    existing = await fetch_one("SELECT id FROM proxies WHERE host=$1 AND port=$2", data.host, data.port)
    if existing:
        raise HTTPException(status_code=409, detail="این پروکسی قبلاً ثبت شده است")
    row = await fetch_one(
        """INSERT INTO proxies (host, port, proxy_type, username, password, country)
           VALUES ($1,$2,$3,$4,$5,$6)
           RETURNING id, host, port, proxy_type, is_active, created_at""",
        data.host, data.port, data.proxy_type,
        data.username or None, data.password or None, data.country or None
    )
    return dict(row)

@router.post("/bulk")
async def bulk_add_proxies(req: ProxyBulkRequest, admin=Depends(get_current_admin)):
    if not req.proxies:
        raise HTTPException(status_code=400, detail="لیست خالی است")
    if len(req.proxies) > 500:
        raise HTTPException(status_code=400, detail="حداکثر ۵۰۰ پروکسی در هر بار")

    added = skipped = failed = 0
    for p in req.proxies:
        try:
            existing = await fetch_one("SELECT id FROM proxies WHERE host=$1 AND port=$2", p.host, p.port)
            if existing:
                skipped += 1
                continue
            await execute(
                "INSERT INTO proxies (host, port, proxy_type, username, password, country) VALUES ($1,$2,$3,$4,$5,$6)",
                p.host, p.port, p.proxy_type, p.username or None, p.password or None, p.country or None
            )
            added += 1
        except Exception:
            failed += 1

    return {"added": added, "skipped": skipped, "failed": failed}

@router.post("/{proxy_id}/toggle")
async def toggle_proxy(proxy_id: str, admin=Depends(get_current_admin)):
    uid = parse_uuid(proxy_id, "شناسه پروکسی")
    row = await fetch_one("SELECT id, is_active FROM proxies WHERE id=$1", uid)
    if not row:
        raise HTTPException(status_code=404, detail="پروکسی یافت نشد")
    new_state = not row["is_active"]
    await execute("UPDATE proxies SET is_active=$1 WHERE id=$2", new_state, uid)
    return {"success": True, "is_active": new_state}

@router.delete("/{proxy_id}")
async def delete_proxy(proxy_id: str, admin=Depends(get_current_admin)):
    uid = parse_uuid(proxy_id, "شناسه پروکسی")
    row = await fetch_one("SELECT id FROM proxies WHERE id=$1", uid)
    if not row:
        raise HTTPException(status_code=404, detail="پروکسی یافت نشد")
    await execute("DELETE FROM proxies WHERE id=$1", uid)
    return {"success": True}

# ── endpoint داخلی برای worker: دریافت پروکسی رندوم ──────
@router.get("/random")
async def get_random_proxy(admin=Depends(get_current_admin)):
    row = await fetch_one(
        """SELECT id, host, port, proxy_type, username, password
           FROM proxies WHERE is_active=TRUE
           ORDER BY RANDOM() LIMIT 1"""
    )
    if not row:
        return None
    return dict(row)
