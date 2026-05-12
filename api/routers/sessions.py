from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional, List
import uuid
from core.database import fetch_all, fetch_one, execute
from core.security import verify_token, encrypt_data

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

class SessionCreate(BaseModel):
    phone: str
    session_string: str
    api_id: Optional[int] = None
    api_hash: Optional[str] = None

class SessionBulkItem(BaseModel):
    phone: str
    session_string: str
    api_id: Optional[int] = None
    api_hash: Optional[str] = None

@router.get("/stats")
async def session_stats(admin=Depends(get_current_admin)):
    rows = await fetch_all("SELECT status, COUNT(*) as count FROM sessions GROUP BY status")
    result = {r["status"]: int(r["count"]) for r in rows}
    result["total"] = sum(result.values())
    return result

@router.get("/")
async def list_sessions(
    status: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(50, ge=1, le=500),
    page:  int = Query(1, ge=1),
    admin=Depends(get_current_admin)
):
    offset = (page - 1) * limit
    conditions, params = [], []

    if status:
        params.append(status)
        conditions.append(f"status=${len(params)}")
    if search:
        params.append(f"%{search}%")
        conditions.append(f"phone ILIKE ${len(params)}")

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    params_count = list(params)
    total = await fetch_one(f"SELECT COUNT(*) as cnt FROM sessions {where}", *params_count)

    params.extend([limit, offset])
    rows = await fetch_all(
        f"SELECT id, phone, status, api_id, flood_until, error_count, last_checked, created_at, updated_at "
        f"FROM sessions {where} ORDER BY created_at DESC LIMIT ${len(params)-1} OFFSET ${len(params)}",
        *params
    )
    return {"sessions": [dict(r) for r in rows], "total": int(total["cnt"]) if total else 0}

@router.post("/")
async def create_session(data: SessionCreate, admin=Depends(get_current_admin)):
    if not data.phone.strip():
        raise HTTPException(status_code=400, detail="شماره تلفن الزامی است")
    if not data.session_string.strip():
        raise HTTPException(status_code=400, detail="session_string الزامی است")

    existing = await fetch_one("SELECT id FROM sessions WHERE phone=$1", data.phone.strip())
    if existing:
        raise HTTPException(status_code=409, detail="این شماره قبلاً ثبت شده است")

    encrypted = encrypt_data(data.session_string.strip())
    row = await fetch_one(
        """INSERT INTO sessions (phone, session_data, api_id, api_hash)
           VALUES ($1, $2, $3, $4) RETURNING id, phone, status, created_at""",
        data.phone.strip(), encrypted, data.api_id, data.api_hash
    )
    return dict(row)

@router.post("/bulk")
async def bulk_import(items: List[SessionBulkItem], admin=Depends(get_current_admin)):
    if not items:
        raise HTTPException(status_code=400, detail="لیست خالی است")
    if len(items) > 1000:
        raise HTTPException(status_code=400, detail="حداکثر ۱۰۰۰ سشن در هر بار")

    added = skipped = failed = 0
    for item in items:
        try:
            existing = await fetch_one("SELECT id FROM sessions WHERE phone=$1", item.phone.strip())
            if existing:
                skipped += 1
                continue
            encrypted = encrypt_data(item.session_string.strip())
            await execute(
                "INSERT INTO sessions (phone, session_data, api_id, api_hash) VALUES ($1,$2,$3,$4)",
                item.phone.strip(), encrypted, item.api_id, item.api_hash
            )
            added += 1
        except Exception:
            failed += 1

    return {"added": added, "skipped": skipped, "failed": failed}

@router.get("/{session_id}")
async def get_session(session_id: str, admin=Depends(get_current_admin)):
    uid = parse_uuid(session_id, "شناسه سشن")
    row = await fetch_one(
        "SELECT id, phone, status, api_id, flood_until, error_count, last_checked, created_at, updated_at "
        "FROM sessions WHERE id=$1", uid
    )
    if not row:
        raise HTTPException(status_code=404, detail="سشن یافت نشد")
    return dict(row)

@router.delete("/logged-out")
async def delete_logged_out(admin=Depends(get_current_admin)):
    row = await fetch_one(
        "WITH deleted AS (DELETE FROM sessions WHERE status IN ('logged_out','deleted') RETURNING id) "
        "SELECT COUNT(*) as cnt FROM deleted"
    )
    return {"deleted": int(row["cnt"]) if row else 0}

@router.delete("/{session_id}")
async def delete_session(session_id: str, admin=Depends(get_current_admin)):
    uid = parse_uuid(session_id, "شناسه سشن")
    row = await fetch_one("SELECT id FROM sessions WHERE id=$1", uid)
    if not row:
        raise HTTPException(status_code=404, detail="سشن یافت نشد")
    await execute("DELETE FROM sessions WHERE id=$1", uid)
    return {"success": True}

@router.patch("/{session_id}/status")
async def update_status(session_id: str, status: str, admin=Depends(get_current_admin)):
    uid = parse_uuid(session_id, "شناسه سشن")
    allowed = {"active", "inactive", "banned", "logged_out"}
    if status not in allowed:
        raise HTTPException(status_code=400, detail=f"وضعیت باید یکی از {allowed} باشد")
    row = await fetch_one("SELECT id FROM sessions WHERE id=$1", uid)
    if not row:
        raise HTTPException(status_code=404, detail="سشن یافت نشد")
    await execute("UPDATE sessions SET status=$1, updated_at=NOW() WHERE id=$2", status, uid)
    return {"success": True}
