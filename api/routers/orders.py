from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional
import uuid
from datetime import datetime, timedelta
from core.database import fetch_all, fetch_one, execute, fetch_val
from core.security import verify_token

router = APIRouter()
security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    return verify_token(credentials.credentials)

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

# ── نرخ ارز از دیتابیس ────────────────────────────────────
async def get_rate(currency: str) -> float:
    key_map = {
        "USDT_TRC20": "usdt_rate",
        "TON":        "ton_rate",
        "TRX":        "trx_rate",
    }
    key = key_map.get(currency.upper())
    if not key:
        raise HTTPException(status_code=400, detail=f"ارز {currency} پشتیبانی نمی‌شود")
    try:
        row = await fetch_one("SELECT value FROM settings WHERE key=$1", key)
        rate = float(row["value"]) if row and row["value"] else 0.0
    except Exception:
        rate = 0.0
    # FIX: rate=0 → خطا
    if rate <= 0:
        raise HTTPException(status_code=500, detail=f"نرخ تبدیل {currency} تنظیم نشده است")
    return rate

async def get_wallet(currency: str) -> str:
    key_map = {
        "USDT_TRC20": "usdt_wallet",
        "TON":        "ton_wallet",
        "TRX":        "trx_wallet",
    }
    key = key_map.get(currency.upper(), "")
    row = await fetch_one("SELECT value FROM settings WHERE key=$1", key)
    if not row or not row["value"]:
        raise HTTPException(status_code=500, detail=f"آدرس کیف پول {currency} تنظیم نشده است")
    return row["value"]

# ── Models ─────────────────────────────────────────────────
class OrderCreate(BaseModel):
    amount_usd: float
    currency: str
    discount_code: Optional[str] = None

class OrderSubmit(BaseModel):
    tx_hash: Optional[str] = None
    screenshot_file_id: Optional[str] = None

class RejectData(BaseModel):
    admin_note: str = ""

# ── ایجاد سفارش (کاربر) ───────────────────────────────────
@router.post("/")
async def create_order(data: OrderCreate, user=Depends(get_current_user)):
    user_id = user.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="احراز هویت لازم است")

    # حداقل مبلغ
    min_row = await fetch_one("SELECT value FROM settings WHERE key='min_deposit_usd'")
    # FIX: NULL check
    min_usd = float(min_row["value"]) if min_row and min_row["value"] is not None else 5.0
    if data.amount_usd < min_usd:
        raise HTTPException(status_code=400, detail=f"حداقل مبلغ ${min_usd} است")

    # تخفیف
    discount_amount = 0.0
    if data.discount_code:
        disc = await fetch_one(
            "SELECT id, type, value, max_uses, used_count FROM discounts "
            "WHERE code=$1 AND is_active=TRUE AND (expires_at IS NULL OR expires_at > NOW())",
            data.discount_code.upper()
        )
        if not disc:
            raise HTTPException(status_code=400, detail="کد تخفیف نامعتبر یا منقضی است")
        if disc["max_uses"] and disc["used_count"] >= disc["max_uses"]:
            raise HTTPException(status_code=400, detail="ظرفیت کد تخفیف تمام شده است")
        if disc["type"] == "percent":
            discount_amount = round(data.amount_usd * float(disc["value"]) / 100, 2)
        else:
            discount_amount = min(float(disc["value"]), data.amount_usd)
        await execute("UPDATE discounts SET used_count=used_count+1 WHERE id=$1", disc["id"])

    final_usd = max(0.0, data.amount_usd - discount_amount)

    # نرخ و آدرس
    rate   = await get_rate(data.currency)
    wallet = await get_wallet(data.currency)
    amount_crypto = round(final_usd / rate, 8)

    # انقضا
    expire_row = await fetch_one("SELECT value FROM settings WHERE key='order_expire_minutes'")
    expire_mins = int(expire_row["value"]) if expire_row and expire_row["value"] else 60
    expires_at = datetime.utcnow() + timedelta(minutes=expire_mins)

    order_id = str(uuid.uuid4())
    await execute(
        """INSERT INTO orders
           (id, user_id, amount, currency, amount_crypto, wallet_address,
            discount_code, discount_amount, status, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9)""",
        order_id, user_id, final_usd, data.currency.upper(),
        amount_crypto, wallet,
        data.discount_code.upper() if data.discount_code else None,
        discount_amount, expires_at
    )
    return {
        "order_id":      order_id,
        "amount_usd":    final_usd,
        "amount_crypto": amount_crypto,
        "currency":      data.currency.upper(),
        "wallet":        wallet,
        "expires_at":    expires_at.isoformat(),
    }

