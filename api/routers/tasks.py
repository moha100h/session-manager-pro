from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional
import uuid
from core.database import fetch_all, fetch_one, execute
from core.security import verify_token
from core.redis_client import enqueue_task

router = APIRouter()
security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    return verify_token(credentials.credentials)

def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = verify_token(credentials.credentials)
    if not payload.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return payload

class TaskCreate(BaseModel):
    type: str
    target: str
    target_type: str = "link"
    session_count: int
    auto_leave_after: Optional[int] = None
    join_delay_min: int = 3
    join_delay_max: int = 8
    priority: int = 5

@router.post("")
async def create_task(data: TaskCreate, user=Depends(get_current_user)):
    if data.session_count < 1 or data.session_count > 40000:
        raise HTTPException(status_code=400, detail="Invalid session count (1-40000)")
    available = await fetch_one("SELECT COUNT(*) FROM sessions WHERE status = 'active'")
    if available[0] < data.session_count:
        raise HTTPException(status_code=400, detail=f"Not enough active sessions. Available: {available[0]}")
    row = await fetch_one(
        """INSERT INTO tasks (user_id, type, target, target_type, session_count, auto_leave_after, join_delay_min, join_delay_max, priority)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id""",
        user.get("user_id"), data.type, data.target, data.target_type,
        data.session_count, data.auto_leave_after, data.join_delay_min, data.join_delay_max, data.priority
    )
    task_id = str(row["id"])
    sessions = await fetch_all("SELECT id FROM sessions WHERE status = 'active' ORDER BY RANDOM() LIMIT $1", data.session_count)
    if sessions:
        await execute(
            "INSERT INTO task_sessions (task_id, session_id) SELECT $1, unnest($2::uuid[])",
            uuid.UUID(task_id), [r["id"] for r in sessions]
        )
    await enqueue_task("tasks:queue", {"task_id": task_id, "type": data.type, "priority": data.priority})
    return {"task_id": task_id, "status": "pending", "sessions_assigned": len(sessions)}

@router.get("")
async def list_tasks(status: Optional[str] = None, page: int = 1, limit: int = 20, user=Depends(get_current_user)):
    offset = (page - 1) * limit
    is_admin = user.get("is_admin", False)
    params = [] if is_admin else [user.get("user_id")]
    where = "WHERE 1=1" if is_admin else "WHERE user_id = $1"
    i = len(params) + 1
    if status:
        where += f" AND status = ${i}"; params.append(status); i+=1
    rows = await fetch_all(f"SELECT * FROM tasks {where} ORDER BY created_at DESC LIMIT ${i} OFFSET ${i+1}", *params, limit, offset)
    return [dict(r) for r in rows]

@router.get("/{task_id}")
async def get_task(task_id: str, user=Depends(get_current_user)):
    row = await fetch_one("SELECT * FROM tasks WHERE id = $1", uuid.UUID(task_id))
    if not row: raise HTTPException(status_code=404, detail="Task not found")
    sessions = await fetch_all(
        "SELECT ts.status, s.phone, ts.joined_at, ts.left_at, ts.error FROM task_sessions ts JOIN sessions s ON s.id = ts.session_id WHERE ts.task_id = $1 LIMIT 200",
        uuid.UUID(task_id)
    )
    return {**dict(row), "session_details": [dict(s) for s in sessions]}

@router.post("/{task_id}/cancel")
async def cancel_task(task_id: str, admin=Depends(get_current_admin)):
    await execute("UPDATE tasks SET status = 'cancelled' WHERE id = $1", uuid.UUID(task_id))
    return {"success": True}

@router.post("/{task_id}/pause")
async def pause_task(task_id: str, admin=Depends(get_current_admin)):
    await execute("UPDATE tasks SET status = 'paused' WHERE id = $1", uuid.UUID(task_id))
    return {"success": True}

@router.post("/{task_id}/resume")
async def resume_task(task_id: str, admin=Depends(get_current_admin)):
    await execute("UPDATE tasks SET status = 'running' WHERE id = $1", uuid.UUID(task_id))
    await enqueue_task("tasks:queue", {"task_id": task_id, "type": "resume"})
    return {"success": True}
