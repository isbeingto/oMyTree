-- T1-1 Schema (idempotent)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- trees
CREATE TABLE IF NOT EXISTS trees (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic         TEXT NOT NULL,
  created_by    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- nodes
CREATE TABLE IF NOT EXISTS nodes (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tree_id        UUID NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  parent_id      UUID NULL REFERENCES nodes(id) ON DELETE SET NULL,
  level          INT  NOT NULL CHECK (level >= 0),
  role           TEXT NOT NULL CHECK (role IN ('user','ai','system')),
  text           TEXT NOT NULL DEFAULT '',
  soft_deleted_at TIMESTAMPTZ NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nodes_tree ON nodes(tree_id);
CREATE INDEX IF NOT EXISTS idx_nodes_parent ON nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_nodes_level ON nodes(level);

-- turns
CREATE TABLE IF NOT EXISTS turns (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  node_id     UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  user_text   TEXT NOT NULL DEFAULT '',
  ai_text     TEXT NOT NULL DEFAULT '',
  usage_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_turns_node ON turns(node_id);

-- events (Audit / EventBus)
CREATE TABLE IF NOT EXISTS events (
  id          BIGSERIAL PRIMARY KEY,
  event_type  TEXT NOT NULL,
  tree_id     UUID NULL,
  node_id     UUID NULL,
  turn_id     UUID NULL,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  trace_id    UUID NOT NULL DEFAULT uuid_generate_v4(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_type_time ON events(event_type, created_at DESC);

-- helper: safe-upsert unique root per tree
CREATE UNIQUE INDEX IF NOT EXISTS uq_root_node_per_tree
  ON nodes(tree_id)
  WHERE parent_id IS NULL AND level = 0;
