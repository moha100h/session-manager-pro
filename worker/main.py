import asyncio
import os
import json
import logging
import random
from datetime import datetime, timedelta

import asyncpg
import aioredis
from telethon import TelegramClient, errors
from telethon.sessions import StringSession
from telethon.tl.functions.channels import JoinChannelRequest, LeaveChannelRequest
from telethon.tl.functions.messages import ImportChatInviteRequest
from telethon.tl.types import Channel, Chat

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("worker")

DATABASE_URL = os.getenv("DATABASE_URL", "")
REDIS_URL    = os.getenv("REDIS_URL", "redis://redis:6379")
API_ID       = int(os.getenv("API_ID", "0"))
API_HASH     = os.getenv("API_HASH", "")

# ── کلید رمزنگاری — باید با api/core/security.py یکسان باشد ──
_raw_key = os.getenv("ENCRYPTION_KEY", "")
ENCRYPTION_KEY = (_raw_key.encode()[:32]).ljust(32, b"0")

# ─── رمزگشایی سشن ────────────────────────────────────────────
def decrypt_session(encrypted: str) -> str:
    import base64
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    raw = base64.b64decode(encrypted)
    if len(raw) < 13:
        raise ValueError("ciphertext too short")
    nonce, ct = raw[:12], raw[12:]
    return AESGCM(ENCRYPTION_KEY).decrypt(nonce, ct, None).decode("utf-8")

# ─── Pool / Redis ─────────────────────────────────────────────
_pool  = None
_redis = None

async def get_pool():
    global _pool
    if not _pool:
        _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10, statement_cache_size=0)
    return _pool

async def get_redis():
    global _redis
    if not _redis:
        _redis = await aioredis.from_url(REDIS_URL, encoding="utf-8", decode_responses=True)
        await _redis.ping()
    return _redis

# ─── پروکسی رندوم ────────────────────────────────────────────
async def get_random_proxy():
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, host, port, proxy_type, username, password "
            "FROM proxies WHERE is_active=TRUE ORDER BY RANDOM() LIMIT 1"
        )
    return dict(row) if row else None

def build_proxy(proxy_row: dict):
    if not proxy_row:
        return None
    try:
        import socks
        type_map = {"socks5": socks.SOCKS5, "socks4": socks.SOCKS4, "http": socks.HTTP}
        ptype = type_map.get(proxy_row.get("proxy_type", "socks5").lower(), socks.SOCKS5)
        return (ptype, proxy_row["host"], proxy_row["port"],
                True, proxy_row.get("username"), proxy_row.get("password"))
    except ImportError:
        logger.warning("PySocks not installed — running without proxy")
        return None

# ─── helpers دیتابیس ─────────────────────────────────────────
async def log_event(session_id: str, event: str, details: dict = None):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO session_logs (session_id, event, details) VALUES ($1,$2,$3)",
            session_id, event, json.dumps(details or {})
        )

async def set_session_status(session_id: str, status: str, flood_until=None):
    pool = await get_pool()
    async with pool.acquire() as conn:
        if flood_until:
            await conn.execute(
                "UPDATE sessions SET status=$1, flood_until=$2, updated_at=NOW() WHERE id=$3",
                status, flood_until, session_id
            )
        else:
            await conn.execute(
                "UPDATE sessions SET status=$1, flood_until=NULL, updated_at=NOW() WHERE id=$2",
                status, session_id
            )

async def mark_task_session(task_id: str, session_id: str, status: str, error: str = None):
    pool = await get_pool()
    async with pool.acquire() as conn:
        if status == "joined":
            await conn.execute(
                """INSERT INTO task_sessions (task_id, session_id, status, joined_at)
                   VALUES ($1,$2,'joined',NOW())
                   ON CONFLICT (task_id, session_id)
                   DO UPDATE SET status='joined', joined_at=NOW()""",
                task_id, session_id
            )
            await conn.execute(
                "UPDATE tasks SET sessions_done=sessions_done+1 WHERE id=$1", task_id
            )
        else:
            await conn.execute(
                """INSERT INTO task_sessions (task_id, session_id, status, error)
                   VALUES ($1,$2,'failed',$3)
                   ON CONFLICT (task_id, session_id)
                   DO UPDATE SET status='failed', error=$3""",
                task_id, session_id, error
            )
            await conn.execute(
                "UPDATE tasks SET sessions_failed=sessions_failed+1 WHERE id=$1", task_id
            )

