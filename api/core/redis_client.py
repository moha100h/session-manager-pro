import os
import aioredis
import json
import logging
from typing import Optional, Any

logger = logging.getLogger(__name__)
_redis: Optional[aioredis.Redis] = None

async def init_redis():
    global _redis
    _redis = await aioredis.from_url(
        os.getenv("REDIS_URL"),
        encoding="utf-8",
        decode_responses=True,
        max_connections=50
    )
    logger.info("✅ Redis initialized")

async def get_redis() -> aioredis.Redis:
    return _redis

async def cache_set(key: str, value: Any, ttl: int = 300):
    await _redis.setex(key, ttl, json.dumps(value, default=str))

async def cache_get(key: str) -> Optional[Any]:
    val = await _redis.get(key)
    return json.loads(val) if val else None

async def cache_delete(key: str):
    await _redis.delete(key)

async def publish(channel: str, message: dict):
    await _redis.publish(channel, json.dumps(message, default=str))

async def enqueue_task(queue: str, task: dict):
    await _redis.lpush(queue, json.dumps(task, default=str))

async def dequeue_task(queue: str, timeout: int = 5) -> Optional[dict]:
    result = await _redis.brpop(queue, timeout=timeout)
    if result:
        return json.loads(result[1])
    return None
