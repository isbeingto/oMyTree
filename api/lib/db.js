let schemaEnsured = false;

const ensureStatements = [
  `CREATE TABLE IF NOT EXISTS tree_index (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS tree_node (
    tree_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    parent_id TEXT,
    title TEXT NOT NULL,
    summary TEXT,
    status TEXT NOT NULL,
    trace_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tree_id, node_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tree_node_tree_status ON tree_node(tree_id, status)`,
  `CREATE TABLE IF NOT EXISTS branch_candidate (
    tree_id TEXT NOT NULL,
    candidate_id TEXT PRIMARY KEY,
    parent_id TEXT,
    title TEXT NOT NULL,
    summary TEXT,
    status TEXT NOT NULL,
    trace_id TEXT,
    confirmed_node_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS tree_event (
    id BIGSERIAL PRIMARY KEY,
    tree_id TEXT NOT NULL,
    event_id TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    payload JSONB NOT NULL,
    trace_id TEXT,
    ts TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tree_event_tree_ts ON tree_event(tree_id, ts, id)`,
];

export async function ensureCoreSchema(pg) {
  if (schemaEnsured) {
    return;
  }

  for (const statement of ensureStatements) {
    await pg.query(statement);
  }

  schemaEnsured = true;
}

export async function touchTree(pg, treeId, title = null) {
  await ensureCoreSchema(pg);
  await pg.query(
    `INSERT INTO tree_index(id, title) VALUES ($1, COALESCE($2, $1))
     ON CONFLICT (id) DO UPDATE SET updated_at = now()`,
    [treeId, title]
  );
}

export async function ensureNode(pg, treeId, nodeId, { title = "", summary = null, status = "confirmed", traceId = null, parentId = null } = {}) {
  await ensureCoreSchema(pg);
  await pg.query(
    `INSERT INTO tree_node(tree_id, node_id, parent_id, title, summary, status, trace_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT(tree_id, node_id) DO UPDATE SET
       parent_id = EXCLUDED.parent_id,
       title = EXCLUDED.title,
       summary = EXCLUDED.summary,
       status = EXCLUDED.status,
       trace_id = EXCLUDED.trace_id,
       updated_at = now()`,
    [treeId, nodeId, parentId, title, summary, status, traceId]
  );
}
