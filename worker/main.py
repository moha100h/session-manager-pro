import asyncio
import os
import logging
import json
import random
import time
from datetime import datetime, timedelta
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
from telethon.tl.functions.messages import ImportChatInviteRequest, CheckChatInviteRequest

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

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
    row = await db_pool.fetchrow("SELECT * FROM proxies WHERE is_active = TRUE ORDER BY RANDOM() LIMIT 1")
    if not row: return None
    return dict(row)

async def decrypt_session_string(encrypted: str) -> str:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    import base64
    key = os.getenv("ENCRYPTION_KEY", "").encode()[:32].ljust(32)
    aesgcm = AESGCM(key)
    raw = base64.b64decode(encrypted)
    nonce, ct = raw[:12], raw[12:]
    return aesgcm.decrypt(nonce, ct, None).decode()

async def log_session_event(session_id, event, details=None):
    await db_pool.execute(
        "INSERT INTO session_logs (session_id, event, details) VALUES ($1, $2, $3)",
        session_id, event, json.dumps(details) if details else None
    )

async def update_session_status(session_id, status, error_count_inc=0):
    await db_pool.execute(
        "UPDATE sessions SET status = $1, error_count = error_count + $2, last_checked = NOW() WHERE id = $3",
        status, error_count_inc, session_id
    )

async def join_channel(client: TelegramClient, target: str, target_type: str):
    try:
        if target_type == "link" and "t.me/+" in target:
            hash_val = target.split("t.me/+")[1]
            await client(ImportChatInviteRequest(hash_val))
        elif target_type == "link" and "t.me/joinchat/" in target:
            hash_val = target.split("joinchat/")[1]
            await client(ImportChatInviteRequest(hash_val))
        else:
            entity = await client.get_entity(target)
            await client(JoinChannelRequest(entity))
        return True, None
    except UserAlreadyParticipantError:
        return True, "already_member"
    except FloodWaitError as e:
        return False, f"flood:{e.seconds}"
    except (ChannelPrivateError, InviteHashExpiredError) as e:
        return False, f"access_error:{type(e).__name__}"
    except (SessionRevokedError, AuthKeyUnregisteredError, PhoneNumberBannedError) as e:
        return False, f"session_dead:{type(e).__name__}"
    except Exception as e:
        return False, str(e)

async def leave_channel(client: TelegramClient, target: str):
    try:
        entity = await client.get_entity(target)
        await client(LeaveChannelRequest(entity))
        return True, None
    except Exception as e:
        return False, str(e)

async def process_session(task_id, session_id, session_data, target, target_type, action, delay_min, delay_max):
    proxy = await get_random_proxy()
    proxy_config = None
    if proxy:
        proxy_config = (proxy["proxy_type"], proxy["host"], proxy["port"],
                       True, proxy.get("username"), proxy.get("password"))

    try:
        session_str = await decrypt_session_string(session_data["session_string"])
        client = TelegramClient(
            StringSession(session_str),
            session_data.get("api_id") or API_ID,
            session_data.get("api_hash") or API_HASH,
            proxy=proxy_config,
            connection_retries=2,
            timeout=30
        )
        await client.connect()

        if not await client.is_user_authorized():
            await update_session_status(session_id, "logged_out")
            await log_session_event(session_id, "logged_out", {"task_id": str(task_id)})
            await db_pool.execute(
                "UPDATE task_sessions SET status = 'failed', error = $1 WHERE task_id = $2 AND session_id = $3",
                "session_not_authorized", task_id, session_id
            )
            return False

        if action == "join":
            success, error = await join_channel(client, target, target_type)
        else:
            success, error = await leave_channel(client, target)

        await client.disconnect()

        if success:
            await db_pool.execute(
                "UPDATE task_sessions SET status = 'joined', joined_at = NOW() WHERE task_id = $1 AND session_id = $2",
                task_id, session_id
            )
            await db_pool.execute(
                "UPDATE sessions SET last_used = NOW() WHERE id = $1", session_id
            )
            await db_pool.execute(
                "UPDATE tasks SET sessions_done = sessions_done + 1 WHERE id = $1", task_id
            )
            await log_session_event(session_id, f"{action}_success", {"task_id": str(task_id), "target": target})
        else:
            if error and error.startswith("flood:"):
                wait_secs = int(error.split(":")[1])
                flood_until = datetime.utcnow() + timedelta(seconds=wait_secs * 1.5)
                await db_pool.execute(
                    "UPDATE sessions SET status = 'flood', flood_until = $1 WHERE id = $2",
                    flood_until, session_id
                )
                await log_session_event(session_id, "flood_wait", {"seconds": wait_secs})
            elif error and "session_dead" in error:
                status = "deleted" if "Revoked" in error else "logged_out"
                await update_session_status(session_id, status)
                await log_session_event(session_id, status, {"error": error})
            else:
                await update_session_status(session_id, "active", error_count_inc=1)

            await db_pool.execute(
                "UPDATE task_sessions SET status = 'failed', error = $1 WHERE task_id = $2 AND session_id = $3",
                error, task_id, session_id
            )
            await db_pool.execute(
                "UPDATE tasks SET sessions_failed = sessions_failed + 1 WHERE id = $1", task_id
            )

        delay = random.uniform(delay_min, delay_max)
        await asyncio.sleep(delay)
        return success

    except Exception as e:
        logger.error(f"Session {session_id} error: {e}")
        await update_session_status(session_id, "error", error_count_inc=1)
        return False

