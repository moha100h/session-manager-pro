# 🤖 Session Manager Pro

سیستم حرفه‌ای مدیریت سشن تلگرام — فارسی‌زبان، کامل و آماده استقرار

---

## 📋 امکانات

- 📱 **مدیریت سشن** — افزودن تکی و دسته‌ای، بررسی سلامت خودکار، تشخیص deleted/banned/flood
- 📋 **تسک‌های join/leave** — با تأخیر رندوم، خروج خودکار، pause/resume
- 💰 **پرداخت** — USDT (TRC20)، TON، TRX با تأیید دستی ادمین
- 🌐 **پروکسی رندوم** — SOCKS5/SOCKS4/HTTP برای هر سشن
- 📦 **پلن‌های فروش** — قابل تنظیم از پنل
- 🎟 **کدهای تخفیف** — درصدی و ثابت
- 📤 **بکاپ خودکار** — هر ۱ ساعت به تلگرام
- 🔐 **امنیت** — AES-256-GCM برای سشن‌ها، JWT، Rate Limiting
- 🌐 **پنل وب** — React، فارسی، RTL، نمودار real-time
- 🤖 **بات تلگرام** — پنل ادمین و کاربر کامل به فارسی

---

## 🏗 معماری

```
┌─────────────────────────────────────────────────────┐
│                    Nginx (Port 80)                   │
│              Rate Limiting + Reverse Proxy           │
└──────────────┬──────────────────┬───────────────────┘
               │                  │
        ┌──────▼──────┐    ┌──────▼──────┐
        │  FastAPI     │    │  React Web  │
        │  (Port 8000) │    │  (Port 3000)│
        └──────┬───────┘    └─────────────┘
               │
    ┌──────────┼──────────┐
    │          │          │
┌───▼───┐ ┌───▼───┐ ┌────▼────┐
│  PG   │ │ Redis │ │ Worker  │
│  DB   │ │ Cache │ │Telethon │
└───────┘ └───────┘ └─────────┘
               │
        ┌──────▼──────┐
        │  Backup Bot │
        │  (Hourly)   │
        └─────────────┘
```

---

## 🚀 راهنمای نصب روی لینوکس (Ubuntu 22.04)

### ۱. پیش‌نیازها

```bash
# بروزرسانی سیستم
sudo apt update && sudo apt upgrade -y

# نصب Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# نصب Docker Compose
sudo apt install docker-compose-plugin -y

# تأیید نصب
docker --version
docker compose version
```

### ۲. دریافت کد

```bash
git clone https://github.com/moha100h/session-manager-pro.git
cd session-manager-pro
```

### ۳. تنظیم متغیرهای محیطی

```bash
cp .env.example .env
nano .env
```

**متغیرهای ضروری که باید تنظیم کنید:**

```env
# ===== دیتابیس =====
POSTGRES_PASSWORD=یک_رمز_قوی_بگذارید

# ===== امنیت =====
JWT_SECRET=یک_رشته_تصادفی_۶۴_کاراکتری
ENCRYPTION_KEY=یک_رشته_تصادفی_۳۲_کاراکتری

# ===== ادمین =====
ADMIN_USERNAME=admin
ADMIN_PASSWORD=رمز_ادمین_قوی

# ===== بات تلگرام =====
BOT_TOKEN=توکن_بات_از_BotFather
ADMIN_IDS=آیدی_عددی_تلگرام_شما

# ===== بات بکاپ =====
BACKUP_BOT_TOKEN=توکن_بات_بکاپ_از_BotFather
BACKUP_CHAT_ID=آیدی_چت_بکاپ

# ===== Telegram API =====
API_ID=آیدی_از_my.telegram.org
API_HASH=هش_از_my.telegram.org

# ===== کیف پول‌ها =====
USDT_TRC20_WALLET=آدرس_کیف_پول_USDT_TRC20
TON_WALLET=آدرس_کیف_پول_TON
TRX_WALLET=آدرس_کیف_پول_TRX
```

**تولید کلیدهای تصادفی:**
```bash
# JWT Secret (64 کاراکتر)
openssl rand -hex 32

# Encryption Key (32 کاراکتر)
openssl rand -hex 16
```

### ۴. راه‌اندازی

```bash
# ساخت و اجرای همه سرویس‌ها
docker compose up -d --build

# مشاهده لاگ‌ها
docker compose logs -f

# بررسی وضعیت سرویس‌ها
docker compose ps
```

### ۵. تأیید راه‌اندازی

```bash
# بررسی API
curl http://localhost/api/health

# بررسی دیتابیس
docker compose exec postgres psql -U smp_user -d session_manager -c "\dt"

# بررسی Redis
docker compose exec redis redis-cli ping
```

