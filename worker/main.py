import asyncio
import os
import logging
import random
import json
from typing import Optional
import asyncpg
import aioredis
from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.errors import (
    FloodWaitError, UserBannedInChannelError, ChannelPrivateError,
    InviteHashExpiredError, UserAlreadyParticipantError, SessionRevokedError,
    AuthKeyUnregisteredError, PhoneNumberBannedError
)
from telethon.tl.functions.channels import JoinChannelRequest, LeaveChannelRequest
from telethon.tl.functions.messages import ImportChatInviteRequest
import sys
sys.path.insert(0, "/app")

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("worker")

DB_URL = os.getenv("DATABASE_URL")
REDIS_URL = os.getenv("REDIS_URL")
API_ID = int(os.getenv("API_ID", "0"))
API_HASH = os.getenv("API_HASH", "")
MAX_SESSIONS = int(os.getenv("MAX_SESSIONS_PER_WORKER", "500"))

db_pool = None
redis = None

async def init():
    global db_pool, redis
    db_pool = await asyncpg.create_pool(DB_URL, min_size=3, max_size=10)
    redis = await aioredis.from_url(REDIS_URL, encoding="utf-8", decode_responses=True)
    logger.info("✅ Worker initialized")

async def get_random_proxy():
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM proxies WHERE is_active=TRUE ORDER BY RANDOM() LIMIT 1"
        )
    if not row:
        return None
    return {
        "proxy_type": row["proxy_type"],
        "addr": row["host"],
        "port": row["port"],
        "username": row["username"],
        "password": row["password"]
    }

async def decrypt_session_string(encrypted: str) -> str:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    import base64
    key = os.getenv("ENCRYPTION_KEY", "").encode()[:32].ljust(32, b"0")
    aesgcm = AESGCM(key)
    raw = base64.b64decode(encrypted)
    nonce, ct = raw[:12], raw[12:]
    return aesgcm.decrypt(nonce, ct, None).decode()

async def log_session_event(session_id: str, event: str, details: dict = None):
    async with db_pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO session_logs (session_id, event, details) VALUES ($1,$2,$3::jsonb)",
            session_id, event, json.dumps(details or {})
        )

async def update_session_status(session_id: str, status: str):
    async with db_pool.acquire() as conn:
        await conn.execute(
            "UPDATE sessions SET status=$1, updated_at=NOW() WHERE id=$2",
            status, session_id
        )

async def join_target(client: TelegramClient, target: str, target_type: str):
    if target_type == "link" and "t.me/+" in target:
        invite_hash = target.split("+")[-1]
        await client(ImportChatInviteRequest(invite_hash))
    elif target_type == "link" and "t.me/" in target:
        username = target.split("t.me/")[-1].strip("/")
        entity = await client.get_entity(username)
        await client(JoinChannelRequest(entity))
    elif target_type in ("id", "username"):
        entity = await client.get_entity(int(target) if target_type == "id" else target)
        await client(JoinChannelRequest(entity))

async def process_session_join(session_row: dict, task: dict) -> str:
    session_id = str(session_row["id"])
    phone = session_row["phone"]
    try:
        session_string = await decrypt_session_string(session_row["session_string"])
        proxy = await get_random_proxy()
        proxy_tuple = None
        if proxy:
            import socks
            proxy_tuple = (socks.SOCKS5, proxy["addr"], proxy["port"],
                          True, proxy.get("username"), proxy.get("password"))
        client = TelegramClient(
            StringSession(session_string),
            session_row["api_id"] or API_ID,
            session_row["api_hash"] or API_HASH,
            proxy=proxy_tuple,
            connection_retries=2,
            timeout=30
        )
        await client.connect()
        if not await client.is_user_authorized():
            await update_session_status(session_id, "logged_out")
            await log_session_event(session_id, "logged_out", {"reason": "not_authorized"})
            await client.disconnect()
            return "logged_out"
        await join_target(client, task["target"], task["target_type"])
        await update_session_status(session_id, "active")
        await log_session_event(session_id, "joined", {"target": task["target"]})
        await client.disconnect()
        return "joined"
    except FloodWaitError as e:
        wait = int(e.seconds * float(os.getenv("FLOOD_WAIT_MULTIPLIER", "1.5")))
        async with db_pool.acquire() as conn:
            await conn.execute(
                "UPDATE sessions SET status='flood', flood_until=NOW()+($1 || ' seconds')::INTERVAL WHERE id=$2",
                str(wait), session_id
            )
        await log_session_event(session_id, "flood", {"wait_seconds": wait})
        return "flood"
    except (SessionRevokedError, AuthKeyUnregisteredError):
        await update_session_status(session_id, "logged_out")
        await log_session_event(session_id, "logged_out", {"reason": "session_revoked"})
        return "logged_out"
    except PhoneNumberBannedError:
        await update_session_status(session_id, "banned")
        await log_session_event(session_id, "banned", {"reason": "phone_banned"})
        return "banned"
    except UserAlreadyParticipantError:
        await log_session_event(session_id, "already_member", {"target": task["target"]})
        return "joined"
    except (ChannelPrivateError, InviteHashExpiredError) as e:
        await log_session_event(session_id, "error", {"error": str(e)})
        return "failed"
    except Exception as e:
        logger.error(f"Session {phone} error: {e}")
        async with db_pool.acquire() as conn:
            await conn.execute("UPDATE sessions SET error_count=error_count+1 WHERE id=$1", session_id)
        await log_session_event(session_id, "error", {"error": str(e)})
        return "failed"