async def process_task(task_data: dict):
    task_id = task_data["task_id"]
    task = await db_pool.fetchrow("SELECT * FROM tasks WHERE id = $1", task_id)
    if not task or task["status"] in ("cancelled", "completed"):
        return

    await db_pool.execute("UPDATE tasks SET status = 'running', started_at = NOW() WHERE id = $1", task_id)
    logger.info(f"🚀 Processing task {task_id}: {task['type']} -> {task['target']}")

    sessions = await db_pool.fetch(
        """SELECT s.id, s.session_string, s.api_id, s.api_hash
           FROM task_sessions ts JOIN sessions s ON s.id = ts.session_id
           WHERE ts.task_id = $1 AND ts.status = 'pending' AND s.status = 'active'""",
        task_id
    )

    semaphore = asyncio.Semaphore(min(50, len(sessions)))

    async def process_with_semaphore(session):
        async with semaphore:
            current_task = await db_pool.fetchrow("SELECT status FROM tasks WHERE id = $1", task_id)
            if current_task["status"] in ("cancelled", "paused"):
                return
            await process_session(
                task_id, session["id"], dict(session),
                task["target"], task["target_type"], task["type"],
                task["join_delay_min"], task["join_delay_max"]
            )

    await asyncio.gather(*[process_with_semaphore(s) for s in sessions])

    final = await db_pool.fetchrow("SELECT status FROM tasks WHERE id = $1", task_id)
    if final["status"] == "running":
        await db_pool.execute(
            "UPDATE tasks SET status = 'completed', completed_at = NOW() WHERE id = $1", task_id
        )
    logger.info(f"✅ Task {task_id} completed")

    # Schedule auto-leave if needed
    if task["auto_leave_after"]:
        leave_at = datetime.utcnow() + timedelta(minutes=task["auto_leave_after"])
        await redis.zadd("tasks:auto_leave", {str(task_id): leave_at.timestamp()})

async def check_auto_leave():
    while True:
        try:
            now = datetime.utcnow().timestamp()
            tasks = await redis.zrangebyscore("tasks:auto_leave", 0, now)
            for task_id in tasks:
                task = await db_pool.fetchrow("SELECT * FROM tasks WHERE id = $1", task_id)
                if task:
                    leave_task = {
                        "task_id": str(task_id) + "_leave",
                        "type": "leave",
                        "target": task["target"],
                        "target_type": task["target_type"],
                        "session_count": task["session_count"],
                        "priority": 5
                    }
                    await redis.lpush("tasks:queue", json.dumps(leave_task))
                await redis.zrem("tasks:auto_leave", task_id)
        except Exception as e:
            logger.error(f"Auto-leave check error: {e}")
        await asyncio.sleep(60)

async def check_session_health():
    while True:
        try:
            interval = int((await db_pool.fetchrow("SELECT value FROM settings WHERE key = 'check_interval_minutes'"))["value"])
            sessions = await db_pool.fetch(
                "SELECT id, session_string, api_id, api_hash FROM sessions WHERE status = 'active' AND (last_checked IS NULL OR last_checked < NOW() - INTERVAL '1 minute' * $1) LIMIT 100",
                interval
            )
            for session in sessions:
                try:
                    session_str = await decrypt_session_string(session["session_string"])
                    client = TelegramClient(
                        StringSession(session_str),
                        session.get("api_id") or API_ID,
                        session.get("api_hash") or API_HASH,
                        connection_retries=1, timeout=15
                    )
                    await client.connect()
                    authorized = await client.is_user_authorized()
                    await client.disconnect()
                    if not authorized:
                        await update_session_status(session["id"], "logged_out")
                        await log_session_event(session["id"], "health_check_failed", {"reason": "not_authorized"})
                    else:
                        await db_pool.execute("UPDATE sessions SET last_checked = NOW() WHERE id = $1", session["id"])
                except (SessionRevokedError, AuthKeyUnregisteredError):
                    await update_session_status(session["id"], "deleted")
                    await log_session_event(session["id"], "deleted", {"reason": "session_revoked"})
                except Exception as e:
                    logger.debug(f"Health check error for {session['id']}: {e}")
                await asyncio.sleep(1)
        except Exception as e:
            logger.error(f"Health check loop error: {e}")
        await asyncio.sleep(300)

async def main():
    await init()
    logger.info("🤖 Worker started, listening for tasks...")
    asyncio.create_task(check_auto_leave())
    asyncio.create_task(check_session_health())

    while True:
        try:
            result = await redis.brpop("tasks:queue", timeout=5)
            if result:
                task_data = json.loads(result[1])
                asyncio.create_task(process_task(task_data))
        except Exception as e:
            logger.error(f"Queue error: {e}")
            await asyncio.sleep(5)

if __name__ == "__main__":
    asyncio.run(main())