# ── ارسال رسید (کاربر) ────────────────────────────────────
@router.post("/{order_id}/submit")
async def submit_order(
    order_id: str,
    data: OrderSubmit,
    screenshot_file_id: Optional[str] = Query(None),
    user=Depends(get_current_user)
):
    uid     = parse_uuid(order_id, "شناسه سفارش")
    user_id = user.get("user_id")
    row = await fetch_one("SELECT id, user_id, status FROM orders WHERE id=$1", uid)
    if not row:
        raise HTTPException(status_code=404, detail="سفارش یافت نشد")
    if row["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="دسترسی ندارید")
    if row["status"] not in ("pending", "confirming"):
        raise HTTPException(status_code=400, detail="این سفارش قابل ویرایش نیست")

    # FIX: حداقل یکی از tx_hash یا screenshot لازمه
    tx   = data.tx_hash or None
    shot = data.screenshot_file_id or screenshot_file_id or None
    if not tx and not shot:
        raise HTTPException(status_code=400, detail="هش تراکنش یا تصویر رسید الزامی است")

    await execute(
        "UPDATE orders SET tx_hash=$1, screenshot_file_id=$2, status='confirming' WHERE id=$3",
        tx, shot, uid
    )
    return {"success": True}

# ── لیست سفارشات ──────────────────────────────────────────
@router.get("/")
async def list_orders(
    status: Optional[str] = None,
    limit:  int = Query(50, ge=1, le=200),
    page:   int = Query(1, ge=1),
    user=Depends(get_current_user)
):
    offset = (page - 1) * limit
    role    = user.get("role")
    user_id = user.get("user_id")

    conditions, params = [], []

    if role != "admin":
        params.append(user_id)
        conditions.append(f"o.user_id=${len(params)}")

    if status:
        params.append(status)
        conditions.append(f"o.status=${len(params)}")

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    # FIX: pagination offset
    params.extend([limit, offset])
    rows = await fetch_all(
        f"""SELECT o.id, o.user_id, u.username, u.full_name,
               o.amount, o.currency, o.amount_crypto, o.wallet_address,
               o.tx_hash, o.screenshot_file_id, o.discount_code, o.discount_amount,
               o.status, o.admin_note, o.confirmed_at, o.expires_at, o.created_at
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            {where}
            ORDER BY o.created_at DESC
            LIMIT ${len(params)-1} OFFSET ${len(params)}""",
        *params
    )
    return [dict(r) for r in rows]

@router.get("/{order_id}")
async def get_order(order_id: str, user=Depends(get_current_user)):
    uid = parse_uuid(order_id, "شناسه سفارش")
    row = await fetch_one(
        """SELECT o.*, u.username, u.full_name FROM orders o
           LEFT JOIN users u ON o.user_id=u.id WHERE o.id=$1""", uid
    )
    if not row:
        raise HTTPException(status_code=404, detail="سفارش یافت نشد")
    if user.get("role") != "admin" and row["user_id"] != user.get("user_id"):
        raise HTTPException(status_code=403, detail="دسترسی ندارید")
    return dict(row)

# ── تأیید سفارش (ادمین) ───────────────────────────────────
@router.post("/{order_id}/confirm")
async def confirm_order(order_id: str, admin=Depends(get_current_admin)):
    uid = parse_uuid(order_id, "شناسه سفارش")
    row = await fetch_one("SELECT id, user_id, amount, status FROM orders WHERE id=$1", uid)
    if not row:
        raise HTTPException(status_code=404, detail="سفارش یافت نشد")
    if row["status"] == "confirmed":
        raise HTTPException(status_code=400, detail="این سفارش قبلاً تأیید شده است")
    if row["status"] not in ("pending", "confirming"):
        raise HTTPException(status_code=400, detail=f"سفارش در وضعیت {row['status']} قابل تأیید نیست")

    await execute(
        "UPDATE orders SET status='confirmed', confirmed_by=$1, confirmed_at=NOW() WHERE id=$2",
        admin.get("user_id", 0), uid
    )
    # شارژ موجودی کاربر + total_spent
    await execute(
        "UPDATE users SET balance=balance+$1, total_spent=total_spent+$1, updated_at=NOW() WHERE id=$2",
        float(row["amount"]), row["user_id"]
    )
    new_balance = await fetch_val("SELECT balance FROM users WHERE id=$1", row["user_id"])
    return {"success": True, "new_balance": float(new_balance or 0)}

# ── رد سفارش (ادمین) ──────────────────────────────────────
@router.post("/{order_id}/reject")
async def reject_order(order_id: str, data: RejectData, admin=Depends(get_current_admin)):
    uid = parse_uuid(order_id, "شناسه سفارش")
    row = await fetch_one("SELECT id, status FROM orders WHERE id=$1", uid)
    if not row:
        raise HTTPException(status_code=404, detail="سفارش یافت نشد")
    if row["status"] in ("confirmed", "rejected"):
        raise HTTPException(status_code=400, detail=f"سفارش در وضعیت {row['status']} است")
    await execute(
        "UPDATE orders SET status='rejected', admin_note=$1, confirmed_at=NOW() WHERE id=$2",
        data.admin_note, uid
    )
    return {"success": True}
