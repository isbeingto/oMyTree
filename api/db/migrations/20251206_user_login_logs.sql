-- 20251206_user_login_logs.sql
-- User Login Logs: 记录用户登录/注册的详细信息
-- 包含 IP 地址、设备型号（User-Agent）、登录方式等

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS user_login_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL CHECK (event_type IN ('register', 'login', 'logout', 'password_change', 'password_reset')),
  ip_address    TEXT,
  user_agent    TEXT,
  device_type   TEXT,      -- 从 user_agent 解析: 'desktop', 'mobile', 'tablet', 'unknown'
  browser       TEXT,      -- 从 user_agent 解析: 'Chrome', 'Firefox', 'Safari', etc.
  os            TEXT,      -- 从 user_agent 解析: 'Windows', 'macOS', 'Linux', 'Android', 'iOS', etc.
  auth_method   TEXT DEFAULT 'credentials', -- 'credentials', 'google', 'github', etc.
  success       BOOLEAN NOT NULL DEFAULT true,
  failure_reason TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_user_login_logs_user_id ON user_login_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_login_logs_user_created ON user_login_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_login_logs_event_type ON user_login_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_user_login_logs_created_at ON user_login_logs(created_at DESC);

-- 更新 users 表添加 last_login 相关字段
DO $$
BEGIN
  -- 添加 last_login_at 字段
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'last_login_at'
  ) THEN
    ALTER TABLE users ADD COLUMN last_login_at TIMESTAMPTZ;
  END IF;

  -- 添加 last_login_ip 字段
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'last_login_ip'
  ) THEN
    ALTER TABLE users ADD COLUMN last_login_ip TEXT;
  END IF;

  -- 添加 register_ip 字段
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'register_ip'
  ) THEN
    ALTER TABLE users ADD COLUMN register_ip TEXT;
  END IF;
END
$$;

COMMENT ON TABLE user_login_logs IS '用户登录日志：记录登录/注册/登出/密码修改等事件';
COMMENT ON COLUMN user_login_logs.event_type IS '事件类型：register=注册, login=登录, logout=登出, password_change=修改密码, password_reset=重置密码';
COMMENT ON COLUMN user_login_logs.device_type IS '设备类型：desktop/mobile/tablet/unknown，从 user_agent 解析';
COMMENT ON COLUMN user_login_logs.auth_method IS '认证方式：credentials=邮箱密码, google=Google OAuth, github=GitHub OAuth';

COMMIT;
