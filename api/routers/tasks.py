from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional
import uuid
from core.database import fetch_all, fetch_one, execute
from core.security import verify_token
from core.redis_client import enqueue_task

router = APIRouter()
security = HTTPBearer()

def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = verify_token(credentials.credentials)
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="فقط ادمین دسترسی دارد")
    return payload

class JoinTaskCreate(BaseModel):
    target: str
    target_type: str = "link"
    session_count: int
    join_delay_min: int = 3
    join_delay_max: int = 8
    auto_leave_after: Optional[int] = None
    priority: int = 5
    user_id: Optional[int] = None

@router.post("/join")
async def create_join_task(data: JoinTaskCreate, admin=Depends(get_current_admin)):
    if data.session_count < 1:
        raise HTTPException(status_code=400, detail="تعداد سشن باید حداقل ۱ باشد")
    if data.join_delay_min > data.join_delay_max:
        raise HTTPException(status_code=400, detail="تأخیر حداقل نباید از حداکثر بیشتر باشد")
    if not data.target.strip():
        raise HTTPException(status_code=400, detail="هدف نمی‌تواند خالی باشد")

    active = await fetch_one("SELECT COUNT(*) as cnt FROM sessions WHERE status='active'")
    if not active or active["cnt"] < 1:
        raise HTTPException(status_code=400, detail="هیچ سشن فعالی وجود ندارد")

    task_id = str(uuid.uuid4())
    await execute(
        """INSERT INTO tasks
           (id, user_id, type, target, target_type, session_count,
            join_delay_min, join_delay_max, auto_leave_after, priority, status)
           VALUES ($1,$2,'join',$3,$4,$5,$6,$7,$8,$9,'pending')""",
        task_id, data.user_id, data.target.strip(), data.target_type,
        data.session_count, data.join_delay_min, data.join_delay_max,
        data.auto_leave_after, data.priority
    )
    await enqueue_task("tasks:join", {
        "task_id": task_id,
        "target": data.target.strip(),
        "target_type": data.target_type,
        "session_count": data.session_count,
        "join_delay_min": data.join_delay_min,
        "join_delay_max": data.join_delay_max,
        "auto_leave_after": data.auto_leave_after,
        "priority": data.priority,
    })
    return {"task_id": task_id, "status": "pending"}

@router.get("/")
async def list_tasks(
    status: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    page: int = Query(1, ge=1),
    admin=Depends(get_current_admin)
):
    offset = (page - 1) * limit
    # ── ساخت query بدون باگ index ──────────────────────────────
    if status:
        rows = await fetch_all(
            "SELECT id, type, target, target_type, session_count, sessions_done, sessions_failed, "
            "status, join_delay_min, join_delay_max, auto_leave_after, priority, "
            "created_at, started_at, completed_at "
            "FROM tasks WHERE status=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
            status, limit, offset
        )
    else:
        rows = await fetch_all(
            "SELECT id, type, target, target_type, session_count, sessions_done, sessions_failed, "
            "status, join_delay_min, join_delay_max, auto_leave_after, priority, "
            "created_at, started_at, completed_at "
            "FROM tasks ORDER BY created_at DESC LIMIT $1 OFFSET $2",
            limit, offset
        )
    return [dict(r) for r in rows]

@router.get("/stats")
async def task_stats(admin=Depends(get_current_admin)):
    rows = await fetch_all("SELECT status, COUNT(*) as count FROM tasks GROUP BY status")
    return {r["status"]: r["count"] for r in rows}

@router.get("/{task_id}")
async def get_task(task_id: str, admin=Depends(get_current_admin)):
    try:
        uid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="شناسه تسک نامعتبر است")
    row = await fetch_one("SELECT * FROM tasks WHERE id=$1", uid)
    if not row:
        raise HTTPException(status_code=404, detail="تسک یافت نشد")
    return dict(row)

@router.get("/{task_id}/sessions")
async def get_task_sessions(task_id: str, admin=Depends(get_current_admin)):
    try:
        uid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="شناسه تسک نامعتبر است")
    rows = await fetch_all(
        "SELECT ts.session_id, s.phone, ts.status, ts.error, ts.joined_at, ts.left_at "
        "FROM task_sessions ts JOIN sessions s ON ts.session_id=s.id "
        "WHERE ts.task_id=$1 ORDER BY ts.joined_at DESC NULLS LAST LIMIT 200",
        uid
    )
    return [dict(r) for r in rows]

@router.post("/{task_id}/cancel")
async def cancel_task(task_id: str, admin=Depends(get_current_admin)):
    try:
        uid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="شناسه تسک نامعتبر است")
    row = await fetch_one("SELECT status FROM tasks WHERE id=$1", uid)
    if not row:
        raise HTTPException(status_code=404, detail="تسک یافت نشد")
    if row["status"] in ("completed", "cancelled", "failed"):
        raise HTTPException(status_code=400, detail=f"تسک در وضعیت '{row['status']}' قابل لغو نیست")
    await execute("UPDATE tasks SET status='cancelled', completed_at=NOW() WHERE id=$1", uid)
    return {"success": True}

@router.post("/{task_id}/pause")
async def pause_task(task_id: str, admin=Depends(get_current_admin)):
    try:
        uid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="شناسه تسک نامعتبر است")
    row = await fetch_one("SELECT status FROM tasks WHERE id=$1", uid)
    if not row:
        raise HTTPException(status_code=404, detail="تسک یافت نشد")
    if row["status"] != "running":
        raise HTTPException(status_code=400, detail="فقط تسک‌های در حال اجرا را می‌توان متوقف کرد")
    await execute("UPDATE tasks SET status='paused' WHERE id=$1", uid)
    return {"success": True}

@router.post("/{task_id}/resume")
async def resume_task(task_id: str, admin=Depends(get_current_admin)):
    try:
        uid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="شناسه تسک نامعتبر است")
    row = await fetch_one("SELECT * FROM tasks WHERE id=$1", uid)
    if not row:
        raise HTTPException(status_code=404, detail="تسک یافت نشد")
    if row["status"] != "paused":
        raise HTTPException(status_code=400, detail="فقط تسک‌های متوقف را می‌توان از سر گرفت")
    await execute("UPDATE tasks SET status='pending' WHERE id=$1", uid)
    await enqueue_task("tasks:join", {
        "task_id": task_id,
        "target": row["target"],
        "target_type": row["target_type"],
        "session_count": row["session_count"],
        "join_delay_min": row["join_delay_min"],
        "join_delay_max": row["join_delay_max"],
        "auto_leave_after": row["auto_leave_after"],
        "priority": row["priority"],
    })
    return {"success": True}
