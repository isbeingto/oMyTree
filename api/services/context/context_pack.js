import { pool, getClient } from '../../db/pool.js';

const DEFAULT_LEDGER_KIND_LIMITS = {
  claim: 5,
  open_loop: 5,
  decision: 3,
  rejection: 3,
  evidence_mention: 3,
  note: 3,
};

const TRAIL_TYPES = [
  'BRANCH_BURST',
  'NODE_CREATED',
  'NODE_FOCUSED',
  'BRANCH_SWITCH',
  'SNAPSHOT_CREATED',
  'EVIDENCE_ATTACHED',
  'OUTCOME_SAVED',
  'NODE_MARKED',
];

function resolveKindLimit(kind, overrides = {}) {
  if (typeof overrides?.[kind] === 'number') {
    const v = Math.max(0, Math.floor(overrides[kind]));
    return v;
  }
  return DEFAULT_LEDGER_KIND_LIMITS[kind] ?? 0;
}

async function fetchPrevSnapshot(client, treeId, { preferPinned = true } = {}) {
  const snapshots = [];
  if (preferPinned) {
    const { rows } = await client.query(
      `SELECT id, tree_id, scope_node_id, ts, mode, based_on_snapshot_id, pinned
         FROM resume_snapshots
        WHERE tree_id = $1 AND pinned = true
        ORDER BY ts DESC
        LIMIT 1`,
      [treeId]
    );
    if (rows.length > 0) {
      snapshots.push(rows[0]);
    }
  }

  if (snapshots.length === 0) {
    const { rows } = await client.query(
      `SELECT id, tree_id, scope_node_id, ts, mode, based_on_snapshot_id, pinned
         FROM resume_snapshots
        WHERE tree_id = $1
        ORDER BY ts DESC
        LIMIT 1`,
      [treeId]
    );
    if (rows.length > 0) {
      snapshots.push(rows[0]);
    }
  }

  return snapshots.length > 0 ? snapshots[0] : null;
}

async function fetchLedgerDelta(client, treeId, sinceTs, kindLimits = {}) {
  const kinds = Object.keys(DEFAULT_LEDGER_KIND_LIMITS);
  const grouped = {};
  for (const kind of kinds) {
    const limit = resolveKindLimit(kind, kindLimits);
    if (limit <= 0) {
      grouped[kind] = [];
      continue;
    }
    const { rows } = await client.query(
      `SELECT id, tree_id, ts, kind, subkind, text, sources, confidence, payload
         FROM semantic_ledger_atoms
        WHERE tree_id = $1
          AND ($2::timestamptz IS NULL OR ts > $2)
          AND kind = $3
        ORDER BY ts DESC
        LIMIT $4`,
      [treeId, sinceTs, kind, limit]
    );
    grouped[kind] = rows.map((row) => ({
      id: row.id,
      ts: row.ts,
      kind: row.kind,
      subkind: row.subkind,
      text: row.text,
      sources: row.sources,
      confidence: row.confidence,
      payload: row.payload,
    }));
  }

  return {
    since_ts: sinceTs,
    groups: grouped,
  };
}

async function fetchTrailDelta(client, treeId, sinceTs, trailLimit = 50) {
  const { rows } = await client.query(
    `SELECT type, actor, ts, node_id, turn_id, payload
       FROM tree_trail_events
      WHERE tree_id = $1
        AND ($2::timestamptz IS NULL OR ts > $2)
        AND type = ANY($3)
      ORDER BY ts DESC
      LIMIT $4`,
    [treeId, sinceTs, TRAIL_TYPES, trailLimit]
  );

  return {
    since_ts: sinceTs,
    events: rows,
  };
}

async function fetchDeltaSummary(client, treeId, sinceTs) {
  if (!sinceTs) {
    return null;
  }

  const [nodesRes, evidenceRes] = await Promise.all([
    client.query(
      `SELECT COUNT(*)::int AS count
         FROM nodes
        WHERE tree_id = $1
          AND created_at > $2
          AND soft_deleted_at IS NULL`,
      [treeId, sinceTs]
    ),
    client.query(
      `SELECT COUNT(*)::int AS count
         FROM semantic_ledger_atoms
        WHERE tree_id = $1
          AND kind = 'evidence_mention'
          AND ts > $2`,
      [treeId, sinceTs]
    ),
  ]);

  return {
    since_ts: new Date(sinceTs).toISOString(),
    nodes: Number(nodesRes.rows[0]?.count ?? 0),
    evidence: Number(evidenceRes.rows[0]?.count ?? 0),
  };
}

async function fetchNodePath(client, nodeId, maxDepth = 16) {
  const path = [];
  let currentId = nodeId;
  for (let i = 0; i < maxDepth && currentId; i += 1) {
    const { rows } = await client.query(
      `SELECT id, parent_id, text, role
         FROM nodes
        WHERE id = $1`,
      [currentId]
    );
    if (rows.length === 0) {
      break;
    }
    const node = rows[0];
    path.push({
      id: node.id,
      role: node.role,
      text: node.text,
    });
    currentId = node.parent_id;
  }
  return path;
}

async function fetchFocusContext(client, treeId) {
  const preferred = await client.query(
    `SELECT node_id, ts, type
       FROM tree_trail_events
      WHERE tree_id = $1
        AND node_id IS NOT NULL
        AND type IN ('NODE_FOCUSED', 'BRANCH_SWITCH')
      ORDER BY ts DESC
      LIMIT 1`,
    [treeId]
  );

  let focusRow = preferred.rows[0] || null;
  if (!focusRow) {
    const fallback = await client.query(
      `SELECT node_id, ts, type
         FROM tree_trail_events
        WHERE tree_id = $1
          AND node_id IS NOT NULL
        ORDER BY ts DESC
        LIMIT 1`,
      [treeId]
    );
    focusRow = fallback.rows[0] || null;
  }

  if (!focusRow) {
    const turnRow = await client.query(
      `SELECT n.id as node_id, t.created_at as ts
         FROM turns t
         JOIN nodes n ON n.id = t.node_id
        WHERE n.tree_id = $1
        ORDER BY t.created_at DESC
        LIMIT 1`,
      [treeId]
    );
    focusRow = turnRow.rows[0] || null;
  }

  if (!focusRow) {
    return null;
  }

  const path = await fetchNodePath(client, focusRow.node_id);
  return {
    node_id: focusRow.node_id,
    last_seen_ts: focusRow.ts,
    source: focusRow.type || 'latest_activity',
    path,
  };
}

export async function buildContextPack(treeId, {
  preferPinnedSnapshot = true,
  ledgerKindLimits = {},
  trailLimit = 50,
} = {}) {
  if (!treeId) {
    throw new Error('treeId is required');
  }

  const client = await getClient();
  try {
    const prevSnapshot = await fetchPrevSnapshot(client, treeId, { preferPinned: preferPinnedSnapshot });
    const sinceTs = prevSnapshot?.ts ?? null;

    const [ledgerDelta, trailDelta, focusContext, deltaSummary] = await Promise.all([
      fetchLedgerDelta(client, treeId, sinceTs, ledgerKindLimits),
      fetchTrailDelta(client, treeId, sinceTs, trailLimit),
      fetchFocusContext(client, treeId),
      fetchDeltaSummary(client, treeId, sinceTs),
    ]);

    return {
      tree_id: treeId,
      prev_snapshot: prevSnapshot,
      delta_ledger: ledgerDelta,
      trail_summary_delta: trailDelta,
      focus_context: focusContext,
      delta_summary: deltaSummary,
    };
  } finally {
    client.release();
  }
}

export default buildContextPack;
