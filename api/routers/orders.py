from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional
import uuid
from datetime import datetime, timedelta
from core.database import fetch_all, fetch_one, execute
from core.security import verify_token
import os

router = APIRouter()
security = HTTPBearer()

WALLETS = {
    "USDT_TRC20": os.getenv("USDT_TRC20_WALLET", ""),
    "TON": os.getenv("TON_WALLET", ""),
    "TRX": os.getenv("TRX_WALLET", "")
}

RATES = {"USDT_TRC20": 1.0, "TON": 0.2, "TRX": 12.5}

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    return verify_token(credentials.credentials)

def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = verify_token(credentials.credentials)
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return payload

class OrderCreate(BaseModel):
    amount_usd: float
    currency: str

class OrderConfirm(BaseModel):
    tx_hash: Optional[str] = None
    admin_note: Optional[str] = None

class OrderReject(BaseModel):
    admin_note: str

@router.post("/")
async def create_order(data: OrderCreate, user=Depends(get_current_user)):
    if data.currency not in WALLETS:
        raise HTTPException(status_code=400, detail="Invalid currency")
    min_deposit = float((await fetch_one("SELECT value FROM settings WHERE key='min_deposit_usd'"))["value"])
    if data.amount_usd < min_deposit:
        raise HTTPException(status_code=400, detail=f"Minimum deposit is ${min_deposit}")
    rate = RATES.get(data.currency, 1.0)
    amount_crypto = data.amount_usd * rate
    order_id = str(uuid.uuid4())
    expires = datetime.utcnow() + timedelta(hours=2)
    await execute(
        """INSERT INTO orders (id, user_id, amount, currency, amount_crypto, wallet_address, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7)""",
        order_id, user.get("user_id"), data.amount_usd,
        data.currency, amount_crypto, WALLETS[data.currency], expires
    )
    return {
        "order_id": order_id,
        "amount_usd": data.amount_usd,
        "amount_crypto": amount_crypto,
        "currency": data.currency,
        "wallet": WALLETS[data.currency],
        "expires_at": expires.isoformat()
    }

@router.post("/{order_id}/submit")
async def submit_payment(order_id: str, tx_hash: Optional[str] = None, screenshot_file_id: Optional[str] = None, user=Depends(get_current_user)):
    order = await fetch_one("SELECT * FROM orders WHERE id=$1 AND user_id=$2", uuid.UUID(order_id), user.get("user_id"))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order["status"] != "pending":
        raise HTTPException(status_code=400, detail="Order already processed")
    await execute(
        "UPDATE orders SET tx_hash=$1, screenshot_file_id=$2, status='confirming' WHERE id=$3",
        tx_hash, screenshot_file_id, uuid.UUID(order_id)
    )
    return {"success": True, "message": "Payment submitted, waiting for admin confirmation"}

@router.post("/{order_id}/confirm")
async def confirm_order(order_id: str, data: OrderConfirm, admin=Depends(get_current_admin)):
    order = await fetch_one("SELECT * FROM orders WHERE id=$1", uuid.UUID(order_id))
    if not order or order["status"] not in ("pending", "confirming"):
        raise HTTPException(status_code=400, detail="Cannot confirm this order")
    await execute(
        "UPDATE orders SET status='confirmed', tx_hash=COALESCE($1,tx_hash), admin_note=$2, confirmed_by=$3, confirmed_at=NOW() WHERE id=$4",
        data.tx_hash, data.admin_note, admin.get("user_id"), uuid.UUID(order_id)
    )
    await execute("UPDATE users SET balance=balance+$1 WHERE id=$2", order["amount"], order["user_id"])
    return {"success": True}

@router.post("/{order_id}/reject")
async def reject_order(order_id: str, data: OrderReject, admin=Depends(get_current_admin)):
    await execute(
        "UPDATE orders SET status='rejected', admin_note=$1, confirmed_by=$2 WHERE id=$3",
        data.admin_note, admin.get("user_id"), uuid.UUID(order_id)
    )
    return {"success": True}

@router.get("/")
async def list_orders(status: Optional[str] = None, page: int = 1, limit: int = 20, admin=Depends(get_current_admin)):
    offset = (page - 1) * limit
    where = "WHERE o.status=$1" if status else ""
    params = [status, limit, offset] if status else [limit, offset]
    i = 2 if status else 1
    rows = await fetch_all(
        f"""SELECT o.*, u.username, u.full_name FROM orders o
            LEFT JOIN users u ON o.user_id=u.id
            {where} ORDER BY o.created_at DESC LIMIT ${i} OFFSET ${i+1}""",
        *params
    )
    return [dict(r) for r in rows]
