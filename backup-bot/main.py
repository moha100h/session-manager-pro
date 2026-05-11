import asyncio
import os
import logging
import subprocess
import gzip
import shutil
from datetime import datetime
import aiofiles
import aiogram
from aiogram import Bot, Dispatcher
from aiogram.filters import Command
from aiogram.types import Message, FSInputFile
import asyncpg

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("backup-bot")

BACKUP_BOT_TOKEN = os.getenv("BACKUP_BOT_TOKEN")
BACKUP_CHAT_ID = int(os.getenv("BACKUP_CHAT_ID", "0"))
DB_URL = os.getenv("DATABASE_URL")
BACKUP_DIR = "/app/backups"
BACKUP_INTERVAL_HOURS = int(os.getenv("BACKUP_INTERVAL_HOURS", "1"))

os.makedirs(BACKUP_DIR, exist_ok=True)

bot = Bot(token=BACKUP_BOT_TOKEN)
dp = Dispatcher()

async def create_backup() -> str:
    """ساخت بکاپ از PostgreSQL"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    dump_file = f"{BACKUP_DIR}/backup_{timestamp}.sql"
    gz_file = f"{dump_file}.gz"

    # Parse DB URL
    import re
    match = re.match(r"postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)", DB_URL)
    if not match:
        raise ValueError("Invalid DATABASE_URL format")
    user, password, host, port, dbname = match.groups()

    env = os.environ.copy()
    env["PGPASSWORD"] = password

    result = subprocess.run(
        ["pg_dump", "-h", host, "-p", port, "-U", user, "-d", dbname,
         "--no-password", "--format=plain", "--encoding=UTF8", "-f", dump_file],
        env=env, capture_output=True, text=True
    )

    if result.returncode != 0:
        raise RuntimeError(f"pg_dump failed: {result.stderr}")

    # Compress
    with open(dump_file, "rb") as f_in:
        with gzip.open(gz_file, "wb") as f_out:
            shutil.copyfileobj(f_in, f_out)

    os.remove(dump_file)
    size_mb = os.path.getsize(gz_file) / 1024 / 1024
    logger.info(f"Backup created: {gz_file} ({size_mb:.2f} MB)")
    return gz_file, size_mb

async def send_backup():
    """ارسال بکاپ به تلگرام"""
    try:
        gz_file, size_mb = await create_backup()
        timestamp = datetime.now().strftime("%Y/%m/%d %H:%M")

        # Get DB stats
        conn = await asyncpg.connect(DB_URL)
        sessions_count = await conn.fetchval("SELECT COUNT(*) FROM sessions")
        users_count = await conn.fetchval("SELECT COUNT(*) FROM users")
        tasks_count = await conn.fetchval("SELECT COUNT(*) FROM tasks")
        await conn.close()

        caption = (
            f"📦 *بکاپ خودکار سیستم*

"
            f"📅 تاریخ: {timestamp}
"
            f"💾 حجم: {size_mb:.2f} MB

"
            f"📊 *آمار دیتابیس:*
"
            f"📱 سشن‌ها: {sessions_count:,}
"
            f"👥 کاربران: {users_count:,}
"
            f"📋 تسک‌ها: {tasks_count:,}

"
            f"✅ برای ریکاوری: /restore"
        )

        document = FSInputFile(gz_file, filename=os.path.basename(gz_file))
        await bot.send_document(
            chat_id=BACKUP_CHAT_ID,
            document=document,
            caption=caption,
            parse_mode="Markdown"
        )
        logger.info(f"Backup sent to Telegram: {size_mb:.2f} MB")

        # Cleanup old backups (keep last 24)
        backups = sorted([f for f in os.listdir(BACKUP_DIR) if f.endswith(".gz")])
        for old in backups[:-24]:
            os.remove(os.path.join(BACKUP_DIR, old))

    except Exception as e:
        logger.error(f"Backup error: {e}")
        await bot.send_message(BACKUP_CHAT_ID, f"❌ خطا در بکاپ‌گیری:
`{str(e)}`", parse_mode="Markdown")

@dp.message(Command("start"))
async def cmd_start(message: Message):
    if message.chat.id != BACKUP_CHAT_ID:
        return
    await message.answer(
        "🤖 *بات بکاپ سیستم*

"
        "دستورات:
"
        "/backup — بکاپ فوری
"
        "/status — وضعیت سیستم
"
        "/list — لیست بکاپ‌ها
"
        "/restore — راهنمای ریکاوری",
        parse_mode="Markdown"
    )

@dp.message(Command("backup"))
async def cmd_backup(message: Message):
    if message.chat.id != BACKUP_CHAT_ID:
        return
    await message.answer("⏳ در حال ساخت بکاپ...")
    await send_backup()

@dp.message(Command("status"))
async def cmd_status(message: Message):
    if message.chat.id != BACKUP_CHAT_ID:
        return
    try:
        conn = await asyncpg.connect(DB_URL)
        sessions = await conn.fetch("SELECT status, COUNT(*) as count FROM sessions GROUP BY status")
        tasks = await conn.fetch("SELECT status, COUNT(*) as count FROM tasks GROUP BY status")
        await conn.close()

        sessions_text = "
".join([f"  {r['status']}: {r['count']:,}" for r in sessions])
        tasks_text = "
".join([f"  {r['status']}: {r['count']:,}" for r in tasks])

        await message.answer(
            f"📊 *وضعیت سیستم*

"
            f"📱 *سشن‌ها:*
{sessions_text}

"
            f"📋 *تسک‌ها:*
{tasks_text}",
            parse_mode="Markdown"
        )
    except Exception as e:
        await message.answer(f"❌ خطا: {e}")

@dp.message(Command("list"))
async def cmd_list(message: Message):
    if message.chat.id != BACKUP_CHAT_ID:
        return
    backups = sorted([f for f in os.listdir(BACKUP_DIR) if f.endswith(".gz")], reverse=True)
    if not backups:
        return await message.answer("📭 هیچ بکاپی موجود نیست.")
    text = "📦 *بکاپ‌های موجود:*

"
    for b in backups[:10]:
        size = os.path.getsize(os.path.join(BACKUP_DIR, b)) / 1024 / 1024
        text += f"• `{b}` — {size:.1f} MB
"
    await message.answer(text, parse_mode="Markdown")

@dp.message(Command("restore"))
async def cmd_restore(message: Message):
    if message.chat.id != BACKUP_CHAT_ID:
        return
    await message.answer(
        "🔄 *راهنمای ریکاوری*

"
        "1. فایل بکاپ را دانلود کنید
"
        "2. روی سرور اجرا کنید:

"
        "```bash
"
        "# Extract
"
        "gunzip backup_YYYYMMDD_HHMMSS.sql.gz

"
        "# Restore
"
        "docker exec -i smp_postgres psql \
"
        "  -U $POSTGRES_USER \
"
        "  -d $POSTGRES_DB \
"
        "  < backup_YYYYMMDD_HHMMSS.sql
"
        "```",
        parse_mode="Markdown"
    )

async def backup_scheduler():
    """زمان‌بند بکاپ خودکار"""
    while True:
        await asyncio.sleep(BACKUP_INTERVAL_HOURS * 3600)
        logger.info("Running scheduled backup...")
        await send_backup()

async def main():
    logger.info(f"🤖 Backup bot started (interval: {BACKUP_INTERVAL_HOURS}h)")
    asyncio.create_task(backup_scheduler())
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
