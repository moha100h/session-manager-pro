from fastapi import APIRouter, HTTPException, Depends
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
    if not payload.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return payload

class ProxyCreate(BaseModel):
    host: str
    port: int
    proxy_type: str = "socks5"
    username: Optional[str] = None
    password: Optional[str] = None
    country: Optional[str] = None

class ProxyBulk(BaseModel):
    proxies: List[str]  # format: "socks5://user:pass@host:port"
    proxy_type: str = "socks5"

@router.get("")
async def list_proxies(is_active: Optional[bool] = None, admin=Depends(get_current_admin)):
    where = "WHERE 1=1"
    params = []
    if is_active is not None:
        where += " AND is_active = $1"; params.append(is_active)
    rows = await fetch_all(f"SELECT * FROM proxies {where} ORDER BY created_at DESC", *params)
    return [dict(r) for r in rows]

@router.post("")
async def add_proxy(data: ProxyCreate, admin=Depends(get_current_admin)):
    row = await fetch_one(
        "INSERT INTO proxies (host, port, proxy_type, username, password, country) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
        data.host, data.port, data.proxy_type, data.username, data.password, data.country
    )
    return {"id": str(row["id"])}

@router.post("/bulk")
async def bulk_add_proxies(data: ProxyBulk, admin=Depends(get_current_admin)):
    added, failed = 0, []
    for proxy_str in data.proxies:
        try:
            # Parse: socks5://user:pass@host:port or host:port
            if "://" in proxy_str:
                parts = proxy_str.split("://")[1]
            else:
                parts = proxy_str
            if "@" in parts:
                auth, hostport = parts.rsplit("@", 1)
                user, pwd = auth.split(":", 1)
            else:
                hostport = parts; user = pwd = None
            host, port = hostport.rsplit(":", 1)
            await execute(
                "INSERT INTO proxies (host, port, proxy_type, username, password) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
                host, int(port), data.proxy_type, user, pwd
            )
            added += 1
        except Exception as e:
            failed.append({"proxy": proxy_str, "error": str(e)})
    return {"added": added, "failed": failed}

@router.delete("/{proxy_id}")
async def delete_proxy(proxy_id: str, admin=Depends(get_current_admin)):
    await execute("DELETE FROM proxies WHERE id = $1", uuid.UUID(proxy_id))
    return {"success": True}

@router.get("/random")
async def get_random_proxy():
    row = await fetch_one("SELECT * FROM proxies WHERE is_active = TRUE ORDER BY RANDOM() LIMIT 1")
    if not row: return None
    return dict(row)
