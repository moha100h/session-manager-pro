import asyncio
import os
import json
import logging
import random
import re
from datetime import datetime, timedelta

import asyncpg
import aioredis
from telethon import TelegramClient, errors
from telethon.sessions import StringSession
from telethon.network.connection import ConnectionTcpMTProxyRandomizedIntermediate

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("worker")

DATABASE_URL = os.getenv("DATABASE_URL")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")
API_ID = int(os.getenv("API_ID", "0"))
API_HASH = os.getenv("API_HASH", "")
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", "").encode()[:32].ljust(32, b"0")

# ─── رمزگشایی سشن ───────────────────────────────────────────
def decrypt_session(encrypted: str) -> str:
    import base64
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    raw = base64.b64decode(encrypted)
    nonce, ct = raw[:12], raw[12:]
    aesgcm = AESGCM(ENCRYPTION_KEY)
    return aesgcm.decrypt(nonce, ct, None).decode()

# ─── اتصال به دیتابیس و Redis ───────────────────────────────
_pool = None
_redis = None

async def get_pool():
    global _pool
    if not _pool:
        _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    return _pool

async def get_redis():
    global _redis
    if not _redis:
        _redis = await aioredis.from_url(REDIS_URL, encoding="utf-8", decode_responses=True)
    return _redis

# ─── انتخاب پروکسی رندوم ────────────────────────────────────
async def get_random_proxy():
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, host, port, proxy_type, username, password "
            "FROM proxies WHERE is_active=TRUE "
            "ORDER BY RANDOM() LIMIT 1"
        )
    return dict(row) if row else None

def build_proxy(proxy_row: dict):
    """ساخت tuple پروکسی برای Telethon"""
    if not proxy_row:
        return None
    import socks
    proxy_type_map = {
        "socks5": socks.SOCKS5,
        "socks4": socks.SOCKS4,
        "http": socks.HTTP,
    }
    ptype = proxy_type_map.get(proxy_row["proxy_type"].lower(), socks.SOCKS5)
    return (ptype, proxy_row["host"], proxy_row["port"],
            True, proxy_row.get("username"), proxy_row.get("password"))

# ─── لاگ رویداد سشن ─────────────────────────────────────────
async def log_session_event(session_id: str, event: str, details: dict = None):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO session_logs (session_id, event, details) VALUES ($1,$2,$3)",
            session_id, event, json.dumps(details or {})
        )

# ─── بروزرسانی وضعیت سشن ────────────────────────────────────
async def update_session_status(session_id: str, status: str, flood_until=None):
    pool = await get_pool()
    async with pool.acquire() as conn:
        if flood_until:
            await conn.execute(
                "UPDATE sessions SET status=$1, flood_until=$2, updated_at=NOW() WHERE id=$3",
                status, flood_until, session_id
            )
        else:
            await conn.execute(
                "UPDATE sessions SET status=$1, updated_at=NOW() WHERE id=$2",
                status, session_id
            )

async def increment_error(session_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE sessions SET error_count=error_count+1, updated_at=NOW() "
            "WHERE id=$1 RETURNING error_count",
            session_id
        )
        return row["error_count"] if row else 0

# ─── بروزرسانی وضعیت task_sessions ─────────────────────────
async def update_task_session(task_id: str, session_id: str, status: str, error: str = None):
    pool = await get_pool()
    async with pool.acquire() as conn:
        if status == "joined":
            await conn.execute(
                "INSERT INTO task_sessions (task_id, session_id, status, joined_at) "
                "VALUES ($1,$2,'joined',NOW()) ON CONFLICT (task_id, session_id) "
                "DO UPDATE SET status='joined', joined_at=NOW()",
                task_id, session_id
            )
            await conn.execute(
                "UPDATE tasks SET sessions_done=sessions_done+1 WHERE id=$1", task_id
            )
        else:
            await conn.execute(
                "INSERT INTO task_sessions (task_id, session_id, status, error) "
                "VALUES ($1,$2,'failed',$3) ON CONFLICT (task_id, session_id) "
                "DO UPDATE SET status='failed', error=$3",
                task_id, session_id, error
            )
            await conn.execute(
                "UPDATE tasks SET sessions_failed=sessions_failed+1 WHERE id=$1", task_id
            )

