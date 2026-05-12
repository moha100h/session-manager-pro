-- Session Manager Pro — اسکیمای دیتابیس
-- PostgreSQL 16
-- idempotent: می‌توان چندین بار اجرا کرد

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===== کاربران =====
CREATE TABLE IF NOT EXISTS users (
    id          BIGINT PRIMARY KEY,
    username    VARCHAR(64),
    full_name   VARCHAR(128) NOT NULL DEFAULT 'کاربر',
    language    VARCHAR(8)   NOT NULL DEFAULT 'fa',
    balance     DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_spent DECIMAL(12,2) NOT NULL DEFAULT 0,
    is_banned   BOOLEAN NOT NULL DEFAULT FALSE,
    ban_reason  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_is_banned ON users(is_banned);

-- ===== پروکسی‌ها =====
CREATE TABLE IF NOT EXISTS proxies (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    host            VARCHAR(256) NOT NULL,
    port            INTEGER      NOT NULL,
    proxy_type      VARCHAR(16)  NOT NULL DEFAULT 'socks5',
    username        VARCHAR(128),
    password        VARCHAR(256),
    country         VARCHAR(8),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    success_count   INTEGER NOT NULL DEFAULT 0,
    fail_count      INTEGER NOT NULL DEFAULT 0,
    avg_latency_ms  INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (host, port)
);
CREATE INDEX IF NOT EXISTS idx_proxies_is_active ON proxies(is_active);

-- ===== سشن‌ها =====
CREATE TABLE IF NOT EXISTS sessions (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone        VARCHAR(32) UNIQUE NOT NULL,
    session_data TEXT        NOT NULL,
    api_id       INTEGER,
    api_hash     VARCHAR(64),
    proxy_id     UUID REFERENCES proxies(id) ON DELETE SET NULL,
    status       VARCHAR(32) NOT NULL DEFAULT 'active',
    -- active | flood | banned | logged_out | deleted | error
    flood_until  TIMESTAMPTZ,
    error_count  INTEGER NOT NULL DEFAULT 0,
    last_checked TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_status       ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_last_checked ON sessions(last_checked);
CREATE INDEX IF NOT EXISTS idx_sessions_flood_until  ON sessions(flood_until) WHERE flood_until IS NOT NULL;

-- ===== لاگ سشن‌ها =====
CREATE TABLE IF NOT EXISTS session_logs (
    id         BIGSERIAL PRIMARY KEY,
    session_id UUID        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    event      VARCHAR(64) NOT NULL,
    -- joined | left | flood | banned | logged_out | deleted | error
    details    JSONB       NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_session_logs_session_id ON session_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_session_logs_event      ON session_logs(event);
CREATE INDEX IF NOT EXISTS idx_session_logs_created_at ON session_logs(created_at DESC);

-- ===== تسک‌ها =====
CREATE TABLE IF NOT EXISTS tasks (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          BIGINT REFERENCES users(id) ON DELETE SET NULL,
    type             VARCHAR(32) NOT NULL DEFAULT 'join',
    target           TEXT        NOT NULL,
    target_type      VARCHAR(16) NOT NULL DEFAULT 'link',
    session_count    INTEGER     NOT NULL,
    sessions_done    INTEGER     NOT NULL DEFAULT 0,
    sessions_failed  INTEGER     NOT NULL DEFAULT 0,
    status           VARCHAR(16) NOT NULL DEFAULT 'pending',
    -- pending | running | paused | completed | failed | cancelled
    priority         INTEGER     NOT NULL DEFAULT 5,
    join_delay_min   INTEGER     NOT NULL DEFAULT 3,
    join_delay_max   INTEGER     NOT NULL DEFAULT 8,
    auto_leave_after INTEGER,
    started_at       TIMESTAMPTZ,
    completed_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tasks_status    ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id   ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);

-- ===== سشن‌های تسک =====
CREATE TABLE IF NOT EXISTS task_sessions (
    task_id    UUID NOT NULL REFERENCES tasks(id)    ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    status     VARCHAR(16) NOT NULL DEFAULT 'pending',
    -- pending | joined | failed | left
    error      TEXT,
    joined_at  TIMESTAMPTZ,
    left_at    TIMESTAMPTZ,
    PRIMARY KEY (task_id, session_id)
);
CREATE INDEX IF NOT EXISTS idx_task_sessions_task_id    ON task_sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_sessions_session_id ON task_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_task_sessions_status     ON task_sessions(status);

-- ===== سفارشات =====
CREATE TABLE IF NOT EXISTS orders (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id            BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount             DECIMAL(12,2) NOT NULL,
    currency           VARCHAR(16)   NOT NULL,
    -- USDT_TRC20 | TON | TRX
    amount_crypto      DECIMAL(20,8),
    wallet_address     VARCHAR(256),
    tx_hash            VARCHAR(256),
    screenshot_file_id VARCHAR(256),
    discount_code      VARCHAR(32),
    discount_amount    DECIMAL(12,2) NOT NULL DEFAULT 0,
    status             VARCHAR(16)   NOT NULL DEFAULT 'pending',
    -- pending | confirming | confirmed | rejected | expired
    admin_note         TEXT,
    confirmed_by       BIGINT,
    confirmed_at       TIMESTAMPTZ,
    expires_at         TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_user_id    ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

-- ===== پلن‌ها =====
CREATE TABLE IF NOT EXISTS plans (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name_fa       VARCHAR(128) NOT NULL,
    name_en       VARCHAR(128) NOT NULL,
    session_count INTEGER      NOT NULL,
    price_usd     DECIMAL(10,2) NOT NULL,
    duration_days INTEGER,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===== تخفیف‌ها =====
CREATE TABLE IF NOT EXISTS discounts (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code       VARCHAR(32) UNIQUE NOT NULL,
    type       VARCHAR(16) NOT NULL DEFAULT 'percent',
    -- percent | fixed
    value      DECIMAL(10,2) NOT NULL,
    min_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    max_uses   INTEGER,
    used_count INTEGER NOT NULL DEFAULT 0,
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===== تنظیمات =====
CREATE TABLE IF NOT EXISTS settings (
    key         VARCHAR(64) PRIMARY KEY,
    value       TEXT        NOT NULL,
    description TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Trigger: updated_at خودکار ────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_users_updated_at') THEN
        CREATE TRIGGER trg_users_updated_at
            BEFORE UPDATE ON users
            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sessions_updated_at') THEN
        CREATE TRIGGER trg_sessions_updated_at
            BEFORE UPDATE ON sessions
            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tasks_updated_at') THEN
        CREATE TRIGGER trg_tasks_updated_at
            BEFORE UPDATE ON tasks
            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;
END $$;

-- ── مقادیر پیش‌فرض تنظیمات ───────────────────────────────────
INSERT INTO settings (key, value, description) VALUES
    ('join_delay_min',         '3',    'حداقل تأخیر بین join‌ها (ثانیه)'),
    ('join_delay_max',         '8',    'حداکثر تأخیر بین join‌ها (ثانیه)'),
    ('max_retries',            '3',    'حداکثر تلاش مجدد برای هر سشن'),
    ('flood_multiplier',       '1.5',  'ضریب زمان انتظار flood'),
    ('min_deposit_usd',        '5',    'حداقل مبلغ واریز (دلار)'),
    ('usdt_rate',              '1.0',  'نرخ تبدیل USDT به دلار'),
    ('ton_rate',               '0.2',  'نرخ تبدیل TON به دلار'),
    ('trx_rate',               '12.5', 'نرخ تبدیل TRX به دلار'),
    ('check_interval_minutes', '30',   'فاصله بررسی سلامت سشن‌ها (دقیقه)'),
    ('max_concurrent_joins',   '50',   'حداکثر join همزمان در هر worker'),
    ('order_expire_minutes',   '60',   'مدت انقضای سفارش (دقیقه)')
ON CONFLICT (key) DO NOTHING;

-- ── پلن‌های نمونه ─────────────────────────────────────────────
INSERT INTO plans (name_fa, name_en, session_count, price_usd, sort_order) VALUES
    ('پلن برنزی',  'Bronze Plan',  1000,  30,  1),
    ('پلن نقره‌ای', 'Silver Plan',  5000,  120, 2),
    ('پلن طلایی',  'Gold Plan',    10000, 200, 3),
    ('پلن الماس',  'Diamond Plan', 40000, 600, 4)
ON CONFLICT DO NOTHING;
