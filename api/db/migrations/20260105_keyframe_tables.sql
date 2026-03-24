-- 20260105_keyframe_tables.sql
-- Phase 1 (User Curation): keyframes table (方案 A)

CREATE TABLE IF NOT EXISTS keyframes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tree_id    uuid NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  node_id    uuid NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  annotation text,
  is_pinned  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT keyframes_user_node_unique UNIQUE (user_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_keyframes_tree ON keyframes(tree_id);
