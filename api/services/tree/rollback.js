import { validate as uuidValidate } from "uuid";

import { HttpError } from "../../lib/errors.js";
import { recomputeTreeCounters } from "./counters.js";

const DEFAULT_OPERATOR = "cli";
const DEFAULT_REASON = "manual_rollback";

function normalizeUuid(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed;
}

function ensureTreeId(rawTreeId) {
  const treeId = normalizeUuid(rawTreeId);
  if (!uuidValidate(treeId)) {
    throw new HttpError({
      status: 422,
      code: "INVALID_TREE_ID",
      message: "tree_id must be a valid uuid",
    });
  }
  return treeId;
}

function parsePositiveInt(raw, fieldName = "count") {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new HttpError({
      status: 422,
      code: "INVALID_ROLLBACK_COUNT",
      message: `${fieldName} must be a positive integer`,
    });
  }
  return Math.trunc(value);
}

function normalizeOperator(raw) {
  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw.trim();
  }
  return DEFAULT_OPERATOR;
}

function normalizeReason(raw) {
  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw.trim();
  }
  return DEFAULT_REASON;
}

async function loadTree(pg, treeId, userId) {
  const { rows } = await pg.query(
    `SELECT id, topic, created_by, status, created_at
       FROM trees
      WHERE id = $1
        AND user_id = $2
      LIMIT 1`,
    [treeId, userId],
  );
  return rows[0] ?? null;
}

async function loadTurnsForTree(pg, treeId, userId) {
  const { rows } = await pg.query(
    `SELECT
        t.id,
        t.node_id,
        t.created_at,
        t.status,
        t.soft_deleted_at
       FROM turns t
       JOIN nodes n ON n.id = t.node_id
       JOIN trees tr ON tr.id = n.tree_id
      WHERE n.tree_id = $1
        AND tr.user_id = $2
   ORDER BY t.created_at ASC, t.id ASC`,
    [treeId, userId],
  );
  return rows;
}

function selectRollbackTargets(turns, requestedCount) {
  const totalTurns = turns.length;
  if (requestedCount > totalTurns) {
    throw new HttpError({
      status: 422,
      code: "ROLLBACK_EXCEEDS_HISTORY",
      message: "requested rollback count exceeds available turn history",
      detail: { requested: requestedCount, total: totalTurns },
    });
  }

  const targetTurns = [];
  let remaining = requestedCount;
  for (let idx = totalTurns - 1; idx >= 0 && remaining > 0; idx -= 1) {
    const current = turns[idx];
    if (!current.soft_deleted_at) {
      targetTurns.push(current);
    }
    remaining -= 1;
  }
  targetTurns.reverse();

  const pivotIndex = totalTurns - requestedCount - 1;
  const pivotTurn = pivotIndex >= 0 ? turns[pivotIndex] : null;

  return {
    targetTurns,
    pivotTurn,
    alreadyApplied: targetTurns.length === 0,
  };
}

async function computeImpactedNodes(pg, treeId, anchorNodeIds) {
  if (!Array.isArray(anchorNodeIds) || anchorNodeIds.length === 0) {
    return { total: 0, active: 0, sample: [] };
  }

  const { rows } = await pg.query(
    `WITH RECURSIVE subtree AS (
       SELECT id, soft_deleted_at
         FROM nodes
        WHERE tree_id = $1
          AND id = ANY($2::uuid[])
       UNION ALL
       SELECT n.id, n.soft_deleted_at
         FROM nodes n
         JOIN subtree s ON n.parent_id = s.id
        WHERE n.tree_id = $1
     ),
     dedup AS (
       SELECT DISTINCT id, soft_deleted_at FROM subtree
     ),
     sample AS (
       SELECT id
         FROM dedup
     ORDER BY id ASC
        LIMIT 16
     )
     SELECT
       (SELECT COUNT(*) FROM dedup)::bigint AS total_count,
       (
         SELECT COUNT(*) FROM dedup WHERE soft_deleted_at IS NULL
       )::bigint AS active_count,
       ARRAY(SELECT id FROM sample) AS sample_ids`,
    [treeId, anchorNodeIds],
  );

  const row = rows[0] ?? {};
  return {
    total: Number(row.total_count ?? 0),
    active: Number(row.active_count ?? 0),
    sample: Array.isArray(row.sample_ids) ? row.sample_ids : [],
  };
}

async function softDeleteNodes(pg, treeId, anchorNodeIds) {
  if (!Array.isArray(anchorNodeIds) || anchorNodeIds.length === 0) {
    return { count: 0, nodeIds: [] };
  }

  const { rows } = await pg.query(
    `WITH RECURSIVE subtree AS (
       SELECT id
         FROM nodes
        WHERE tree_id = $1
          AND id = ANY($2::uuid[])
       UNION ALL
       SELECT n.id
         FROM nodes n
         JOIN subtree s ON n.parent_id = s.id
        WHERE n.tree_id = $1
     ),
     dedup AS (
       SELECT DISTINCT id FROM subtree
     )
     UPDATE nodes AS target
        SET soft_deleted_at = now()
       FROM dedup
      WHERE target.id = dedup.id
        AND target.soft_deleted_at IS NULL
   RETURNING target.id`,
    [treeId, anchorNodeIds],
  );

  return {
    count: rows.length,
    nodeIds: rows.map((row) => row.id),
  };
}

async function softDeleteTurns(pg, turnIds) {
  if (!Array.isArray(turnIds) || turnIds.length === 0) {
    return { count: 0, turnIds: [] };
  }

  const { rows } = await pg.query(
    `UPDATE turns
        SET soft_deleted_at = now()
      WHERE id = ANY($1::uuid[])
        AND soft_deleted_at IS NULL
  RETURNING id`,
    [turnIds],
  );

  return {
    count: rows.length,
    turnIds: rows.map((row) => row.id),
  };
}

