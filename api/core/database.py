import asyncpg
import os
import logging

logger = logging.getLogger("database")
_pool = None

async def init_db():
    global _pool
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL is not set in environment variables")
    _pool = await asyncpg.create_pool(
        db_url,
        min_size=3,
        max_size=20,
        command_timeout=60,
        statement_cache_size=0,   # برای pgbouncer compatibility
    )
    # تست اتصال
    async with _pool.acquire() as conn:
        await conn.fetchval("SELECT 1")
    logger.info("✅ Database pool initialized")

async def close_db():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None

def _ensure():
    if not _pool:
        raise RuntimeError("Database pool not initialized — call init_db() first")

async def fetch_one(query: str, *args):
    _ensure()
    async with _pool.acquire() as conn:
        return await conn.fetchrow(query, *args)

async def fetch_all(query: str, *args):
    _ensure()
    async with _pool.acquire() as conn:
        return await conn.fetch(query, *args)

async def execute(query: str, *args):
    _ensure()
    async with _pool.acquire() as conn:
        return await conn.execute(query, *args)

async def fetch_val(query: str, *args):
    _ensure()
    async with _pool.acquire() as conn:
        return await conn.fetchval(query, *args)