---

## 📁 ساختار پروژه

```
session-manager-pro/
├── api/                    # FastAPI Backend
│   ├── main.py             # نقطه ورود API
│   ├── core/
│   │   ├── database.py     # اتصال PostgreSQL
│   │   ├── security.py     # JWT + AES-256-GCM
│   │   └── redis_client.py # Redis Cache + Queue
│   ├── routers/
│   │   ├── auth.py         # احراز هویت
│   │   ├── sessions.py     # مدیریت سشن‌ها
│   │   ├── tasks.py        # تسک‌های join/leave
│   │   ├── orders.py       # سفارشات پرداخت
│   │   ├── users.py        # مدیریت کاربران
│   │   ├── stats.py        # آمار و داشبورد
│   │   ├── proxies.py      # مدیریت پروکسی
│   │   └── settings.py     # تنظیمات + پلن + تخفیف
│   ├── Dockerfile
│   └── requirements.txt
│
├── worker/                 # Python Telethon Worker
│   ├── main.py             # موتور اصلی سشن‌ها
│   ├── Dockerfile
│   └── requirements.txt
│
├── bot/                    # Node.js Telegram Bot
│   ├── index.js            # بات تلگرام (ادمین + کاربر)
│   ├── Dockerfile
│   └── package.json
│
├── backup-bot/             # Python Backup Bot
│   ├── main.py             # بکاپ خودکار ساعتی
│   ├── Dockerfile
│   └── requirements.txt
│
├── web/                    # React Frontend
│   ├── src/
│   │   ├── App.js          # مسیریابی اصلی
│   │   ├── App.css         # استایل فارسی RTL
│   │   ├── api.js          # Axios helper
│   │   ├── index.js        # نقطه ورود React
│   │   ├── components/
│   │   │   └── Layout.js   # سایدبار + توپبار
│   │   └── pages/
│   │       ├── Login.js    # صفحه ورود
│   │       ├── Dashboard.js # داشبورد با نمودار
│   │       ├── Sessions.js  # مدیریت سشن‌ها
│   │       ├── Tasks.js     # مدیریت تسک‌ها
│   │       ├── Orders.js    # مدیریت سفارشات
│   │       ├── Users.js     # مدیریت کاربران
│   │       ├── Proxies.js   # مدیریت پروکسی‌ها
│   │       └── Settings.js  # تنظیمات سیستم
│   ├── public/index.html
│   ├── Dockerfile
│   └── package.json
│
├── nginx/
│   └── nginx.conf          # Reverse Proxy + Rate Limit
│
├── init.sql                # اسکیمای کامل دیتابیس
├── docker-compose.yml      # همه سرویس‌ها
├── .env.example            # نمونه متغیرهای محیطی
└── README.md
```

---

## 🔧 دستورات مفید

```bash
# مشاهده لاگ یک سرویس خاص
docker compose logs -f api
docker compose logs -f worker
docker compose logs -f bot

# ری‌استارت یک سرویس
docker compose restart worker

# ورود به دیتابیس
docker compose exec postgres psql -U smp_user -d session_manager

# بکاپ دستی
docker compose exec backup-bot python -c "import asyncio; from main import send_backup; asyncio.run(send_backup())"

# مشاهده صف تسک‌ها در Redis
docker compose exec redis redis-cli llen tasks:join

# آپدیت کد
git pull
docker compose up -d --build api worker bot web
```

---

## 🔐 امنیت

- تمام session string‌ها با **AES-256-GCM** رمزنگاری می‌شوند
- احراز هویت با **JWT** (HS256)
- **Rate Limiting** روی همه endpoint‌ها
- پنل وب فقط از طریق Nginx قابل دسترس است
- پیشنهاد: فایروال UFW را فعال کنید:

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS (اگر SSL دارید)
sudo ufw enable
```

---

## 📊 مقیاس‌پذیری

برای سشن‌های بیشتر، تعداد worker را افزایش دهید:

```bash
docker compose up -d --scale worker=3
```

---

## 🆘 رفع مشکلات رایج

**بات شروع نمی‌کند:**
```bash
docker compose logs bot
# بررسی BOT_TOKEN در .env
```

**Worker سشن‌ها را پردازش نمی‌کند:**
```bash
docker compose logs worker
# بررسی API_ID و API_HASH در .env
```

**دیتابیس وصل نمی‌شود:**
```bash
docker compose logs postgres
# بررسی POSTGRES_PASSWORD در .env
```

---

## 📞 پشتیبانی

برای گزارش باگ یا درخواست ویژگی، یک Issue در GitHub باز کنید.

---

*ساخته شده با ❤️ — تمام متون به فارسی*