# ─── join یک سشن ─────────────────────────────────────────────
async def join_one(session_row: dict, task: dict) -> bool:
    session_id = str(session_row["id"])
    task_id    = task["task_id"]
    target     = task["target"]

    # رمزگشایی
    try:
        session_str = decrypt_session(session_row["session_data"])
    except Exception as e:
        logger.error(f"Decrypt failed for {session_row['phone']}: {e}")
        await set_session_status(session_id, "error")
        await mark_task_session(task_id, session_id, "failed", f"decrypt_error: {e}")
        return False

    api_id   = session_row.get("api_id") or API_ID
    api_hash = session_row.get("api_hash") or API_HASH
    if not api_id or not api_hash:
        await mark_task_session(task_id, session_id, "failed", "no_api_credentials")
        return False

    proxy = build_proxy(await get_random_proxy())

    client = TelegramClient(
        StringSession(session_str),
        api_id, api_hash,
        proxy=proxy,
        connection_retries=2,
        timeout=30,
        request_retries=2,
        auto_reconnect=True,
    )

    try:
        await client.connect()

        if not await client.is_user_authorized():
            logger.warning(f"Session logged out: {session_row['phone']}")
            await set_session_status(session_id, "logged_out")
            await mark_task_session(task_id, session_id, "failed", "logged_out")
            await log_event(session_id, "logged_out", {"task_id": task_id})
            return False

        # ── join: لینک دعوت یا username/id ──────────────────
        target_clean = target.strip()
        if "t.me/+" in target_clean or "t.me/joinchat/" in target_clean:
            # لینک دعوت خصوصی
            invite_hash = target_clean.split("/")[-1].lstrip("+")
            await client(ImportChatInviteRequest(invite_hash))
        else:
            # username یا لینک عمومی
            username = target_clean.replace("https://t.me/", "").replace("@", "").strip("/")
            entity = await client.get_entity(username)
            await client(JoinChannelRequest(entity))

        await set_session_status(session_id, "active")
        await mark_task_session(task_id, session_id, "joined")
        await log_event(session_id, "joined", {"target": target, "task_id": task_id})

        # ── خروج خودکار ──────────────────────────────────────
        auto_leave = task.get("auto_leave_after")
        if auto_leave and isinstance(auto_leave, (int, float)) and auto_leave > 0:
            await asyncio.sleep(auto_leave * 60)
            try:
                username = target_clean.replace("https://t.me/", "").replace("@", "").strip("/")
                entity = await client.get_entity(username)
                await client(LeaveChannelRequest(entity))
                await log_event(session_id, "left", {"target": target, "task_id": task_id})
            except Exception as e:
                logger.debug(f"Auto-leave failed for {session_row['phone']}: {e}")

        return True

    except errors.FloodWaitError as e:
        flood_until = datetime.utcnow() + timedelta(seconds=e.seconds)
        logger.warning(f"FloodWait {e.seconds}s — {session_row['phone']}")
        await set_session_status(session_id, "flood", flood_until)
        await mark_task_session(task_id, session_id, "failed", f"flood_wait_{e.seconds}s")
        await log_event(session_id, "flood", {"wait": e.seconds})
        return False

    except errors.UserBannedInChannelError:
        await set_session_status(session_id, "banned")
        await mark_task_session(task_id, session_id, "failed", "banned_in_channel")
        return False

    except errors.ChannelPrivateError:
        await mark_task_session(task_id, session_id, "failed", "channel_private")
        return False

    except (errors.UserDeactivatedBanError, errors.UserDeactivatedError):
        await set_session_status(session_id, "deleted")
        await mark_task_session(task_id, session_id, "failed", "account_deleted")
        await log_event(session_id, "deleted", {})
        return False

    except errors.PhoneNumberBannedError:
        await set_session_status(session_id, "banned")
        await mark_task_session(task_id, session_id, "failed", "phone_banned")
        return False

    except errors.InviteHashExpiredError:
        await mark_task_session(task_id, session_id, "failed", "invite_hash_expired")
        return False

    except errors.InviteHashInvalidError:
        await mark_task_session(task_id, session_id, "failed", "invite_hash_invalid")
        return False

    except Exception as e:
        err = str(e)[:200]
        logger.error(f"Join error {session_row['phone']}: {err}")
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "UPDATE sessions SET error_count=error_count+1, updated_at=NOW() "
                "WHERE id=$1 RETURNING error_count",
                session_id
            )
            if row and row["error_count"] >= 5:
                await conn.execute("UPDATE sessions SET status='error' WHERE id=$1", session_id)
        await mark_task_session(task_id, session_id, "failed", err)
        return False

    finally:
        try:
            await client.disconnect()
        except Exception:
            pass

