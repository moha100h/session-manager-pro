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
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return payload

class TaskCreate(BaseModel):
    target: str
    target_type: str = "link"
    session_count: int
    auto_leave_after: Optional[int] = None
    join_delay_min: int = 3
    join_delay_max: int = 8
    priority: int = 5

@router.post("/join")
async def create_join_task(data: TaskCreate, user=Depends(get_current_user)):
    task_id = str(uuid.uuid4())
    await execute(
        """INSERT INTO tasks (id, user_id, type, target, target_type, session_count,
           auto_leave_after, join_delay_min, join_delay_max, priority)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)""",
        task_id, user.get("user_id"), "join", data.target, data.target_type,
        data.session_count, data.auto_leave_after,
        data.join_delay_min, data.join_delay_max, data.priority
    )
    await enqueue_task("tasks:join", {
        "task_id": task_id, "target": data.target,
        "target_type": data.target_type, "session_count": data.session_count,
        "auto_leave_after": data.auto_leave_after,
        "join_delay_min": data.join_delay_min, "join_delay_max": data.join_delay_max
    })
    return {"task_id": task_id, "status": "pending"}

@router.get("/")
async def list_tasks(status: Optional[str] = None, page: int = 1, limit: int = 20, admin=Depends(get_current_admin)):
    offset = (page - 1) * limit
    where = "WHERE t.status=$1" if status else ""
    params = [status, limit, offset] if status else [limit, offset]
    i = 2 if status else 1
    rows = await fetch_all(
        f"""SELECT t.*, u.username, u.full_name FROM tasks t
            LEFT JOIN users u ON t.user_id=u.id
            {where} ORDER BY t.created_at DESC LIMIT ${i} OFFSET ${i+1}""",
        *params
    )
    return [dict(r) for r in rows]

@router.get("/{task_id}")
async def get_task(task_id: str, user=Depends(get_current_user)):
    row = await fetch_one("SELECT * FROM tasks WHERE id=$1", uuid.UUID(task_id))
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    return dict(row)

@router.post("/{task_id}/cancel")
async def cancel_task(task_id: str, admin=Depends(get_current_admin)):
    await execute("UPDATE tasks SET status='cancelled' WHERE id=$1 AND status IN ('pending','running')", uuid.UUID(task_id))
    return {"success": True}

@router.post("/{task_id}/pause")
async def pause_task(task_id: str, admin=Depends(get_current_admin)):
    await execute("UPDATE tasks SET status='paused' WHERE id=$1 AND status='running'", uuid.UUID(task_id))
    return {"success": True}

@router.post("/{task_id}/resume")
async def resume_task(task_id: str, admin=Depends(get_current_admin)):
    await execute("UPDATE tasks SET status='running' WHERE id=$1 AND status='paused'", uuid.UUID(task_id))
    await enqueue_task("tasks:resume", {"task_id": task_id})
    return {"success": True}
