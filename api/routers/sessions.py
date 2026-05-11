from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional, List
import uuid
from core.database import fetch_all, fetch_one, execute
from core.security import verify_token, encrypt_session
from core.redis_client import cache_delete

router = APIRouter()
security = HTTPBearer()

def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = verify_token(credentials.credentials)
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="فقط ادمین دسترسی دارد")
    return payload

class SessionCreate(BaseModel):
    phone: str
    session_string: str
    api_id: Optional[int] = None
    api_hash: Optional[str] = None
    country: Optional[str] = None
    notes: Optional[str] = None

class SessionBulkCreate(BaseModel):
    sessions: List[SessionCreate]

@router.get("/stats")
async def get_session_stats(admin=Depends(get_current_admin)):
    rows = await fetch_all("SELECT status, COUNT(*) as count FROM sessions GROUP BY status")
    stats = {r["status"]: r["count"] for r in rows}
    stats["total"] = sum(stats.values())
    return stats

@router.get("/")
async def list_sessions(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    status: Optional[str] = None,
    search: Optional[str] = None,
    admin=Depends(get_current_admin)
):
    offset = (page - 1) * limit
    conditions = []
    params = []
    idx = 1

    if status:
        conditions.append(f"status=${idx}")
        params.append(status)
        idx += 1
    if search:
        conditions.append(f"phone ILIKE ${idx}")
        params.append(f"%{search}%")
        idx += 1

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    params_count = params.copy()
    total_row = await fetch_one(f"SELECT COUNT(*) as cnt FROM sessions {where}", *params_count)
    total = total_row["cnt"] if total_row else 0

    params.extend([limit, offset])
    rows = await fetch_all(
        f"SELECT id, phone, status, flood_until, error_count, last_used, last_checked, country, created_at "
        f"FROM sessions {where} ORDER BY created_at DESC LIMIT ${idx} OFFSET ${idx+1}",
        *params
    )
    return {"sessions": [dict(r) for r in rows], "total": total, "page": page}

@router.post("/")
async def create_session(data: SessionCreate, admin=Depends(get_current_admin)):
    existing = await fetch_one("SELECT id FROM sessions WHERE phone=$1", data.phone)
    if existing:
        raise HTTPException(status_code=409, detail="این شماره قبلاً ثبت شده")
    session_id = str(uuid.uuid4())
    encrypted = encrypt_session(data.session_string)
    await execute(
        "INSERT INTO sessions (id, phone, session_string, session_data, api_id, api_hash, country, notes) "
        "VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
        session_id, data.phone, encrypted, encrypted,
        data.api_id, data.api_hash, data.country, data.notes
    )
    return {"id": session_id, "success": True}

@router.post("/bulk")
async def bulk_create_sessions(data: SessionBulkCreate, admin=Depends(get_current_admin)):
    added = 0
    skipped = 0
    errors = []
    for s in data.sessions:
        try:
            existing = await fetch_one("SELECT id FROM sessions WHERE phone=$1", s.phone)
            if existing:
                skipped += 1
                continue
            session_id = str(uuid.uuid4())
            encrypted = encrypt_session(s.session_string)
            await execute(
                "INSERT INTO sessions (id, phone, session_string, session_data, api_id, api_hash, country, notes) "
                "VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
                session_id, s.phone, encrypted, encrypted,
                s.api_id, s.api_hash, s.country, s.notes
            )
            added += 1
        except Exception as e:
            errors.append({"phone": s.phone, "error": str(e)})
    return {"added": added, "skipped": skipped, "errors": errors}

@router.get("/{session_id}")
async def get_session(session_id: str, admin=Depends(get_current_admin)):
    row = await fetch_one(
        "SELECT id, phone, status, api_id, flood_until, error_count, last_used, last_checked, country, notes, created_at "
        "FROM sessions WHERE id=$1",
        uuid.UUID(session_id)
    )
    if not row:
        raise HTTPException(status_code=404, detail="سشن یافت نشد")
    return dict(row)

@router.patch("/{session_id}/status")
async def update_session_status(session_id: str, status: str, admin=Depends(get_current_admin)):
    valid_statuses = ["active", "inactive", "logged_out", "deleted", "banned", "flood", "error"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"وضعیت نامعتبر. مقادیر مجاز: {valid_statuses}")
    await execute("UPDATE sessions SET status=$1, updated_at=NOW() WHERE id=$2", status, uuid.UUID(session_id))
    return {"success": True}

@router.delete("/{session_id}")
async def delete_session(session_id: str, admin=Depends(get_current_admin)):
    await execute("DELETE FROM sessions WHERE id=$1", uuid.UUID(session_id))
    return {"success": True}

@router.delete("/bulk/logged-out")
async def delete_logged_out(admin=Depends(get_current_admin)):
    result = await execute("DELETE FROM sessions WHERE status IN ('logged_out', 'deleted', 'banned')")
    return {"success": True, "message": "سشن‌های غیرفعال حذف شدند"}
