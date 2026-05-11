-- Session Manager Pro — اسکیمای دیتابیس
-- PostgreSQL 16

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===== کاربران =====
CREATE TABLE IF NOT EXISTS users (
    id BIGINT PRIMARY KEY,
    username VARCHAR(64),
    full_name VARCHAR(128) NOT NULL DEFAULT 'کاربر',
    language VARCHAR(8) NOT NULL DEFAULT 'fa',
    balance DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_spent DECIMAL(12,2) NOT NULL DEFAULT 0,
    is_banned BOOLEAN NOT NULL DEFAULT FALSE,
    ban_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===== پروکسی‌ها =====
CREATE TABLE IF NOT EXISTS proxies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    host VARCHAR(256) NOT NULL,
    port INTEGER NOT NULL,
    proxy_type VARCHAR(16) NOT NULL DEFAULT 'socks5',
    username VARCHAR(128),
    password VARCHAR(256),
    country VARCHAR(8),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    success_count INTEGER NOT NULL DEFAULT 0,
    fail_count INTEGER NOT NULL DEFAULT 0,
    avg_latency_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===== سشن‌ها =====
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(32) UNIQUE NOT NULL,
    session_string TEXT NOT NULL,
    session_data TEXT NOT NULL,
    api_id INTEGER,
    api_hash VARCHAR(64),
    proxy_id UUID REFERENCES proxies(id) ON DELETE SET NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    -- active | logged_out | deleted | banned | flood | error | inactive
    flood_until TIMESTAMPTZ,
    error_count INTEGER NOT NULL DEFAULT 0,
    last_used TIMESTAMPTZ,
    last_checked TIMESTAMPTZ,
    country VARCHAR(8),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_phone ON sessions(phone);

-- ===== لاگ سشن‌ها =====
CREATE TABLE IF NOT EXISTS session_logs (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    event VARCHAR(64) NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_logs_session_id ON session_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_session_logs_created_at ON session_logs(created_at);

-- ===== تسک‌ها =====
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    type VARCHAR(16) NOT NULL DEFAULT 'join',
    -- join | leave
    target TEXT NOT NULL,
    target_type VARCHAR(16) NOT NULL DEFAULT 'link',
    -- link | username | id
    session_count INTEGER NOT NULL DEFAULT 0,
    sessions_done INTEGER NOT NULL DEFAULT 0,
    sessions_failed INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    -- pending | running | paused | completed | failed | cancelled
    priority INTEGER NOT NULL DEFAULT 5,
    join_delay_min INTEGER NOT NULL DEFAULT 3,
    join_delay_max INTEGER NOT NULL DEFAULT 8,
    auto_leave_after INTEGER,
    -- دقیقه
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);

-- ===== سشن‌های تسک =====
CREATE TABLE IF NOT EXISTS task_sessions (
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    -- pending | joined | failed | left
    error TEXT,
    joined_at TIMESTAMPTZ,
    left_at TIMESTAMPTZ,
    PRIMARY KEY (task_id, session_id)
);

-- ===== سفارشات =====
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(12,2) NOT NULL,
    currency VARCHAR(16) NOT NULL,
    -- USDT_TRC20 | TON | TRX
    amount_crypto DECIMAL(20,8),
    wallet_address VARCHAR(256),
    tx_hash VARCHAR(256),
    screenshot_file_id VARCHAR(256),
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    -- pending | confirming | confirmed | rejected | expired
    admin_note TEXT,
    confirmed_by BIGINT,
    confirmed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);

-- ===== پلن‌ها =====
CREATE TABLE IF NOT EXISTS plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name_fa VARCHAR(128) NOT NULL,
    name_en VARCHAR(128) NOT NULL,
    session_count INTEGER NOT NULL,
    price_usd DECIMAL(10,2) NOT NULL,
    duration_days INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===== تخفیف‌ها =====
CREATE TABLE IF NOT EXISTS discounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(32) UNIQUE NOT NULL,
    type VARCHAR(16) NOT NULL DEFAULT 'percent',
    -- percent | fixed
    value DECIMAL(10,2) NOT NULL,
    min_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    max_uses INTEGER,
    used_count INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===== تنظیمات =====
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(64) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- مقادیر پیش‌فرض تنظیمات
INSERT INTO settings (key, value, description) VALUES
    ('join_delay_min', '3', 'حداقل تأخیر بین join‌ها (ثانیه)'),
    ('join_delay_max', '8', 'حداکثر تأخیر بین join‌ها (ثانیه)'),
    ('max_retries', '3', 'حداکثر تلاش مجدد برای هر سشن'),
    ('flood_multiplier', '1.5', 'ضریب زمان انتظار flood'),
    ('min_deposit_usd', '5', 'حداقل مبلغ واریز (دلار)'),
    ('usdt_rate', '1.0', 'نرخ تبدیل USDT به دلار'),
    ('ton_rate', '0.2', 'نرخ تبدیل TON به دلار'),
    ('trx_rate', '12.5', 'نرخ تبدیل TRX به دلار'),
    ('check_interval_minutes', '30', 'فاصله بررسی سلامت سشن‌ها (دقیقه)'),
    ('max_concurrent_joins', '50', 'حداکثر join همزمان در هر worker')
ON CONFLICT (key) DO NOTHING;

-- پلن‌های نمونه
INSERT INTO plans (name_fa, name_en, session_count, price_usd, sort_order) VALUES
    ('پلن برنزی', 'Bronze Plan', 1000, 30, 1),
    ('پلن نقره‌ای', 'Silver Plan', 5000, 120, 2),
    ('پلن طلایی', 'Gold Plan', 10000, 200, 3),
    ('پلن الماس', 'Diamond Plan', 40000, 600, 4)
ON CONFLICT DO NOTHING;
