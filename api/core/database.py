import os
import asyncpg
import logging
from typing import Optional

logger = logging.getLogger(__name__)
_pool: Optional[asyncpg.Pool] = None

async def init_db():
    global _pool
    _pool = await asyncpg.create_pool(
        dsn=os.getenv("DATABASE_URL"),
        min_size=5,
        max_size=20,
        command_timeout=60,
        max_inactive_connection_lifetime=300
    )
    logger.info("✅ Database pool initialized")

async def get_db() -> asyncpg.Pool:
    return _pool

async def fetch_one(query: str, *args):
    async with _pool.acquire() as conn:
        return await conn.fetchrow(query, *args)

async def fetch_all(query: str, *args):
    async with _pool.acquire() as conn:
        return await conn.fetch(query, *args)

async def execute(query: str, *args):
    async with _pool.acquire() as conn:
        return await conn.execute(query, *args)

async def execute_many(query: str, args_list):
    async with _pool.acquire() as conn:
        return await conn.executemany(query, args_list)
