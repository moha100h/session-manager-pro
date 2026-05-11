from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional
import uuid, os
from core.database import fetch_all, fetch_one, execute
from core.security import verify_token

router = APIRouter()
security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    return verify_token(credentials.credentials)

def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = verify_token(credentials.credentials)
    if not payload.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return payload

WALLETS = {
    "USDT_TRC20": os.getenv("USDT_TRC20_WALLET", ""),
    "TON": os.getenv("TON_WALLET", ""),
    "TRX": os.getenv("TRX_WALLET", ""),
}
RATES = {"USDT_TRC20": 1.0, "TON": 5.0, "TRX": 0.08}

class OrderCreate(BaseModel):
    amount_usd: float
    currency: str
    discount_code: Optional[str] = None

class OrderConfirm(BaseModel):
    tx_hash: Optional[str] = None
    screenshot_file_id: Optional[str] = None

class AdminConfirm(BaseModel):
    action: str  # confirm / reject
    note: Optional[str] = None

@router.post("")
async def create_order(data: OrderCreate, user=Depends(get_current_user)):
    if data.currency not in WALLETS:
        raise HTTPException(status_code=400, detail="Invalid currency")
    min_deposit = float((await fetch_one("SELECT value FROM settings WHERE key = 'min_deposit_usd'"))["value"])
    if data.amount_usd < min_deposit:
        raise HTTPException(status_code=400, detail=f"Minimum deposit is ${min_deposit}")

    final_amount = data.amount_usd
    if data.discount_code:
        discount = await fetch_one(
            "SELECT * FROM discounts WHERE code = $1 AND is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW()) AND (max_uses IS NULL OR used_count < max_uses)",
            data.discount_code
        )
        if discount:
            if discount["type"] == "percent":
                final_amount = data.amount_usd * (1 - discount["value"] / 100)
            else:
                final_amount = max(0, data.amount_usd - discount["value"])
            await execute("UPDATE discounts SET used_count = used_count + 1 WHERE id = $1", discount["id"])

    rate = RATES.get(data.currency, 1.0)
    amount_crypto = final_amount / rate
    row = await fetch_one(
        """INSERT INTO orders (user_id, amount, currency, amount_crypto, wallet_address)
           VALUES ($1,$2,$3,$4,$5) RETURNING id""",
        user.get("user_id"), final_amount, data.currency, amount_crypto, WALLETS[data.currency]
    )
    return {
        "order_id": str(row["id"]),
        "amount_usd": final_amount,
        "amount_crypto": amount_crypto,
        "currency": data.currency,
        "wallet": WALLETS[data.currency],
        "expires_in_minutes": 120
    }

@router.post("/{order_id}/submit")
async def submit_payment(order_id: str, data: OrderConfirm, user=Depends(get_current_user)):
    order = await fetch_one("SELECT * FROM orders WHERE id = $1 AND user_id = $2", uuid.UUID(order_id), user.get("user_id"))
    if not order: raise HTTPException(status_code=404, detail="Order not found")
    if order["status"] != "pending": raise HTTPException(status_code=400, detail="Order already processed")
    await execute(
        "UPDATE orders SET tx_hash = $1, screenshot_file_id = $2, status = 'confirming' WHERE id = $3",
        data.tx_hash, data.screenshot_file_id, uuid.UUID(order_id)
    )
    return {"success": True, "message": "Payment submitted, waiting for admin confirmation"}

@router.post("/{order_id}/admin-action")
async def admin_action(order_id: str, data: AdminConfirm, admin=Depends(get_current_admin)):
    order = await fetch_one("SELECT * FROM orders WHERE id = $1", uuid.UUID(order_id))
    if not order: raise HTTPException(status_code=404, detail="Order not found")
    if data.action == "confirm":
        await execute(
            "UPDATE orders SET status = 'confirmed', admin_note = $1, confirmed_by = $2, confirmed_at = NOW() WHERE id = $3",
            data.note, admin.get("user_id"), uuid.UUID(order_id)
        )
        await execute("UPDATE users SET balance = balance + $1 WHERE id = $2", order["amount"], order["user_id"])
        return {"success": True, "message": f"Order confirmed, ${order['amount']} added to user balance"}
    elif data.action == "reject":
        await execute("UPDATE orders SET status = 'rejected', admin_note = $1 WHERE id = $2", data.note, uuid.UUID(order_id))
        return {"success": True, "message": "Order rejected"}
    raise HTTPException(status_code=400, detail="Invalid action")

@router.get("")
async def list_orders(status: Optional[str] = None, page: int = 1, limit: int = 20, user=Depends(get_current_user)):
    offset = (page - 1) * limit
    is_admin = user.get("is_admin", False)
    params = [] if is_admin else [user.get("user_id")]
    where = "WHERE 1=1" if is_admin else "WHERE user_id = $1"
    i = len(params) + 1
    if status:
        where += f" AND status = ${i}"; params.append(status); i+=1
    rows = await fetch_all(f"SELECT * FROM orders {where} ORDER BY created_at DESC LIMIT ${i} OFFSET ${i+1}", *params, limit, offset)
    return [dict(r) for r in rows]
