import aioredis
import os
import json
import logging

logger = logging.getLogger("redis")
_redis = None

async def init_redis():
    global _redis
    _redis = await aioredis.from_url(
        os.getenv("REDIS_URL", "redis://redis:6379"),
        encoding="utf-8",
        decode_responses=True,
        max_connections=20,
    )
    # تست اتصال
    await _redis.ping()
    logger.info("✅ Redis initialized")

async def close_redis():
    global _redis
    if _redis:
        # aioredis 2.x: close() sync, سپس wait_closed()
        _redis.close()
        await _redis.wait_closed()
        _redis = None

def _ensure():
    if not _redis:
        raise RuntimeError("Redis not initialized — call init_redis() first")

async def cache_get(key: str):
    _ensure()
    val = await _redis.get(f"cache:{key}")
    if val is None:
        return None
    try:
        return json.loads(val)
    except json.JSONDecodeError:
        return None

async def cache_set(key: str, value, ttl: int = 60):
    _ensure()
    await _redis.setex(f"cache:{key}", ttl, json.dumps(value, default=str))

async def cache_delete(key: str):
    _ensure()
    await _redis.delete(f"cache:{key}")

async def enqueue_task(queue: str, data: dict):
    _ensure()
    await _redis.lpush(queue, json.dumps(data))

async def get_queue_length(queue: str) -> int:
    _ensure()
    return await _redis.llen(queue)
