-- T31-4: Audit logs for core user/admin actions
-- Records who did what to which target with optional metadata (no secrets)

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role    TEXT NOT NULL DEFAULT 'system' CHECK (actor_role IN ('user','admin','system')),
  action        TEXT NOT NULL,
  target_type   TEXT,
  target_id     TEXT,
  ip            TEXT,
  trace_id      TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id);

COMMIT;
