from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional, List
import uuid
from core.database import fetch_all, fetch_one, execute
from core.security import verify_token, encrypt_session, decrypt_session
from core.redis_client import cache_set, cache_get, cache_delete
import logging

router = APIRouter()
security = HTTPBearer()
logger = logging.getLogger(__name__)

def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = verify_token(credentials.credentials)
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return payload

class SessionCreate(BaseModel):
    phone: str
    session_string: str
    api_id: Optional[int] = None
    api_hash: Optional[str] = None
    proxy_id: Optional[str] = None
    notes: Optional[str] = None

class SessionUpdate(BaseModel):
    status: Optional[str] = None
    proxy_id: Optional[str] = None
    notes: Optional[str] = None

@router.post("/")
async def add_session(data: SessionCreate, admin=Depends(get_current_admin)):
    existing = await fetch_one("SELECT id FROM sessions WHERE phone=$1", data.phone)
    if existing:
        raise HTTPException(status_code=409, detail="Session already exists")
    encrypted = encrypt_session(data.session_string)
    sid = str(uuid.uuid4())
    await execute(
        """INSERT INTO sessions (id, phone, session_data, session_string, api_id, api_hash, proxy_id, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)""",
        sid, data.phone, encrypted, encrypted,
        data.api_id, data.api_hash,
        uuid.UUID(data.proxy_id) if data.proxy_id else None, data.notes
    )
    await execute("INSERT INTO session_logs (session_id, event, details) VALUES ($1,$2,$3::jsonb)",
        uuid.UUID(sid), "created", '{"source":"api"}')
    await cache_delete("stats:sessions")
    return {"id": sid, "phone": data.phone, "status": "active"}

@router.post("/bulk")
async def bulk_add_sessions(sessions: List[SessionCreate], admin=Depends(get_current_admin)):
    added, skipped = 0, 0
    for s in sessions:
        existing = await fetch_one("SELECT id FROM sessions WHERE phone=$1", s.phone)
        if existing:
            skipped += 1
            continue
        encrypted = encrypt_session(s.session_string)
        sid = str(uuid.uuid4())
        await execute(
            """INSERT INTO sessions (id, phone, session_data, session_string, api_id, api_hash, proxy_id, notes)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8)""",
            sid, s.phone, encrypted, encrypted,
            s.api_id, s.api_hash,
            uuid.UUID(s.proxy_id) if s.proxy_id else None, s.notes
        )
        added += 1
    await cache_delete("stats:sessions")
    return {"added": added, "skipped": skipped, "total": len(sessions)}

@router.get("/")
async def list_sessions(
    status: Optional[str] = None, page: int = 1, limit: int = 50,
    search: Optional[str] = None, admin=Depends(get_current_admin)
):
    offset = (page - 1) * limit
    conditions, params = [], []
    i = 1
    if status:
        conditions.append(f"status=${i}"); params.append(status); i+=1
    if search:
        conditions.append(f"phone ILIKE ${i}"); params.append(f"%{search}%"); i+=1
    where = "WHERE " + " AND ".join(conditions) if conditions else ""
    rows = await fetch_all(
        f"SELECT id,phone,status,last_used,last_checked,error_count,country,notes,created_at FROM sessions {where} ORDER BY created_at DESC LIMIT ${i} OFFSET ${i+1}",
        *params, limit, offset
    )
    total = await fetch_one(f"SELECT COUNT(*) FROM sessions {where}", *params)
    return {"sessions": [dict(r) for r in rows], "total": total[0], "page": page}

@router.get("/stats")
async def session_stats(admin=Depends(get_current_admin)):
    cached = await cache_get("stats:sessions")
    if cached: return cached
    rows = await fetch_all("SELECT status, COUNT(*) as count FROM sessions GROUP BY status")
    result = {r["status"]: r["count"] for r in rows}
    result["total"] = sum(result.values())
    await cache_set("stats:sessions", result, ttl=60)
    return result

@router.patch("/{session_id}")
async def update_session(session_id: str, data: SessionUpdate, admin=Depends(get_current_admin)):
    updates, params = [], []
    i = 1
    if data.status:
        updates.append(f"status=${i}"); params.append(data.status); i+=1
    if data.proxy_id is not None:
        updates.append(f"proxy_id=${i}"); params.append(uuid.UUID(data.proxy_id) if data.proxy_id else None); i+=1
    if data.notes is not None:
        updates.append(f"notes=${i}"); params.append(data.notes); i+=1
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    params.append(uuid.UUID(session_id))
    await execute(f"UPDATE sessions SET {', '.join(updates)} WHERE id=${i}", *params)
    await cache_delete("stats:sessions")
    return {"success": True}

@router.delete("/{session_id}")
async def delete_session(session_id: str, admin=Depends(get_current_admin)):
    await execute("DELETE FROM sessions WHERE id=$1", uuid.UUID(session_id))
    await cache_delete("stats:sessions")
    return {"success": True}

@router.get("/{session_id}/logs")
async def session_logs(session_id: str, admin=Depends(get_current_admin)):
    rows = await fetch_all(
        "SELECT event, details, created_at FROM session_logs WHERE session_id=$1 ORDER BY created_at DESC LIMIT 100",
        uuid.UUID(session_id)
    )
    return [dict(r) for r in rows]