# ─── join یک سشن به یک گروه/کانال ──────────────────────────
async def join_target(session_row: dict, task: dict) -> bool:
    session_id = str(session_row["id"])
    task_id = task["task_id"]
    target = task["target"]

    try:
        session_str = decrypt_session(session_row["session_data"])
    except Exception as e:
        logger.error(f"Decrypt error for {session_row['phone']}: {e}")
        await update_session_status(session_id, "error")
        await update_task_session(task_id, session_id, "failed", f"decrypt_error: {e}")
        return False

    proxy_row = await get_random_proxy()
    proxy = build_proxy(proxy_row)

    api_id = session_row.get("api_id") or API_ID
    api_hash = session_row.get("api_hash") or API_HASH

    if not api_id or not api_hash:
        logger.warning(f"No API credentials for {session_row['phone']}")
        await update_task_session(task_id, session_id, "failed", "no_api_credentials")
        return False

    client = TelegramClient(
        StringSession(session_str),
        api_id, api_hash,
        proxy=proxy,
        connection_retries=2,
        timeout=30,
        request_retries=2
    )

    try:
        await client.connect()
        if not await client.is_user_authorized():
            logger.warning(f"Session logged out: {session_row['phone']}")
            await update_session_status(session_id, "logged_out")
            await update_task_session(task_id, session_id, "failed", "logged_out")
            await log_session_event(session_id, "logged_out", {"task_id": task_id})
            return False

        # join
        await client.get_entity(target)
        await client(
            __import__("telethon.tl.functions.channels", fromlist=["JoinChannelRequest"]).JoinChannelRequest(target)
        )
        await update_session_status(session_id, "active")
        await update_task_session(task_id, session_id, "joined")
        await log_session_event(session_id, "joined", {"target": target, "task_id": task_id})

        # خروج خودکار
        if task.get("auto_leave_after"):
            await asyncio.sleep(task["auto_leave_after"] * 60)
            try:
                await client(
                    __import__("telethon.tl.functions.channels", fromlist=["LeaveChannelRequest"]).LeaveChannelRequest(target)
                )
                await log_session_event(session_id, "left", {"target": target, "task_id": task_id})
            except Exception:
                pass

        return True

    except errors.FloodWaitError as e:
        wait = e.seconds
        flood_until = datetime.utcnow() + timedelta(seconds=wait)
        logger.warning(f"FloodWait {wait}s for {session_row['phone']}")
        await update_session_status(session_id, "flood", flood_until)
        await update_task_session(task_id, session_id, "failed", f"flood_wait_{wait}s")
        await log_session_event(session_id, "flood", {"wait": wait, "task_id": task_id})
        return False

    except errors.UserBannedInChannelError:
        await update_session_status(session_id, "banned")
        await update_task_session(task_id, session_id, "failed", "banned_in_channel")
        await log_session_event(session_id, "banned", {"target": target})
        return False

    except errors.ChannelPrivateError:
        await update_task_session(task_id, session_id, "failed", "channel_private")
        return False

    except errors.UserDeactivatedBanError:
        await update_session_status(session_id, "deleted")
        await update_task_session(task_id, session_id, "failed", "account_deleted")
        await log_session_event(session_id, "deleted", {})
        return False

    except errors.PhoneNumberBannedError:
        await update_session_status(session_id, "banned")
        await update_task_session(task_id, session_id, "failed", "phone_banned")
        await log_session_event(session_id, "banned", {"reason": "phone_banned"})
        return False

    except Exception as e:
        err_str = str(e)[:200]
        logger.error(f"Join error for {session_row['phone']}: {err_str}")
        error_count = await increment_error(session_id)
        if error_count >= 5:
            await update_session_status(session_id, "error")
        await update_task_session(task_id, session_id, "failed", err_str)
        return False

    finally:
        try:
            await client.disconnect()
        except Exception:
            pass

