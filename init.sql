-- Session Manager Pro - Database Schema
-- PostgreSQL 16

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ===== USERS TABLE =====
CREATE TABLE IF NOT EXISTS users (
    id BIGINT PRIMARY KEY,  -- Telegram user ID
    username VARCHAR(64),
    full_name VARCHAR(256) NOT NULL,
    language VARCHAR(8) DEFAULT 'fa',
    balance DECIMAL(18,6) DEFAULT 0,
    total_spent DECIMAL(18,6) DEFAULT 0,
    is_banned BOOLEAN DEFAULT FALSE,
    ban_reason TEXT,
    referral_code VARCHAR(16) UNIQUE DEFAULT substr(md5(random()::text), 1, 8),
    referred_by BIGINT REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== SESSIONS TABLE =====
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(20) UNIQUE NOT NULL,
    session_data TEXT NOT NULL,  -- AES-256 encrypted
    session_string TEXT,         -- Telethon session string (encrypted)
    status VARCHAR(32) DEFAULT 'active' CHECK (status IN ('active','deleted','logged_out','banned','flood','error','inactive')),
    api_id INTEGER,
    api_hash VARCHAR(64),
    proxy_id UUID,
    last_used TIMESTAMPTZ,
    last_checked TIMESTAMPTZ,
    error_count INTEGER DEFAULT 0,
    flood_until TIMESTAMPTZ,
    dc_id INTEGER,
    country VARCHAR(8),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== SESSION LOGS TABLE =====
CREATE TABLE IF NOT EXISTS session_logs (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    event VARCHAR(64) NOT NULL,
    details JSONB,
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== PROXIES TABLE =====
CREATE TABLE IF NOT EXISTS proxies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    host VARCHAR(256) NOT NULL,
    port INTEGER NOT NULL,
    proxy_type VARCHAR(16) DEFAULT 'socks5' CHECK (proxy_type IN ('socks5','socks4','http','mtproto')),
    username VARCHAR(128),
    password VARCHAR(128),
    is_active BOOLEAN DEFAULT TRUE,
    last_checked TIMESTAMPTZ,
    success_count INTEGER DEFAULT 0,
    fail_count INTEGER DEFAULT 0,
    avg_latency_ms INTEGER,
    country VARCHAR(8),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== TASKS TABLE =====
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id BIGINT REFERENCES users(id),
    type VARCHAR(32) NOT NULL CHECK (type IN ('join','leave','check_status')),
    target VARCHAR(512) NOT NULL,  -- channel/group link or ID
    target_type VARCHAR(16) DEFAULT 'link' CHECK (target_type IN ('link','id','username','search')),
    session_count INTEGER NOT NULL,
    sessions_done INTEGER DEFAULT 0,
    sessions_failed INTEGER DEFAULT 0,
    status VARCHAR(32) DEFAULT 'pending' CHECK (status IN ('pending','running','paused','completed','failed','cancelled')),
    auto_leave_after INTEGER,  -- minutes, NULL = never
    join_delay_min INTEGER DEFAULT 3,
    join_delay_max INTEGER DEFAULT 8,
    priority INTEGER DEFAULT 5,
    error_log JSONB DEFAULT '[]',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== TASK SESSIONS (many-to-many) =====
CREATE TABLE IF NOT EXISTS task_sessions (
    id BIGSERIAL PRIMARY KEY,
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    status VARCHAR(32) DEFAULT 'pending' CHECK (status IN ('pending','joined','failed','left','flood')),
    joined_at TIMESTAMPTZ,
    left_at TIMESTAMPTZ,
    error TEXT,
    UNIQUE(task_id, session_id)
);

-- ===== ORDERS TABLE =====
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id BIGINT REFERENCES users(id),
    amount DECIMAL(18,6) NOT NULL,
    currency VARCHAR(16) NOT NULL CHECK (currency IN ('USDT_TRC20','TON','TRX')),
    amount_crypto DECIMAL(18,8),
    wallet_address VARCHAR(256),
    tx_hash VARCHAR(256),
    screenshot_file_id VARCHAR(256),
    status VARCHAR(32) DEFAULT 'pending' CHECK (status IN ('pending','confirming','confirmed','rejected','expired')),
    admin_note TEXT,
    confirmed_by BIGINT,
    confirmed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '2 hours',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== PLANS TABLE =====
CREATE TABLE IF NOT EXISTS plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name_fa VARCHAR(128) NOT NULL,
    name_en VARCHAR(128) NOT NULL,
    session_count INTEGER NOT NULL,
    price_usd DECIMAL(10,2) NOT NULL,
    duration_days INTEGER,  -- NULL = unlimited
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== DISCOUNTS TABLE =====
CREATE TABLE IF NOT EXISTS discounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(32) UNIQUE NOT NULL,
    type VARCHAR(16) CHECK (type IN ('percent','fixed')),
    value DECIMAL(10,2) NOT NULL,
    max_uses INTEGER,
    used_count INTEGER DEFAULT 0,
    min_amount DECIMAL(10,2) DEFAULT 0,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== SETTINGS TABLE =====
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(128) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== INDEXES =====
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_phone ON sessions(phone);
CREATE INDEX idx_sessions_last_used ON sessions(last_used);
CREATE INDEX idx_session_logs_session_id ON session_logs(session_id);
CREATE INDEX idx_session_logs_created_at ON session_logs(created_at);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_task_sessions_task_id ON task_sessions(task_id);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);

-- ===== DEFAULT SETTINGS =====
INSERT INTO settings (key, value, description) VALUES
    ('join_delay_min', '3', 'Minimum delay between joins (seconds)'),
    ('join_delay_max', '8', 'Maximum delay between joins (seconds)'),
    ('max_retries', '3', 'Max retries on flood/error'),
    ('flood_multiplier', '1.5', 'Flood wait multiplier'),
    ('check_interval_minutes', '30', 'Session health check interval'),
    ('backup_interval_hours', '1', 'Backup interval in hours'),
    ('maintenance_mode', 'false', 'Maintenance mode'),
    ('min_deposit_usd', '5', 'Minimum deposit amount in USD'),
    ('usdt_rate', '1', 'USDT to USD rate'),
    ('ton_rate', '5', 'TON to USD rate'),
    ('trx_rate', '0.08', 'TRX to USD rate')
ON CONFLICT (key) DO NOTHING;

-- ===== TRIGGERS =====
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_sessions_updated BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
