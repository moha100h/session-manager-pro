import os
import jwt
import base64
import secrets
from datetime import datetime, timedelta
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import HTTPException

JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "720"))

# ── کلید رمزنگاری — باید دقیقاً 32 بایت باشد ──────────────────
_raw_key = os.getenv("ENCRYPTION_KEY", "")
if not _raw_key:
    raise RuntimeError("ENCRYPTION_KEY is not set in environment variables")
# pad یا truncate به 32 بایت
ENCRYPTION_KEY = (_raw_key.encode()[:32]).ljust(32, b"0")

# ── JWT ────────────────────────────────────────────────────────
def create_access_token(data: dict) -> str:
    payload = {
        **data,
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="توکن منقضی شده")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="توکن نامعتبر")

# ── رمزنگاری سشن با AES-256-GCM ───────────────────────────────
def encrypt_session(session_string: str) -> str:
    try:
        aesgcm = AESGCM(ENCRYPTION_KEY)
        nonce = secrets.token_bytes(12)
        ct = aesgcm.encrypt(nonce, session_string.encode("utf-8"), None)
        return base64.b64encode(nonce + ct).decode("utf-8")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"خطا در رمزنگاری سشن: {e}")

def decrypt_session(encrypted: str) -> str:
    try:
        aesgcm = AESGCM(ENCRYPTION_KEY)
        raw = base64.b64decode(encrypted)
        if len(raw) < 13:
            raise ValueError("ciphertext too short")
        nonce, ct = raw[:12], raw[12:]
        return aesgcm.decrypt(nonce, ct, None).decode("utf-8")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"خطا در رمزگشایی سشن: {e}")

# ── رمز عبور — bcrypt ──────────────────────────────────────────
def hash_password(password: str) -> str:
    import hashlib, hmac
    # استفاده از PBKDF2 (بدون نیاز به کتابخانه اضافه)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), JWT_SECRET.encode(), 260000)
    return dk.hex()

def verify_password(password: str, hashed: str) -> bool:
    return hmac.compare_digest(hash_password(password), hashed)
