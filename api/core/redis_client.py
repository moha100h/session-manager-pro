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
        encoding="utf-8", decode_responses=True
    )
    logger.info("✅ Redis initialized")

async def close_redis():
    global _redis
    if _redis:
        await _redis.close()

async def cache_get(key: str):
    val = await _redis.get(f"cache:{key}")
    return json.loads(val) if val else None

async def cache_set(key: str, value, ttl: int = 60):
    await _redis.setex(f"cache:{key}", ttl, json.dumps(value, default=str))

async def cache_delete(key: str):
    await _redis.delete(f"cache:{key}")

async def enqueue_task(queue: str, data: dict):
    await _redis.lpush(queue, json.dumps(data))
