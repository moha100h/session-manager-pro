from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional
import uuid
import os
from datetime import datetime, timedelta
from core.database import fetch_all, fetch_one, execute
from core.security import verify_token

router = APIRouter()
security = HTTPBearer()

def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = verify_token(credentials.credentials)
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="فقط ادمین دسترسی دارد")
    return payload

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    return verify_token(credentials.credentials)

WALLET_MAP = {
    "USDT_TRC20": os.getenv("USDT_TRC20_WALLET", ""),
    "TON": os.getenv("TON_WALLET", ""),
    "TRX": os.getenv("TRX_WALLET", ""),
}

async def get_rate(currency: str) -> float:
    """نرخ ارز را از دیتابیس می‌خواند"""
    key_map = {"USDT_TRC20": "usdt_rate", "TON": "ton_rate", "TRX": "trx_rate"}
    key = key_map.get(currency)
    if not key:
        return 1.0
    row = await fetch_one("SELECT value FROM settings WHERE key=$1", key)
    try:
        return float(row["value"]) if row else 1.0
    except (ValueError, TypeError):
        return 1.0

class OrderCreate(BaseModel):
    amount_usd: float
    currency: str   # USDT_TRC20 | TON | TRX
    discount_code: Optional[str] = None

class OrderSubmit(BaseModel):
    tx_hash: Optional[str] = None
    screenshot_file_id: Optional[str] = None

class AdminNote(BaseModel):
    admin_note: Optional[str] = None

@router.post("/")
async def create_order(
    data: OrderCreate,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    payload = verify_token(credentials.credentials)
    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=403, detail="فقط کاربران می‌توانند سفارش ثبت کنند")

    # بررسی حداقل مبلغ
    min_row = await fetch_one("SELECT value FROM settings WHERE key='min_deposit_usd'")
    min_usd = float(min_row["value"]) if min_row else 5.0
    if data.amount_usd < min_usd:
        raise HTTPException(status_code=400, detail=f"حداقل مبلغ واریز ${min_usd} است")

    # اعمال کد تخفیف
    final_amount = data.amount_usd
    if data.discount_code:
        disc = await fetch_one(
            "SELECT * FROM discounts WHERE code=$1 AND is_active=TRUE "
            "AND (expires_at IS NULL OR expires_at > NOW()) "
            "AND (max_uses IS NULL OR used_count < max_uses)",
            data.discount_code.upper()
        )
        if disc:
            if disc["type"] == "percent":
                final_amount = data.amount_usd * (1 - disc["value"] / 100)
            else:
                final_amount = max(0, data.amount_usd - disc["value"])
            await execute("UPDATE discounts SET used_count=used_count+1 WHERE id=$1", disc["id"])

    # محاسبه مقدار کریپتو
    if data.currency not in WALLET_MAP:
        raise HTTPException(status_code=400, detail="ارز پشتیبانی نمی‌شود. مقادیر مجاز: USDT_TRC20, TON, TRX")
    wallet = WALLET_MAP[data.currency]
    if not wallet:
        raise HTTPException(status_code=503, detail=f"کیف پول {data.currency} تنظیم نشده")

    rate = await get_rate(data.currency)
    amount_crypto = round(final_amount / rate, 6) if rate > 0 else final_amount

    order_id = str(uuid.uuid4())
    expires_at = datetime.utcnow() + timedelta(hours=2)
    await execute(
        "INSERT INTO orders (id, user_id, amount, currency, amount_crypto, wallet_address, expires_at) "
        "VALUES ($1,$2,$3,$4,$5,$6,$7)",
        order_id, user_id, round(final_amount, 2), data.currency, amount_crypto, wallet, expires_at
    )
    return {
        "order_id": order_id,
        "amount_usd": round(final_amount, 2),
        "amount_crypto": amount_crypto,
        "currency": data.currency,
        "wallet": wallet,
        "expires_at": expires_at.isoformat()
    }

@router.post("/{order_id}/submit")
async def submit_order(
    order_id: str,
    data: OrderSubmit,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    payload = verify_token(credentials.credentials)
    user_id = payload.get("user_id")
    row = await fetch_one("SELECT * FROM orders WHERE id=$1", uuid.UUID(order_id))
    if not row:
        raise HTTPException(status_code=404, detail="سفارش یافت نشد")
    if row["user_id"] != user_id and payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="دسترسی ندارید")
    if row["status"] not in ("pending", "confirming"):
        raise HTTPException(status_code=400, detail="این سفارش قابل ویرایش نیست")
    if row["expires_at"] and row["expires_at"] < datetime.utcnow():
        await execute("UPDATE orders SET status='expired' WHERE id=$1", uuid.UUID(order_id))
        raise HTTPException(status_code=400, detail="مهلت پرداخت منقضی شده")
    await execute(
        "UPDATE orders SET tx_hash=$1, screenshot_file_id=$2, status='confirming' WHERE id=$3",
        data.tx_hash, data.screenshot_file_id, uuid.UUID(order_id)
    )
    return {"success": True, "status": "confirming"}

@router.post("/{order_id}/confirm")
async def confirm_order(order_id: str, admin=Depends(get_current_admin)):
    row = await fetch_one("SELECT * FROM orders WHERE id=$1", uuid.UUID(order_id))
    if not row:
        raise HTTPException(status_code=404, detail="سفارش یافت نشد")
    if row["status"] != "confirming":
        raise HTTPException(status_code=400, detail="فقط سفارش‌های در حال بررسی قابل تأیید هستند")
    await execute(
        "UPDATE orders SET status='confirmed', confirmed_at=NOW() WHERE id=$1",
        uuid.UUID(order_id)
    )
    # شارژ موجودی کاربر
    await execute(
        "UPDATE users SET balance=balance+$1, total_spent=total_spent+$1 WHERE id=$2",
        row["amount"], row["user_id"]
    )
    return {"success": True}

@router.post("/{order_id}/reject")
async def reject_order(order_id: str, data: AdminNote, admin=Depends(get_current_admin)):
    row = await fetch_one("SELECT status FROM orders WHERE id=$1", uuid.UUID(order_id))
    if not row:
        raise HTTPException(status_code=404, detail="سفارش یافت نشد")
    if row["status"] not in ("pending", "confirming"):
        raise HTTPException(status_code=400, detail="این سفارش قابل رد نیست")
    await execute(
        "UPDATE orders SET status='rejected', admin_note=$1 WHERE id=$2",
        data.admin_note, uuid.UUID(order_id)
    )
    return {"success": True}

@router.get("/")
async def list_orders(
    status: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    payload = verify_token(credentials.credentials)
    is_admin = payload.get("role") == "admin"
    user_id = payload.get("user_id")

    conditions = []
    params = []
    idx = 1

    if not is_admin:
        conditions.append(f"o.user_id=${idx}")
        params.append(user_id)
        idx += 1
    if status:
        conditions.append(f"o.status=${idx}")
        params.append(status)
        idx += 1

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    params.append(limit)
    rows = await fetch_all(
        f"SELECT o.id, o.user_id, u.username, u.full_name, o.amount, o.currency, "
        f"o.amount_crypto, o.tx_hash, o.status, o.admin_note, o.created_at, o.confirmed_at "
        f"FROM orders o LEFT JOIN users u ON o.user_id=u.id "
        f"{where} ORDER BY o.created_at DESC LIMIT ${idx}",
        *params
    )
    return [dict(r) for r in rows]
