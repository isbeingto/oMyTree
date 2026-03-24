/**
 * TreeTrail event recorder
 * Writes append-only records into tree_trail_events table.
 */
const VALID_ACTORS = new Set(['user', 'assistant', 'system']);

function normalizeActor(value, fallback = 'system') {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return VALID_ACTORS.has(normalized) ? normalized : fallback;
}

function normalizeType(value) {
  if (typeof value !== 'string') {
    return 'UNKNOWN';
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toUpperCase() : 'UNKNOWN';
}

async function recordTrailEvent(client, { treeId, actor = 'system', type, nodeId = null, turnId = null, payload = {} }) {
  if (!client) return;
  const safePayload = payload && typeof payload === 'object' ? payload : {};
  await client.query(
    `INSERT INTO tree_trail_events (tree_id, actor, type, node_id, turn_id, payload)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [treeId, normalizeActor(actor), normalizeType(type), nodeId ?? null, turnId ?? null, JSON.stringify(safePayload)]
  );
}

export async function recordTurnAddedEvent(client, { treeId, turnId, nodeId = null, actor = 'system', routed = null, traceId = null }) {
  await recordTrailEvent(client, {
    treeId,
    actor,
    type: 'TURN_ADDED',
    nodeId,
    turnId,
    payload: {
      routed,
      trace_id: traceId || null,
    },
  });
}

export async function recordNodeCreatedEvent(client, { treeId, nodeId, actor = 'system', role, parentId = null, level = null, turnId = null, traceId = null, topicTag = null }) {
  await recordTrailEvent(client, {
    treeId,
    actor,
    type: 'NODE_CREATED',
    nodeId,
    turnId,
    payload: {
      role: role || null,
      parent_id: parentId || null,
      level: typeof level === 'number' ? level : null,
      trace_id: traceId || null,
      topic_tag: topicTag || null,
    },
  });
}

export async function recordBranchBurstEvent(client, { treeId, parentId = null, children = [], turnId = null, actor = 'system', traceId = null }) {
  const normalizedChildren = Array.isArray(children) ? children.map((child) => ({
    node_id: child?.node_id ?? child?.id ?? null,
    role: child?.role ?? null,
    parent_id: child?.parent_id ?? null,
    level: typeof child?.level === 'number' ? child.level : null,
  })).filter((child) => child.node_id) : [];

  await recordTrailEvent(client, {
    treeId,
    actor,
    type: 'BRANCH_BURST',
    nodeId: parentId || null,
    turnId,
    payload: {
      parent_id: parentId || null,
      children: normalizedChildren,
      trace_id: traceId || null,
    },
  });
}

export async function recordSnapshotCreatedEvent(client, { treeId, snapshotId, scopeNodeId = null, mode = null, basedOnSnapshotId = null, pinned = false, traceId = null }) {
  await recordTrailEvent(client, {
    treeId,
    actor: 'system',
    type: 'SNAPSHOT_CREATED',
    nodeId: scopeNodeId || null,
    payload: {
      snapshot_id: snapshotId,
      scope_node_id: scopeNodeId || null,
      mode: mode || null,
      based_on_snapshot_id: basedOnSnapshotId || null,
      pinned: Boolean(pinned),
      trace_id: traceId || null,
    },
  });
}

export function normalizeTrailActor(who) {
  return normalizeActor(who, 'user');
}
