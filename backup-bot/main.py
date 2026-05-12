import asyncio
import os
import logging
import subprocess
import gzip
import shutil
import re
from datetime import datetime

import asyncpg
from aiogram import Bot, Dispatcher
from aiogram.filters import Command
from aiogram.types import Message, FSInputFile

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("backup-bot")

BACKUP_BOT_TOKEN = os.getenv("BACKUP_BOT_TOKEN", "")
BACKUP_CHAT_ID = int(os.getenv("BACKUP_CHAT_ID", "0"))
DATABASE_URL = os.getenv("DATABASE_URL", "")
BACKUP_DIR = "/app/backups"
BACKUP_INTERVAL_HOURS = int(os.getenv("BACKUP_INTERVAL_HOURS", "1"))

os.makedirs(BACKUP_DIR, exist_ok=True)

bot = Bot(token=BACKUP_BOT_TOKEN)
dp = Dispatcher()

def parse_db_url(url: str):
    match = re.match(r"postgresql://([^:]+):([^@]+)@([^:/]+):(\d+)/(.+)", url)
    if not match:
        raise ValueError(f"Invalid DATABASE_URL: {url}")
    return match.groups()  # user, password, host, port, dbname

async def create_backup():
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    dump_file = f"{BACKUP_DIR}/backup_{timestamp}.sql"
    gz_file = f"{dump_file}.gz"

    user, password, host, port, dbname = parse_db_url(DATABASE_URL)
    env = os.environ.copy()
    env["PGPASSWORD"] = password

    result = subprocess.run(
        ["pg_dump", "-h", host, "-p", port, "-U", user, "-d", dbname,
         "--no-password", "--format=plain", "--encoding=UTF8"],
        env=env, capture_output=True, text=True
    )
    if result.returncode != 0:
        raise RuntimeError(f"pg_dump failed: {result.stderr[:500]}")

    with gzip.open(gz_file, "wt", encoding="utf-8") as f_out:
        f_out.write(result.stdout)

    size_mb = os.path.getsize(gz_file) / 1024 / 1024
    logger.info(f"Backup created: {gz_file} ({size_mb:.2f} MB)")
    return gz_file, size_mb

async def get_db_stats():
    try:
        conn = await asyncpg.connect(DATABASE_URL)
        sessions = await conn.fetchval("SELECT COUNT(*) FROM sessions")
        active = await conn.fetchval("SELECT COUNT(*) FROM sessions WHERE status='active'")
        users = await conn.fetchval("SELECT COUNT(*) FROM users")
        tasks = await conn.fetchval("SELECT COUNT(*) FROM tasks")
        orders = await conn.fetchval("SELECT COUNT(*) FROM orders WHERE status='confirmed'")
        await conn.close()
        return {"sessions": sessions, "active": active, "users": users, "tasks": tasks, "orders": orders}
    except Exception as e:
        logger.error(f"DB stats error: {e}")
        return {}

async def send_backup():
    try:
        gz_file, size_mb = await create_backup()
        stats = await get_db_stats()
        timestamp = datetime.now().strftime("%Y/%m/%d %H:%M")

        caption = (
            f"📦 *بکاپ خودکار سیستم*

"
            f"📅 تاریخ: `{timestamp}`
"
            f"💾 حجم: `{size_mb:.2f} MB`

"
            f"📊 *آمار دیتابیس:*
"
            f"📱 کل سشن‌ها: `{stats.get('sessions', 0):,}`
"
            f"🟢 سشن فعال: `{stats.get('active', 0):,}`
"
            f"👥 کاربران: `{stats.get('users', 0):,}`
"
            f"📋 تسک‌ها: `{stats.get('tasks', 0):,}`
"
            f"💰 سفارشات تأیید‌شده: `{stats.get('orders', 0):,}`

"
            f"✅ سیستم سالم است"
        )

        document = FSInputFile(gz_file, filename=os.path.basename(gz_file))
        await bot.send_document(
            chat_id=BACKUP_CHAT_ID,
            document=document,
            caption=caption,
            parse_mode="Markdown"
        )
        logger.info(f"Backup sent: {size_mb:.2f} MB")

        # نگه داشتن آخرین ۲۴ بکاپ
        backups = sorted([f for f in os.listdir(BACKUP_DIR) if f.endswith(".gz")])
        for old in backups[:-24]:
            try:
                os.remove(os.path.join(BACKUP_DIR, old))
            except Exception:
                pass

    except Exception as e:
        logger.error(f"Backup error: {e}")
        try:
            await bot.send_message(
                BACKUP_CHAT_ID,
                f"❌ *خطا در بکاپ‌گیری*

`{str(e)[:500]}`",
                parse_mode="Markdown"
            )
        except Exception:
            pass

