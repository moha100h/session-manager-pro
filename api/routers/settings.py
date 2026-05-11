from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional
import uuid
from core.database import fetch_all, fetch_one, execute
from core.security import verify_token
from core.redis_client import cache_delete

router = APIRouter()
security = HTTPBearer()

def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = verify_token(credentials.credentials)
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="فقط ادمین دسترسی دارد")
    return payload

# ─── Settings ───────────────────────────────────────────────

class SettingUpdate(BaseModel):
    value: str

@router.get("/")
async def get_settings(admin=Depends(get_current_admin)):
    rows = await fetch_all("SELECT key, value, description FROM settings ORDER BY key")
    return {r["key"]: {"value": r["value"], "description": r["description"]} for r in rows}

@router.patch("/{key}")
async def update_setting(key: str, data: SettingUpdate, admin=Depends(get_current_admin)):
    existing = await fetch_one("SELECT key FROM settings WHERE key=$1", key)
    if not existing:
        raise HTTPException(status_code=404, detail="تنظیم یافت نشد")
    await execute("UPDATE settings SET value=$1, updated_at=NOW() WHERE key=$2", data.value, key)
    await cache_delete("stats:dashboard")
    return {"success": True}

# ─── Plans ──────────────────────────────────────────────────

class PlanCreate(BaseModel):
    name_fa: str
    name_en: str
    session_count: int
    price_usd: float
    duration_days: Optional[int] = None

@router.get("/plans")
async def get_plans():
    """عمومی — بدون نیاز به توکن"""
    rows = await fetch_all(
        "SELECT id, name_fa, name_en, session_count, price_usd, duration_days, is_active, sort_order "
        "FROM plans WHERE is_active=TRUE ORDER BY sort_order ASC"
    )
    return [dict(r) for r in rows]

@router.get("/plans/all")
async def get_all_plans(admin=Depends(get_current_admin)):
    rows = await fetch_all(
        "SELECT id, name_fa, name_en, session_count, price_usd, duration_days, is_active, sort_order "
        "FROM plans ORDER BY sort_order ASC"
    )
    return [dict(r) for r in rows]

@router.post("/plans")
async def create_plan(data: PlanCreate, admin=Depends(get_current_admin)):
    plan_id = str(uuid.uuid4())
    await execute(
        "INSERT INTO plans (id, name_fa, name_en, session_count, price_usd, duration_days) "
        "VALUES ($1,$2,$3,$4,$5,$6)",
        plan_id, data.name_fa, data.name_en, data.session_count, data.price_usd, data.duration_days
    )
    return {"id": plan_id, "success": True}

@router.patch("/plans/{plan_id}/toggle")
async def toggle_plan(plan_id: str, admin=Depends(get_current_admin)):
    await execute("UPDATE plans SET is_active=NOT is_active WHERE id=$1", uuid.UUID(plan_id))
    return {"success": True}

@router.delete("/plans/{plan_id}")
async def delete_plan(plan_id: str, admin=Depends(get_current_admin)):
    await execute("DELETE FROM plans WHERE id=$1", uuid.UUID(plan_id))
    return {"success": True}

# ─── Discounts ──────────────────────────────────────────────

class DiscountCreate(BaseModel):
    code: str
    type: str = "percent"   # percent | fixed
    value: float
    max_uses: Optional[int] = None
    min_amount: Optional[float] = 0
    expires_at: Optional[str] = None

class DiscountValidate(BaseModel):
    code: str
    amount: float

@router.get("/discounts")
async def get_discounts(admin=Depends(get_current_admin)):
    rows = await fetch_all(
        "SELECT id, code, type, value, min_amount, max_uses, used_count, is_active, expires_at "
        "FROM discounts ORDER BY created_at DESC"
    )
    return [dict(r) for r in rows]

@router.post("/discounts")
async def create_discount(data: DiscountCreate, admin=Depends(get_current_admin)):
    disc_id = str(uuid.uuid4())
    expires = None
    if data.expires_at:
        from datetime import datetime
        expires = datetime.fromisoformat(data.expires_at)
    await execute(
        "INSERT INTO discounts (id, code, type, value, min_amount, max_uses, expires_at) "
        "VALUES ($1,$2,$3,$4,$5,$6,$7)",
        disc_id, data.code.upper(), data.type, data.value,
        data.min_amount or 0, data.max_uses, expires
    )
    return {"id": disc_id, "success": True}

@router.post("/discounts/validate")
async def validate_discount(data: DiscountValidate):
    """بررسی اعتبار کد تخفیف — عمومی"""
    row = await fetch_one(
        "SELECT * FROM discounts WHERE code=$1 AND is_active=TRUE "
        "AND (expires_at IS NULL OR expires_at > NOW()) "
        "AND (max_uses IS NULL OR used_count < max_uses)",
        data.code.upper()
    )
    if not row:
        raise HTTPException(status_code=404, detail="کد تخفیف نامعتبر یا منقضی شده")
    if data.amount < row["min_amount"]:
        raise HTTPException(status_code=400, detail=f"حداقل مبلغ برای این کد: ${row['min_amount']}")
    discount_amount = (data.amount * row["value"] / 100) if row["type"] == "percent" else row["value"]
    final = max(0, data.amount - discount_amount)
    return {"valid": True, "discount_amount": round(discount_amount, 2), "final_amount": round(final, 2)}

@router.delete("/discounts/{discount_id}")
async def delete_discount(discount_id: str, admin=Depends(get_current_admin)):
    await execute("DELETE FROM discounts WHERE id=$1", uuid.UUID(discount_id))
    return {"success": True}

@router.patch("/discounts/{discount_id}/toggle")
async def toggle_discount(discount_id: str, admin=Depends(get_current_admin)):
    await execute("UPDATE discounts SET is_active=NOT is_active WHERE id=$1", uuid.UUID(discount_id))
    return {"success": True}
