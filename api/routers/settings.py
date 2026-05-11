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

class SettingUpdate(BaseModel):
    value: str

class PlanCreate(BaseModel):
    name_fa: str
    name_en: str
    session_count: int
    price_usd: float
    duration_days: Optional[int] = None

class DiscountCreate(BaseModel):
    code: str
    type: str
    value: float
    max_uses: Optional[int] = None
    min_amount: float = 0
    expires_at: Optional[str] = None

@router.get("")
async def get_settings(admin=Depends(get_current_admin)):
    rows = await fetch_all("SELECT key, value, description FROM settings ORDER BY key")
    return {r["key"]: {"value": r["value"], "description": r["description"]} for r in rows}

@router.patch("/{key}")
async def update_setting(key: str, data: SettingUpdate, admin=Depends(get_current_admin)):
    await execute("UPDATE settings SET value = $1, updated_at = NOW() WHERE key = $2", data.value, key)
    return {"success": True}

@router.get("/plans")
async def list_plans():
    rows = await fetch_all("SELECT * FROM plans WHERE is_active = TRUE ORDER BY sort_order")
    return [dict(r) for r in rows]

@router.post("/plans")
async def create_plan(data: PlanCreate, admin=Depends(get_current_admin)):
    row = await fetch_one(
        "INSERT INTO plans (name_fa, name_en, session_count, price_usd, duration_days) VALUES ($1,$2,$3,$4,$5) RETURNING id",
        data.name_fa, data.name_en, data.session_count, data.price_usd, data.duration_days
    )
    return {"id": str(row["id"])}

@router.delete("/plans/{plan_id}")
async def delete_plan(plan_id: str, admin=Depends(get_current_admin)):
    await execute("UPDATE plans SET is_active = FALSE WHERE id = $1", uuid.UUID(plan_id))
    return {"success": True}

@router.get("/discounts")
async def list_discounts(admin=Depends(get_current_admin)):
    rows = await fetch_all("SELECT * FROM discounts ORDER BY created_at DESC")
    return [dict(r) for r in rows]

@router.post("/discounts")
async def create_discount(data: DiscountCreate, admin=Depends(get_current_admin)):
    row = await fetch_one(
        "INSERT INTO discounts (code, type, value, max_uses, min_amount, expires_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
        data.code, data.type, data.value, data.max_uses, data.min_amount, data.expires_at
    )
    return {"id": str(row["id"])}

@router.delete("/discounts/{discount_id}")
async def delete_discount(discount_id: str, admin=Depends(get_current_admin)):
    await execute("UPDATE discounts SET is_active = FALSE WHERE id = $1", uuid.UUID(discount_id))
    return {"success": True}
