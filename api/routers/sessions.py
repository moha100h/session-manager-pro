from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional, List
import uuid
from core.database import fetch_all, fetch_one, execute
from core.security import verify_token, encrypt_session, decrypt_session
from core.redis_client import cache_set, cache_get, cache_delete

router = APIRouter()
security = HTTPBearer()

def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = verify_token(credentials.credentials)
    if not payload.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return payload

class SessionCreate(BaseModel):
    phone: str
    session_string: str
    api_id: Optional[int] = None
    api_hash: Optional[str] = None
    proxy_id: Optional[str] = None
    country: Optional[str] = None
    notes: Optional[str] = None

class SessionUpdate(BaseModel):
    status: Optional[str] = None
    proxy_id: Optional[str] = None
    notes: Optional[str] = None

@router.get("")
async def list_sessions(
    status: Optional[str] = None,
    country: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    admin=Depends(get_current_admin)
):
    offset = (page - 1) * limit
    conditions = ["1=1"]
    params = []
    i = 1
    if status:
        conditions.append(f"status = ${i}"); params.append(status); i+=1
    if country:
        conditions.append(f"country = ${i}"); params.append(country); i+=1
    if search:
        conditions.append(f"phone ILIKE ${i}"); params.append(f"%{search}%"); i+=1
    where = " AND ".join(conditions)
    rows = await fetch_all(
        f"SELECT id, phone, status, country, last_used, last_checked, error_count, created_at FROM sessions WHERE {where} ORDER BY created_at DESC LIMIT ${i} OFFSET ${i+1}",
        *params, limit, offset
    )
    total = await fetch_one(f"SELECT COUNT(*) FROM sessions WHERE {where}", *params)
    return {"data": [dict(r) for r in rows], "total": total[0], "page": page, "limit": limit}

@router.post("")
async def add_session(data: SessionCreate, admin=Depends(get_current_admin)):
    existing = await fetch_one("SELECT id FROM sessions WHERE phone = $1", data.phone)
    if existing:
        raise HTTPException(status_code=409, detail="Session with this phone already exists")
    encrypted = encrypt_session(data.session_string)
    row = await fetch_one(
        """INSERT INTO sessions (phone, session_data, session_string, api_id, api_hash, proxy_id, country, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id""",
        data.phone, encrypted, encrypted, data.api_id, data.api_hash,
        uuid.UUID(data.proxy_id) if data.proxy_id else None, data.country, data.notes
    )
    await cache_delete("stats:sessions")
    return {"id": str(row["id"]), "phone": data.phone, "status": "active"}

@router.post("/bulk")
async def bulk_add_sessions(sessions: List[SessionCreate], admin=Depends(get_current_admin)):
    added, failed = 0, []
    for s in sessions:
        try:
            existing = await fetch_one("SELECT id FROM sessions WHERE phone = $1", s.phone)
            if existing:
                failed.append({"phone": s.phone, "reason": "duplicate"}); continue
            encrypted = encrypt_session(s.session_string)
            await execute(
                "INSERT INTO sessions (phone, session_data, session_string, api_id, api_hash, country) VALUES ($1,$2,$3,$4,$5,$6)",
                s.phone, encrypted, encrypted, s.api_id, s.api_hash, s.country
            )
            added += 1
        except Exception as e:
            failed.append({"phone": s.phone, "reason": str(e)})
    await cache_delete("stats:sessions")
    return {"added": added, "failed": failed, "total": len(sessions)}

@router.get("/stats")
async def session_stats(admin=Depends(get_current_admin)):
    cached = await cache_get("stats:sessions")
    if cached: return cached
    rows = await fetch_all("SELECT status, COUNT(*) as count FROM sessions GROUP BY status")
    result = {r["status"]: r["count"] for r in rows}
    await cache_set("stats:sessions", result, ttl=60)
    return result

@router.patch("/{session_id}")
async def update_session(session_id: str, data: SessionUpdate, admin=Depends(get_current_admin)):
    fields, params = [], []
    i = 1
    if data.status:
        fields.append(f"status = ${i}"); params.append(data.status); i+=1
    if data.proxy_id is not None:
        fields.append(f"proxy_id = ${i}"); params.append(uuid.UUID(data.proxy_id) if data.proxy_id else None); i+=1
    if data.notes is not None:
        fields.append(f"notes = ${i}"); params.append(data.notes); i+=1
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    params.append(uuid.UUID(session_id))
    await execute(f"UPDATE sessions SET {', '.join(fields)} WHERE id = ${i}", *params)
    await cache_delete("stats:sessions")
    return {"success": True}

@router.delete("/{session_id}")
async def delete_session(session_id: str, admin=Depends(get_current_admin)):
    await execute("DELETE FROM sessions WHERE id = $1", uuid.UUID(session_id))
    await cache_delete("stats:sessions")
    return {"success": True}

@router.get("/{session_id}/logs")
async def session_logs(session_id: str, limit: int = 50, admin=Depends(get_current_admin)):
    rows = await fetch_all(
        "SELECT * FROM session_logs WHERE session_id = $1 ORDER BY created_at DESC LIMIT $2",
        uuid.UUID(session_id), limit
    )
    return [dict(r) for r in rows]
