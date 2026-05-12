from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, validator
from typing import Optional
import uuid
from core.database import fetch_all, fetch_one, execute
from core.security import verify_token

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

class SettingUpdate(BaseModel):
    value: str

    @validator("value")
    def not_empty(cls, v):
        if v is None or str(v).strip() == "":
            raise ValueError("مقدار نمی‌تواند خالی باشد")
        return str(v).strip()

class PlanCreate(BaseModel):
    name_fa:       str
    name_en:       str
    session_count: int
    price_usd:     float
    duration_days: Optional[int] = None
    is_active:     bool = True
    sort_order:    int = 0

    @validator("session_count")
    def count_positive(cls, v):
        if v <= 0:
            raise ValueError("تعداد سشن باید مثبت باشد")
        return v

    @validator("price_usd")
    def price_positive(cls, v):
        if v <= 0:
            raise ValueError("قیمت باید مثبت باشد")
        return v

class PlanUpdate(BaseModel):
    name_fa:       Optional[str]   = None
    name_en:       Optional[str]   = None
    session_count: Optional[int]   = None
    price_usd:     Optional[float] = None
    duration_days: Optional[int]   = None
    is_active:     Optional[bool]  = None
    sort_order:    Optional[int]   = None

class DiscountCreate(BaseModel):
    code:      str
    type:      str = "percent"
    value:     float
    min_amount: float = 0
    max_uses:  Optional[int] = None
    is_active: bool = True

    @validator("code")
    def code_upper(cls, v):
        if not v or not v.strip():
            raise ValueError("کد تخفیف نمی‌تواند خالی باشد")
        return v.strip().upper()

    @validator("type")
    def type_valid(cls, v):
        if v not in ("percent", "fixed"):
            raise ValueError("نوع باید percent یا fixed باشد")
        return v

    @validator("value")
    def value_positive(cls, v):
        if v <= 0:
            raise ValueError("مقدار باید مثبت باشد")
        return v

# ── Settings ───────────────────────────────────────────────
@router.get("/")
async def get_settings(admin=Depends(get_current_admin)):
    rows = await fetch_all("SELECT key, value, description, updated_at FROM settings ORDER BY key")
    return {r["key"]: {"value": r["value"], "description": r["description"], "updated_at": str(r["updated_at"])} for r in rows}

@router.put("/{key}")
async def update_setting(key: str, data: SettingUpdate, admin=Depends(get_current_admin)):
    row = await fetch_one("SELECT key FROM settings WHERE key=$1", key)
    if not row:
        # اگر کلید جدیده (مثل wallet addresses) insert می‌کنیم
        await execute(
            "INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW()) "
            "ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()",
            key, data.value
        )
    else:
        await execute(
            "UPDATE settings SET value=$1, updated_at=NOW() WHERE key=$2",
            data.value, key
        )
    return {"success": True, "key": key, "value": data.value}

# ── Plans ──────────────────────────────────────────────────
@router.get("/plans")
async def get_plans(admin=Depends(get_current_admin)):
    rows = await fetch_all(
        "SELECT id, name_fa, name_en, session_count, price_usd, duration_days, is_active, sort_order, created_at "
        "FROM plans ORDER BY sort_order, price_usd"
    )
    return [dict(r) for r in rows]

@router.get("/plans/public")
async def get_plans_public():
    """بدون نیاز به auth — برای نمایش به کاربران"""
    rows = await fetch_all(
        "SELECT id, name_fa, name_en, session_count, price_usd, duration_days, sort_order "
        "FROM plans WHERE is_active=TRUE ORDER BY sort_order, price_usd"
    )
    return [dict(r) for r in rows]

@router.post("/plans")
async def create_plan(data: PlanCreate, admin=Depends(get_current_admin)):
    row = await fetch_one(
        """INSERT INTO plans (name_fa, name_en, session_count, price_usd, duration_days, is_active, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING id, name_fa, name_en, session_count, price_usd, duration_days, is_active, sort_order""",
        data.name_fa, data.name_en, data.session_count, data.price_usd,
        data.duration_days, data.is_active, data.sort_order
    )
    return dict(row)

