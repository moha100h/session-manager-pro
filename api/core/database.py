import asyncpg
import os
import logging

logger = logging.getLogger("database")
_pool = None

async def init_db():
    global _pool
    _pool = await asyncpg.create_pool(
        os.getenv("DATABASE_URL"),
        min_size=3, max_size=20,
        command_timeout=60
    )
    logger.info("✅ Database pool initialized")

async def close_db():
    global _pool
    if _pool:
        await _pool.close()

async def fetch_one(query: str, *args):
    async with _pool.acquire() as conn:
        return await conn.fetchrow(query, *args)

async def fetch_all(query: str, *args):
    async with _pool.acquire() as conn:
        return await conn.fetch(query, *args)

async def execute(query: str, *args):
    async with _pool.acquire() as conn:
        return await conn.execute(query, *args)
