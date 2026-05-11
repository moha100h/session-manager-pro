import os
import jwt
import hashlib
import hmac
from datetime import datetime, timedelta
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import base64
import secrets

JWT_SECRET = os.getenv("JWT_SECRET", "change-this")
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", "change-this-32ch").encode()[:32]

def create_access_token(data: dict, expires_delta: timedelta = timedelta(hours=24)):
    to_encode = data.copy()
    to_encode["exp"] = datetime.utcnow() + expires_delta
    return jwt.encode(to_encode, JWT_SECRET, algorithm="HS256")

def verify_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise ValueError("Token expired")
    except jwt.InvalidTokenError:
        raise ValueError("Invalid token")

def encrypt_session(data: str) -> str:
    """AES-256-GCM encryption for session data"""
    key = ENCRYPTION_KEY.ljust(32)[:32]
    aesgcm = AESGCM(key)
    nonce = secrets.token_bytes(12)
    ct = aesgcm.encrypt(nonce, data.encode(), None)
    return base64.b64encode(nonce + ct).decode()

def decrypt_session(encrypted: str) -> str:
    """Decrypt AES-256-GCM session data"""
    key = ENCRYPTION_KEY.ljust(32)[:32]
    aesgcm = AESGCM(key)
    raw = base64.b64decode(encrypted)
    nonce, ct = raw[:12], raw[12:]
    return aesgcm.decrypt(nonce, ct, None).decode()

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100000)
    return f"{salt}:{h.hex()}"

def verify_password(password: str, hashed: str) -> bool:
    try:
        salt, h = hashed.split(":")
        new_h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100000)
        return hmac.compare_digest(h, new_h.hex())
    except:
        return False

async def verify_api_key(api_key: str) -> bool:
    return api_key == os.getenv("API_INTERNAL_KEY", "")