# ─── پردازش یک تسک join ─────────────────────────────────────
async def process_join_task(task: dict):
    task_id = task["task_id"]
    pool = await get_pool()

    logger.info(f"Processing task {task_id[:8]} — target: {task['target']} — count: {task['session_count']}")

    # بروزرسانی وضعیت تسک به running
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE tasks SET status='running', started_at=NOW() WHERE id=$1 AND status IN ('pending')",
            task_id
        )

    # دریافت سشن‌های فعال
    async with pool.acquire() as conn:
        sessions = await conn.fetch(
            "SELECT id, phone, session_data, api_id, api_hash "
            "FROM sessions WHERE status='active' "
            "ORDER BY RANDOM() LIMIT $1",
            task["session_count"]
        )

    if not sessions:
        logger.warning(f"No active sessions for task {task_id[:8]}")
        async with pool.acquire() as conn:
            await conn.execute("UPDATE tasks SET status='failed' WHERE id=$1", task_id)
        return

    success = 0
    failed = 0
    delay_min = task.get("join_delay_min", 3)
    delay_max = task.get("join_delay_max", 8)

    for session_row in sessions:
        # بررسی لغو/توقف تسک
        async with pool.acquire() as conn:
            status_row = await conn.fetchrow("SELECT status FROM tasks WHERE id=$1", task_id)
        if status_row and status_row["status"] in ("cancelled", "paused"):
            logger.info(f"Task {task_id[:8]} {status_row['status']}, stopping")
            break

        result = await join_target(dict(session_row), task)
        if result:
            success += 1
        else:
            failed += 1

        # تأخیر رندوم بین join‌ها
        delay = random.uniform(delay_min, delay_max)
        await asyncio.sleep(delay)

    # وضعیت نهایی تسک
    async with pool.acquire() as conn:
        current = await conn.fetchrow("SELECT status FROM tasks WHERE id=$1", task_id)
        if current and current["status"] == "running":
            final_status = "completed" if failed == 0 or success > 0 else "failed"
            await conn.execute(
                "UPDATE tasks SET status=$1, completed_at=NOW() WHERE id=$2",
                final_status, task_id
            )

    logger.info(f"Task {task_id[:8]} done — success: {success}, failed: {failed}")

# ─── بررسی سلامت سشن‌ها ─────────────────────────────────────
async def health_check_sessions():
    pool = await get_pool()
    logger.info("Starting session health check...")
    async with pool.acquire() as conn:
        # رفع flood منقضی‌شده
        await conn.execute(
            "UPDATE sessions SET status='active', flood_until=NULL "
            "WHERE status='flood' AND flood_until < NOW()"
        )
        # سشن‌هایی که مدت زیادی بررسی نشدن
        sessions = await conn.fetch(
            "SELECT id, phone, session_data, api_id, api_hash FROM sessions "
            "WHERE status='active' AND (last_checked IS NULL OR last_checked < NOW() - INTERVAL '30 minutes') "
            "LIMIT 50"
        )

    checked = 0
    for s in sessions:
        try:
            session_str = decrypt_session(s["session_data"])
            api_id = s.get("api_id") or API_ID
            api_hash = s.get("api_hash") or API_HASH
            if not api_id or not api_hash:
                continue
            client = TelegramClient(StringSession(session_str), api_id, api_hash, connection_retries=1, timeout=15)
            await client.connect()
            is_auth = await client.is_user_authorized()
            await client.disconnect()
            async with pool.acquire() as conn:
                if is_auth:
                    await conn.execute(
                        "UPDATE sessions SET last_checked=NOW() WHERE id=$1", str(s["id"])
                    )
                else:
                    await conn.execute(
                        "UPDATE sessions SET status='logged_out', last_checked=NOW() WHERE id=$1", str(s["id"])
                    )
            checked += 1
            await asyncio.sleep(2)
        except errors.FloodWaitError as e:
            await asyncio.sleep(min(e.seconds, 60))
        except Exception as e:
            logger.debug(f"Health check error for {s['phone']}: {e}")

    logger.info(f"Health check done — checked {checked} sessions")

# ─── حلقه اصلی worker ───────────────────────────────────────
async def task_worker():
    redis = await get_redis()
    logger.info("Task worker started, waiting for jobs...")
    while True:
        try:
            # بررسی صف با timeout
            item = await redis.brpop("tasks:join", timeout=5)
            if not item:
                continue
            _, data = item
            task = json.loads(data)
            await process_join_task(task)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Worker loop error: {e}")
            await asyncio.sleep(5)

async def health_check_loop():
    interval = int(os.getenv("CHECK_INTERVAL_MINUTES", "30")) * 60
    while True:
        await asyncio.sleep(interval)
        try:
            await health_check_sessions()
        except Exception as e:
            logger.error(f"Health check loop error: {e}")

async def main():
    logger.info("🚀 Worker starting...")
    await get_pool()
    await get_redis()
    await asyncio.gather(
        task_worker(),
        health_check_loop()
    )

if __name__ == "__main__":
    asyncio.run(main())