async def process_join_task(task: dict):
    task_id = task["task_id"]
    logger.info(f"Processing join task {task_id}")
    async with db_pool.acquire() as conn:
        await conn.execute("UPDATE tasks SET status='running', started_at=NOW() WHERE id=$1", task_id)
        sessions = await conn.fetch(
            """SELECT s.* FROM sessions s
               WHERE s.status='active'
               AND s.id NOT IN (SELECT session_id FROM task_sessions WHERE task_id=$1)
               AND (s.flood_until IS NULL OR s.flood_until < NOW())
               ORDER BY s.last_used ASC NULLS FIRST
               LIMIT $2""",
            task_id, task["session_count"]
        )
    if not sessions:
        async with db_pool.acquire() as conn:
            await conn.execute("UPDATE tasks SET status='failed' WHERE id=$1", task_id)
        return
    semaphore = asyncio.Semaphore(10)
    async def process_one(session_row):
        async with semaphore:
            status = await process_session_join(dict(session_row), task)
            delay = random.uniform(task.get("join_delay_min", 3), task.get("join_delay_max", 8))
            await asyncio.sleep(delay)
            async with db_pool.acquire() as conn:
                await conn.execute(
                    "INSERT INTO task_sessions (task_id, session_id, status, joined_at) VALUES ($1,$2,$3,NOW()) ON CONFLICT DO NOTHING",
                    task_id, str(session_row["id"]), status
                )
                if status == "joined":
                    await conn.execute("UPDATE tasks SET sessions_done=sessions_done+1 WHERE id=$1", task_id)
                else:
                    await conn.execute("UPDATE tasks SET sessions_failed=sessions_failed+1 WHERE id=$1", task_id)
                await conn.execute("UPDATE sessions SET last_used=NOW() WHERE id=$1", str(session_row["id"]))
    await asyncio.gather(*[process_one(s) for s in sessions])
    async with db_pool.acquire() as conn:
        await conn.execute("UPDATE tasks SET status='completed', completed_at=NOW() WHERE id=$1", task_id)
    logger.info(f"Task {task_id} completed")

async def health_check_sessions():
    """بررسی وضعیت سشن‌ها هر 30 دقیقه"""
    while True:
        await asyncio.sleep(1800)
        logger.info("Running session health check...")
        async with db_pool.acquire() as conn:
            sessions = await conn.fetch(
                "SELECT * FROM sessions WHERE status='active' AND (last_checked IS NULL OR last_checked < NOW()-INTERVAL '30 minutes') LIMIT 100"
            )
        for session_row in sessions:
            try:
                session_string = await decrypt_session_string(session_row["session_string"])
                client = TelegramClient(
                    StringSession(session_string),
                    session_row["api_id"] or API_ID,
                    session_row["api_hash"] or API_HASH,
                    connection_retries=1, timeout=15
                )
                await client.connect()
                is_auth = await client.is_user_authorized()
                await client.disconnect()
                status = "active" if is_auth else "logged_out"
                async with db_pool.acquire() as conn:
                    await conn.execute(
                        "UPDATE sessions SET status=$1, last_checked=NOW() WHERE id=$2",
                        status, str(session_row["id"])
                    )
                if not is_auth:
                    await log_session_event(str(session_row["id"]), "logged_out", {"source": "health_check"})
            except Exception as e:
                logger.error(f"Health check error for {session_row['phone']}: {e}")

async def auto_leave_checker():
    """بررسی خروج خودکار سشن‌ها"""
    while True:
        await asyncio.sleep(60)
        async with db_pool.acquire() as conn:
            tasks = await conn.fetch(
                """SELECT t.id, t.target, t.target_type, ts.session_id
                   FROM tasks t JOIN task_sessions ts ON t.id=ts.task_id
                   WHERE t.auto_leave_after IS NOT NULL
                   AND ts.status='joined' AND ts.left_at IS NULL
                   AND ts.joined_at + (t.auto_leave_after || ' minutes')::INTERVAL < NOW()"""
            )
        for task in tasks:
            try:
                async with db_pool.acquire() as conn:
                    session_row = await conn.fetchrow("SELECT * FROM sessions WHERE id=$1", task["session_id"])
                if not session_row:
                    continue
                session_string = await decrypt_session_string(session_row["session_string"])
                client = TelegramClient(
                    StringSession(session_string),
                    session_row["api_id"] or API_ID,
                    session_row["api_hash"] or API_HASH,
                    connection_retries=1, timeout=15
                )
                await client.connect()
                entity = await client.get_entity(int(task["target"]) if task["target_type"] == "id" else task["target"])
                await client(LeaveChannelRequest(entity))
                await client.disconnect()
                async with db_pool.acquire() as conn:
                    await conn.execute(
                        "UPDATE task_sessions SET status='left', left_at=NOW() WHERE task_id=$1 AND session_id=$2",
                        task["id"], task["session_id"]
                    )
                await log_session_event(str(task["session_id"]), "left", {"target": task["target"], "reason": "auto_leave"})
            except Exception as e:
                logger.error(f"Auto-leave error: {e}")

async def main():
    await init()
    logger.info("🚀 Worker started, listening for tasks...")
    asyncio.create_task(health_check_sessions())
    asyncio.create_task(auto_leave_checker())
    while True:
        try:
            task_json = await redis.brpop("tasks:join", timeout=5)
            if task_json:
                task = json.loads(task_json[1])
                asyncio.create_task(process_join_task(task))
        except Exception as e:
            logger.error(f"Worker loop error: {e}")
            await asyncio.sleep(5)

if __name__ == "__main__":
    asyncio.run(main())