export async function previewTreeRollback(pg, params = {}) {
  const treeId = ensureTreeId(params.treeId ?? params.tree_id ?? params.id);
  const requestedTurns = parsePositiveInt(params.turns ?? params.n ?? params.turn_count ?? 0);
  const userId = typeof params.userId === "string" ? params.userId.trim() : "";
  if (!userId) {
    throw new HttpError({
      status: 422,
      code: "INVALID_USER_ID",
      message: "user_id is required",
    });
  }

  const tree = await loadTree(pg, treeId, userId);
  if (!tree) {
    throw new HttpError({
      status: 404,
      code: "TREE_NOT_FOUND",
      message: "tree not found",
    });
  }

  const turns = await loadTurnsForTree(pg, treeId, userId);
  if (turns.length === 0) {
    throw new HttpError({
      status: 422,
      code: "TREE_HAS_NO_TURNS",
      message: "tree has no turns to rollback",
    });
  }

  const { targetTurns, pivotTurn, alreadyApplied } = selectRollbackTargets(turns, requestedTurns);
  const anchorNodeIds = targetTurns.map((turn) => turn.node_id);
  const impact = await computeImpactedNodes(pg, treeId, anchorNodeIds);
  const activeTurns = turns.filter((turn) => !turn.soft_deleted_at).length;

  return {
    tree_id: treeId,
    tree_topic: tree.topic,
    requested_turns: requestedTurns,
    total_turns: turns.length,
    active_turns: activeTurns,
    rollback_to_turn: pivotTurn?.id ?? null,
    candidate_turn_ids: targetTurns.map((turn) => turn.id),
    candidate_node_ids: impact.sample,
    impacted_node_count: impact.active,
    already_rollbacked: alreadyApplied,
  };
}

export async function executeTreeRollback(pg, params = {}) {
  const treeId = ensureTreeId(params.treeId ?? params.tree_id ?? params.id);
  const requestedTurns = parsePositiveInt(params.turns ?? params.n ?? params.turn_count ?? 0);
  const operator = normalizeOperator(params.operator);
  const reason = normalizeReason(params.reason);
  const traceId = params.traceId ?? params.trace_id ?? null;
  const userId = typeof params.userId === "string" ? params.userId.trim() : "";
  if (!userId) {
    throw new HttpError({
      status: 422,
      code: "INVALID_USER_ID",
      message: "user_id is required",
    });
  }

  const tree = await loadTree(pg, treeId, userId);
  if (!tree) {
    throw new HttpError({
      status: 404,
      code: "TREE_NOT_FOUND",
      message: "tree not found",
    });
  }

  const turns = await loadTurnsForTree(pg, treeId, userId);
  if (turns.length === 0) {
    throw new HttpError({
      status: 422,
      code: "TREE_HAS_NO_TURNS",
      message: "tree has no turns to rollback",
    });
  }

  const { targetTurns, pivotTurn, alreadyApplied } = selectRollbackTargets(turns, requestedTurns);
  if (alreadyApplied) {
    return {
      ok: true,
      tree_id: treeId,
      requested_turns: requestedTurns,
      removed_turns: 0,
      removed_nodes: 0,
      rollback_to_turn: pivotTurn?.id ?? null,
      active_turns_before: turns.filter((turn) => !turn.soft_deleted_at).length,
      active_turns_after: turns.filter((turn) => !turn.soft_deleted_at).length,
      already_rollbacked: true,
    };
  }

  const anchorNodeIds = targetTurns.map((turn) => turn.node_id);
  const targetTurnIds = targetTurns.map((turn) => turn.id);
  const impactBefore = await computeImpactedNodes(pg, treeId, anchorNodeIds);
  const activeTurnsBefore = turns.filter((turn) => !turn.soft_deleted_at).length;

  await pg.query("BEGIN");
  try {
    const nodeResult = await softDeleteNodes(pg, treeId, anchorNodeIds);
    const turnResult = await softDeleteTurns(pg, targetTurnIds);

    const eventPayload = {
      tree_id: treeId,
      rollback_to_turn: pivotTurn?.id ?? null,
      requested_turns: requestedTurns,
      removed_turns: turnResult.count,
      removed_nodes: nodeResult.count,
      operator,
      reason,
      ts: new Date().toISOString(),
      stats: {
        total_turns: turns.length,
        active_turns_before: activeTurnsBefore,
        active_turns_after: Math.max(activeTurnsBefore - turnResult.count, 0),
        impacted_node_candidates: impactBefore.active,
      },
      anchors: {
        node_ids: anchorNodeIds,
        turn_ids: targetTurnIds,
      },
      samples: {
        node_ids: impactBefore.sample,
      },
    };

    await pg.query(
      `INSERT INTO events(event_type, tree_id, payload, trace_id)
       VALUES ($1, $2, $3::jsonb, COALESCE($4::uuid, uuid_generate_v4()))`,
      ["tree.rollbacked", treeId, JSON.stringify(eventPayload), traceId ?? null],
    );

    await recomputeTreeCounters(pg, treeId);
    await pg.query("COMMIT");

    return {
      ok: true,
      tree_id: treeId,
      rollback_to_turn: pivotTurn?.id ?? null,
      requested_turns: requestedTurns,
      removed_turns: turnResult.count,
      removed_nodes: nodeResult.count,
      active_turns_before: activeTurnsBefore,
      active_turns_after: Math.max(activeTurnsBefore - turnResult.count, 0),
      node_sample: impactBefore.sample,
      operator,
      reason,
    };
  } catch (err) {
    await pg.query("ROLLBACK");
    throw err;
  }
}

export default {
  previewTreeRollback,
  executeTreeRollback,
};