def is_authorized(message: Message) -> bool:
    return message.chat.id == BACKUP_CHAT_ID

@dp.message(Command("start"))
async def cmd_start(message: Message):
    if not is_authorized(message):
        return
    await message.answer(
        "🤖 *بات بکاپ سیستم*

"
        "دستورات موجود:
"
        "/backup — بکاپ فوری
"
        "/status — وضعیت دیتابیس
"
        "/list — لیست بکاپ‌ها
"
        "/restore — راهنمای ریکاوری",
        parse_mode="Markdown"
    )

@dp.message(Command("backup"))
async def cmd_backup(message: Message):
    if not is_authorized(message):
        return
    msg = await message.answer("⏳ در حال ساخت بکاپ...")
    await send_backup()
    await msg.delete()

@dp.message(Command("status"))
async def cmd_status(message: Message):
    if not is_authorized(message):
        return
    stats = await get_db_stats()
    if not stats:
        return await message.answer("❌ خطا در اتصال به دیتابیس")
    await message.answer(
        f"📊 *وضعیت سیستم*

"
        f"📱 کل سشن‌ها: `{stats.get('sessions', 0):,}`
"
        f"🟢 سشن فعال: `{stats.get('active', 0):,}`
"
        f"👥 کاربران: `{stats.get('users', 0):,}`
"
        f"📋 تسک‌ها: `{stats.get('tasks', 0):,}`
"
        f"💰 سفارشات تأیید‌شده: `{stats.get('orders', 0):,}`",
        parse_mode="Markdown"
    )

@dp.message(Command("list"))
async def cmd_list(message: Message):
    if not is_authorized(message):
        return
    backups = sorted([f for f in os.listdir(BACKUP_DIR) if f.endswith(".gz")], reverse=True)
    if not backups:
        return await message.answer("📭 هیچ بکاپی موجود نیست.")
    lines = []
    for b in backups[:10]:
        size = os.path.getsize(os.path.join(BACKUP_DIR, b)) / 1024 / 1024
        lines.append(f"• `{b}` — {size:.1f} MB")
    await message.answer("📦 *بکاپ‌های موجود:*

" + "
".join(lines), parse_mode="Markdown")

@dp.message(Command("restore"))
async def cmd_restore(message: Message):
    if not is_authorized(message):
        return
    await message.answer(
        "🔄 *راهنمای ریکاوری*

"
        "۱. فایل بکاپ را دانلود کنید
"
        "۲. روی سرور اجرا کنید:

"
        "```bash
"
        "# Extract
"
        "gunzip backup_YYYYMMDD_HHMMSS.sql.gz

"
        "# Restore
"
        "docker exec -i smp_postgres psql \\
"
        "  -U $POSTGRES_USER \\
"
        "  -d $POSTGRES_DB \\
"
        "  < backup_YYYYMMDD_HHMMSS.sql
"
        "```",
        parse_mode="Markdown"
    )

async def backup_scheduler():
    logger.info(f"Backup scheduler started — interval: {BACKUP_INTERVAL_HOURS}h")
    # اولین بکاپ بعد از ۵ دقیقه
    await asyncio.sleep(300)
    while True:
        await send_backup()
        await asyncio.sleep(BACKUP_INTERVAL_HOURS * 3600)

async def main():
    if not BACKUP_BOT_TOKEN:
        logger.error("BACKUP_BOT_TOKEN not set!")
        return
    if not BACKUP_CHAT_ID:
        logger.error("BACKUP_CHAT_ID not set!")
        return
    logger.info("🤖 Backup bot starting...")
    asyncio.create_task(backup_scheduler())
    await dp.start_polling(bot, skip_updates=True)

if __name__ == "__main__":
    asyncio.run(main())