# ─── پردازش تسک ──────────────────────────────────────────────
async def process_task(task: dict):
    task_id = task["task_id"]
    pool    = await get_pool()

    logger.info(f"Task {task_id[:8]} — target: {task['target']} — count: {task['session_count']}")

    async with pool.acquire() as conn:
        updated = await conn.execute(
            "UPDATE tasks SET status='running', started_at=NOW() "
            "WHERE id=$1 AND status IN ('pending','paused')",
            task_id
        )
        if "UPDATE 0" in updated:
            logger.warning(f"Task {task_id[:8]} not in pending/paused state, skipping")
            return

    async with pool.acquire() as conn:
        sessions = await conn.fetch(
            "SELECT id, phone, session_data, api_id, api_hash "
            "FROM sessions WHERE status='active' "
            "ORDER BY RANDOM() LIMIT $1",
            task["session_count"]
        )

    if not sessions:
        async with pool.acquire() as conn:
            await conn.execute("UPDATE tasks SET status='failed' WHERE id=$1", task_id)
        logger.warning(f"Task {task_id[:8]}: no active sessions")
        return

    delay_min = max(1, task.get("join_delay_min", 3))
    delay_max = max(delay_min, task.get("join_delay_max", 8))
    success = failed = 0

    for s in sessions:
        # بررسی لغو/توقف
        async with pool.acquire() as conn:
            st = await conn.fetchrow("SELECT status FROM tasks WHERE id=$1", task_id)
        if st and st["status"] in ("cancelled", "paused"):
            logger.info(f"Task {task_id[:8]} {st['status']}, stopping")
            break

        ok = await join_one(dict(s), task)
        if ok:
            success += 1
        else:
            failed += 1

        await asyncio.sleep(random.uniform(delay_min, delay_max))

    async with pool.acquire() as conn:
        st = await conn.fetchrow("SELECT status FROM tasks WHERE id=$1", task_id)
        if st and st["status"] == "running":
            final = "completed" if success > 0 else "failed"
            await conn.execute(
                "UPDATE tasks SET status=$1, completed_at=NOW() WHERE id=$2",
                final, task_id
            )

    logger.info(f"Task {task_id[:8]} done — ✅{success} ❌{failed}")

# ─── health check ─────────────────────────────────────────────
async def health_check():
    pool = await get_pool()
    logger.info("Running session health check...")
    async with pool.acquire() as conn:
        # رفع flood منقضی‌شده
        await conn.execute(
            "UPDATE sessions SET status='active', flood_until=NULL "
            "WHERE status='flood' AND flood_until IS NOT NULL AND flood_until < NOW()"
        )
        sessions = await conn.fetch(
            "SELECT id, phone, session_data, api_id, api_hash FROM sessions "
            "WHERE status='active' "
            "AND (last_checked IS NULL OR last_checked < NOW() - INTERVAL '30 minutes') "
            "LIMIT 30"
        )

    checked = 0
    for s in sessions:
        try:
            session_str = decrypt_session(s["session_data"])
            api_id   = s.get("api_id") or API_ID
            api_hash = s.get("api_hash") or API_HASH
            if not api_id or not api_hash:
                continue
            client = TelegramClient(
                StringSession(session_str), api_id, api_hash,
                connection_retries=1, timeout=15
            )
            await client.connect()
            is_auth = await client.is_user_authorized()
            await client.disconnect()
            pool2 = await get_pool()
            async with pool2.acquire() as conn:
                if is_auth:
                    await conn.execute(
                        "UPDATE sessions SET last_checked=NOW() WHERE id=$1", str(s["id"])
                    )
                else:
                    await conn.execute(
                        "UPDATE sessions SET status='logged_out', last_checked=NOW() WHERE id=$1",
                        str(s["id"])
                    )
            checked += 1
            await asyncio.sleep(2)
        except errors.FloodWaitError as e:
            await asyncio.sleep(min(e.seconds, 60))
        except Exception as e:
            logger.debug(f"Health check {s['phone']}: {e}")

    logger.info(f"Health check done — {checked} sessions checked")

# ─── حلقه‌های اصلی ────────────────────────────────────────────
async def task_loop():
    redis = await get_redis()
    logger.info("Task worker ready, waiting for jobs...")
    while True:
        try:
            item = await redis.brpop("tasks:join", timeout=5)
            if not item:
                continue
            _, raw = item
            task = json.loads(raw)
            await process_task(task)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Task loop error: {e}")
            await asyncio.sleep(5)

async def health_loop():
    interval = int(os.getenv("CHECK_INTERVAL_MINUTES", "30")) * 60
    await asyncio.sleep(60)   # صبر اولیه
    while True:
        try:
            await health_check()
        except Exception as e:
            logger.error(f"Health loop error: {e}")
        await asyncio.sleep(interval)

async def main():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not set")
    if not API_ID or not API_HASH:
        logger.warning("⚠️  API_ID / API_HASH not set — sessions without custom credentials will fail")
    logger.info("🚀 Worker starting...")
    await get_pool()
    await get_redis()
    await asyncio.gather(task_loop(), health_loop())

if __name__ == "__main__":
    asyncio.run(main())