@router.put("/plans/{plan_id}")
async def update_plan(plan_id: str, data: PlanUpdate, admin=Depends(get_current_admin)):
    uid = parse_uuid(plan_id, "شناسه پلن")
    row = await fetch_one("SELECT * FROM plans WHERE id=$1", uid)
    if not row:
        raise HTTPException(status_code=404, detail="پلن یافت نشد")

    updates, params = [], [uid]
    if data.name_fa       is not None: params.append(data.name_fa);       updates.append(f"name_fa=${len(params)}")
    if data.name_en       is not None: params.append(data.name_en);       updates.append(f"name_en=${len(params)}")
    if data.session_count is not None: params.append(data.session_count); updates.append(f"session_count=${len(params)}")
    if data.price_usd     is not None: params.append(data.price_usd);     updates.append(f"price_usd=${len(params)}")
    if data.duration_days is not None: params.append(data.duration_days); updates.append(f"duration_days=${len(params)}")
    if data.is_active     is not None: params.append(data.is_active);     updates.append(f"is_active=${len(params)}")
    if data.sort_order    is not None: params.append(data.sort_order);    updates.append(f"sort_order=${len(params)}")

    if not updates:
        raise HTTPException(status_code=400, detail="هیچ فیلدی برای آپدیت ارسال نشده")

    await execute(f"UPDATE plans SET {', '.join(updates)} WHERE id=$1", *params)
    return {"success": True}

@router.delete("/plans/{plan_id}")
async def delete_plan(plan_id: str, admin=Depends(get_current_admin)):
    uid = parse_uuid(plan_id, "شناسه پلن")
    row = await fetch_one("SELECT id FROM plans WHERE id=$1", uid)
    if not row:
        raise HTTPException(status_code=404, detail="پلن یافت نشد")
    await execute("DELETE FROM plans WHERE id=$1", uid)
    return {"success": True}

# ── Discounts ──────────────────────────────────────────────
@router.get("/discounts")
async def get_discounts(admin=Depends(get_current_admin)):
    rows = await fetch_all(
        "SELECT id, code, type, value, min_amount, max_uses, used_count, is_active, expires_at, created_at "
        "FROM discounts ORDER BY created_at DESC"
    )
    return [dict(r) for r in rows]

@router.post("/discounts")
async def create_discount(data: DiscountCreate, admin=Depends(get_current_admin)):
    existing = await fetch_one("SELECT id FROM discounts WHERE code=$1", data.code)
    if existing:
        raise HTTPException(status_code=409, detail="این کد تخفیف قبلاً ثبت شده است")
    row = await fetch_one(
        """INSERT INTO discounts (code, type, value, min_amount, max_uses, is_active)
           VALUES ($1,$2,$3,$4,$5,$6)
           RETURNING id, code, type, value, min_amount, max_uses, is_active, created_at""",
        data.code, data.type, data.value, data.min_amount, data.max_uses, data.is_active
    )
    return dict(row)

@router.delete("/discounts/{discount_id}")
async def delete_discount(discount_id: str, admin=Depends(get_current_admin)):
    uid = parse_uuid(discount_id, "شناسه تخفیف")
    row = await fetch_one("SELECT id FROM discounts WHERE id=$1", uid)
    if not row:
        raise HTTPException(status_code=404, detail="کد تخفیف یافت نشد")
    await execute("DELETE FROM discounts WHERE id=$1", uid)
    return {"success": True}

@router.patch("/discounts/{discount_id}/toggle")
async def toggle_discount(discount_id: str, admin=Depends(get_current_admin)):
    uid = parse_uuid(discount_id, "شناسه تخفیف")
    row = await fetch_one("SELECT id, is_active FROM discounts WHERE id=$1", uid)
    if not row:
        raise HTTPException(status_code=404, detail="کد تخفیف یافت نشد")
    await execute("UPDATE discounts SET is_active=$1 WHERE id=$2", not row["is_active"], uid)
    return {"success": True, "is_active": not row["is_active"]}
