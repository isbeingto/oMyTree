-- P0-DB-002 Workspaces and workspace members
-- Introduce workspace abstraction for ToC/Team tenant isolation.
-- NOTE: This migration is forward-only (no down). Rolling back requires a new forward fix.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('personal','team')),
  name TEXT NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  weknora_tenant_id BIGINT NULL,
  weknora_api_key_encrypted TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);

-- users.active_workspace_id (nullable)
DO $$
BEGIN
  IF to_regclass('users') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_attribute
      WHERE attrelid = to_regclass('users')
        AND attname = 'active_workspace_id'
        AND NOT attisdropped
    ) THEN
      ALTER TABLE users
        ADD COLUMN active_workspace_id uuid NULL;
    END IF;
  END IF;
END
$$;

-- FK: users.active_workspace_id -> workspaces.id
DO $$
BEGIN
  IF to_regclass('users') IS NOT NULL AND to_regclass('workspaces') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'users_active_workspace_id_fkey'
    ) THEN
      ALTER TABLE users
        ADD CONSTRAINT users_active_workspace_id_fkey
        FOREIGN KEY (active_workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL;
    END IF;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace_id ON workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_owner_user_id ON workspaces(owner_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_workspaces_personal_owner_user_id
  ON workspaces(owner_user_id)
  WHERE kind = 'personal';
CREATE INDEX IF NOT EXISTS idx_users_active_workspace_id ON users(active_workspace_id);

COMMIT;
