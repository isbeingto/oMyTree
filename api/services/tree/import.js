import crypto from "node:crypto";
import { validate as uuidValidate } from "uuid";

import { HttpError } from "../../lib/errors.js";
import { recomputeTreeCounters } from "./counters.js";

const VALID_NODE_ROLES = new Set(["user", "ai", "system"]);
const VALID_TURN_ROUTES = new Set(["in", "side", "new", null, ""]);

function normalizeString(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed;
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const pairs = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${pairs.join(",")}}`;
}

function computeImportHash(payload) {
  const serialized = stableStringify(payload);
  return crypto.createHash("sha256").update(serialized).digest("hex");
}

function coerceUuid(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }
  return uuidValidate(normalized) ? normalized : null;
}

function validateNodes(rawNodes) {
  if (!Array.isArray(rawNodes) || rawNodes.length === 0) {
    throw new HttpError({
      status: 422,
      code: "INVALID_IMPORT_PAYLOAD",
      message: "nodes array is required",
    });
  }

  const seen = new Set();
  const records = [];
  let rootCount = 0;

  rawNodes.forEach((node, index) => {
    if (!node || typeof node !== "object") {
      throw new HttpError({
        status: 422,
        code: "INVALID_NODE_PAYLOAD",
        message: `node at index ${index} must be an object`,
      });
    }

    const id = normalizeString(node.id);
    if (!uuidValidate(id)) {
      throw new HttpError({
        status: 422,
        code: "INVALID_NODE_ID",
        message: `node at index ${index} must have a valid uuid id`,
      });
    }

    if (seen.has(id)) {
      throw new HttpError({
        status: 422,
        code: "DUPLICATE_NODE_ID",
        message: `duplicate node id detected: ${id}`,
      });
    }

    const parentIdRaw = node.parent_id === null ? null : normalizeString(node.parent_id);
    if (parentIdRaw && !uuidValidate(parentIdRaw)) {
      throw new HttpError({
        status: 422,
        code: "INVALID_NODE_PARENT",
        message: `parent_id for node ${id} must be a uuid`,
      });
    }

    const level = Number(node.level);
    if (!Number.isInteger(level) || level < 0) {
      throw new HttpError({
        status: 422,
        code: "INVALID_NODE_LEVEL",
        message: `node ${id} must have a non-negative integer level`,
      });
    }

    const role = normalizeString(node.role).toLowerCase();
    if (!VALID_NODE_ROLES.has(role)) {
      throw new HttpError({
        status: 422,
        code: "INVALID_NODE_ROLE",
        message: `node ${id} has invalid role`,
      });
    }

    if (typeof node.text !== "string") {
      throw new HttpError({
        status: 422,
        code: "INVALID_NODE_TEXT",
        message: `node ${id} must have text`,
      });
    }

    const createdAt = node.created_at || null;
    const softDeletedAt = node.soft_deleted_at || null;

    if (!parentIdRaw) {
      rootCount += 1;
    }

    records.push({
      id,
      parent_id: parentIdRaw,
      level,
      role,
      text: node.text,
      created_at: createdAt,
      soft_deleted_at: softDeletedAt,
      index,
    });
    seen.add(id);
  });

  if (rootCount === 0) {
    throw new HttpError({
      status: 422,
      code: "MISSING_ROOT_NODE",
      message: "nodes payload must include at least one root node",
    });
  }

  return records;
}

function validateTurns(rawTurns = []) {
  if (!Array.isArray(rawTurns)) {
    throw new HttpError({
      status: 422,
      code: "INVALID_TURN_PAYLOAD",
      message: "turns must be an array",
    });
  }

  return rawTurns.map((turn, index) => {
    if (!turn || typeof turn !== "object") {
      throw new HttpError({
        status: 422,
        code: "INVALID_TURN_PAYLOAD",
        message: `turn at index ${index} must be an object`,
      });
    }
    const nodeId = normalizeString(turn.node_id);
    if (!uuidValidate(nodeId)) {
      throw new HttpError({
        status: 422,
        code: "INVALID_TURN_NODE_ID",
        message: `turn at index ${index} must reference a valid node_id`,
      });
    }
    const userText = typeof turn.user_text === "string" ? turn.user_text : "";
    const aiText = typeof turn.ai_text === "string" ? turn.ai_text : "";
    const usageJson = turn.usage_json && typeof turn.usage_json === "object" ? turn.usage_json : null;
    const status = normalizeString(turn.status) || "completed";
    const routedRaw = turn.routed === null || typeof turn.routed === "undefined" ? null : String(turn.routed);
    const routed = routedRaw === null ? "in" : routedRaw;
    if (!VALID_TURN_ROUTES.has(routed) && !VALID_TURN_ROUTES.has(routed?.toLowerCase?.())) {
      throw new HttpError({
        status: 422,
        code: "INVALID_TURN_ROUTE",
        message: `turn at index ${index} has invalid routed value`,
      });
    }
    const createdAt = turn.created_at || null;
    const softDeletedAt = turn.soft_deleted_at || null;

    return {
      node_id: nodeId,
      user_text: userText,
      ai_text: aiText,
      usage_json: usageJson,
      status,
      routed: routed?.toLowerCase?.() || "in",
      created_at: createdAt,
      soft_deleted_at: softDeletedAt,
    };
  });
}

function validateSummaries(rawSummaries = []) {
  if (!Array.isArray(rawSummaries)) {
    throw new HttpError({
      status: 422,
      code: "INVALID_SUMMARY_PAYLOAD",
      message: "summaries must be an array",
    });
  }
  return rawSummaries.map((summary, index) => {
    if (!summary || typeof summary !== "object") {
      throw new HttpError({
        status: 422,
        code: "INVALID_SUMMARY_PAYLOAD",
        message: `summary at index ${index} must be an object`,
      });
    }
    const nodeId = normalizeString(summary.node_id);
    if (!uuidValidate(nodeId)) {
      throw new HttpError({
        status: 422,
        code: "INVALID_SUMMARY_NODE_ID",
        message: `summary at index ${index} must reference a valid node_id`,
      });
    }
    const pathSummary = typeof summary.path_summary === "string" ? summary.path_summary : null;
    const parentSummary = typeof summary.parent_summary === "string" ? summary.parent_summary : null;
    const provider = typeof summary.provider === "string" ? summary.provider : null;
    const updatedAt = summary.updated_at || null;
    return {
      node_id: nodeId,
      path_summary: pathSummary,
      parent_summary: parentSummary,
      provider,
      updated_at: updatedAt,
    };
  });
}

async function findExistingBatch(pg, importHash, importBatchId) {
  const params = [importHash];
  let query = `SELECT new_tree_id FROM tree_import_batches WHERE import_hash = $1`;
  if (importBatchId) {
    params.push(importBatchId);
    query += ` OR (import_batch_id = $2)`;
  }
  query += ` LIMIT 1`;

  const { rows } = await pg.query(query, params);
  return rows[0] ?? null;
}

async function loadBatchStats(pg, treeId) {
  const nodesRes = await pg.query(`SELECT COUNT(*)::int AS count FROM nodes WHERE tree_id = $1`, [treeId]);
  const turnsRes = await pg.query(
    `SELECT COUNT(*)::int AS count
       FROM turns
       WHERE node_id IN (SELECT id FROM nodes WHERE tree_id = $1)`,
    [treeId],
  );
  const summariesRes = await pg.query(
    `SELECT COUNT(*)::int AS count
       FROM node_summaries
       WHERE node_id IN (SELECT id FROM nodes WHERE tree_id = $1)`,
    [treeId],
  );
  const softDeletedRes = await pg.query(
    `SELECT COUNT(*)::int AS count
       FROM nodes
       WHERE tree_id = $1 AND soft_deleted_at IS NOT NULL`,
    [treeId],
  );

  return {
    nodes: nodesRes.rows[0]?.count ?? 0,
    turns: turnsRes.rows[0]?.count ?? 0,
    summaries: summariesRes.rows[0]?.count ?? 0,
    soft_deleted: softDeletedRes.rows[0]?.count ?? 0,
  };
}

function resolveTreeCreatedBy(tree, sourceTreeId) {
  const source =
    normalizeString(tree?.created_by) ||
    normalizeString(tree?.id) ||
    (sourceTreeId ? `tree:${sourceTreeId}` : "");
  const safeSource = source.replace(/[^a-z0-9:_-]/gi, "").slice(0, 48);
  return `import:${safeSource || "unknown"}`;
}

function ensureSummaryReferences(summaries, nodeIdSet) {
  for (const summary of summaries) {
    if (!nodeIdSet.has(summary.node_id)) {
      throw new HttpError({
        status: 422,
        code: "INVALID_SUMMARY_REFERENCE",
        message: `summary references missing node ${summary.node_id}`,
      });
    }
  }
}

function ensureTurnReferences(turns, nodeIdSet) {
  for (const turn of turns) {
    if (!nodeIdSet.has(turn.node_id)) {
      throw new HttpError({
        status: 422,
        code: "INVALID_TURN_REFERENCE",
        message: `turn references missing node ${turn.node_id}`,
      });
    }
  }
}

function sortNodesTopologically(nodes) {
  return [...nodes].sort((a, b) => {
    if (a.level !== b.level) {
      return a.level - b.level;
    }
    return a.index - b.index;
  });
}

export async function importTree(pg, payload, { preserveSoftDeleted = true } = {}) {
  if (!payload || typeof payload !== "object") {
    throw new HttpError({
      status: 422,
      code: "INVALID_IMPORT_PAYLOAD",
      message: "payload must be a JSON object",
    });
  }

  const treeData = payload.tree;
  if (!treeData || typeof treeData !== "object") {
    throw new HttpError({
      status: 422,
      code: "INVALID_IMPORT_PAYLOAD",
      message: "tree payload is required",
    });
  }

  const topic = normalizeString(treeData.topic);
  if (!topic) {
    throw new HttpError({
      status: 422,
      code: "INVALID_TREE_TOPIC",
      message: "tree.topic is required",
    });
  }

  const nodes = validateNodes(payload.nodes);
  const turns = validateTurns(payload.turns || []);
  const summaries = validateSummaries(payload.summaries || []);
  const nodeIdSet = new Set(nodes.map((node) => node.id));
  ensureTurnReferences(turns, nodeIdSet);
  ensureSummaryReferences(summaries, nodeIdSet);

  const meta = typeof payload.meta === "object" && payload.meta !== null ? payload.meta : {};
  const providedBatchIdRaw =
    normalizeString(payload.import_batch_id) || normalizeString(meta.import_batch_id);
  const importBatchId = providedBatchIdRaw || null;
  const sourceTreeId = coerceUuid(meta.source_tree_id) || coerceUuid(treeData.id);

  const importHash = computeImportHash(payload);
  const existingBatch = await findExistingBatch(pg, importHash, importBatchId);
  if (existingBatch) {
    const stats = await loadBatchStats(pg, existingBatch.new_tree_id);
    const { rows } = await pg.query(
      `SELECT id, topic, created_by, status
       FROM trees
       WHERE id = $1
       LIMIT 1`,
      [existingBatch.new_tree_id],
    );
    const treeRow = rows[0] ?? null;
    return {
      ok: true,
      new_tree: treeRow,
      stats: {
        nodes_imported: stats.nodes,
        turns_imported: stats.turns,
        summaries_imported: stats.summaries,
        soft_deleted_nodes_imported: stats.soft_deleted,
      },
      meta: {
        source_tree_id: sourceTreeId,
        import_batch_id: importBatchId,
        import_hash: importHash,
        reused_existing: true,
        new_tree_id: existingBatch.new_tree_id,
      },
    };
  }

  await pg.query("BEGIN");
  try {
    const createdBy = resolveTreeCreatedBy(treeData, sourceTreeId);
    const treeInsert = await pg.query(
      `INSERT INTO trees (topic, created_by, status)
       VALUES ($1, $2, 'active')
       RETURNING id, topic, created_by, status, created_at`,
      [topic, createdBy],
    );
    const newTree = treeInsert.rows[0];
    const nodeIdMap = new Map();
    let softDeletedCount = 0;

    const sortedNodes = sortNodesTopologically(nodes);
    for (const node of sortedNodes) {
      const parentNewId = node.parent_id ? nodeIdMap.get(node.parent_id) : null;
      if (node.parent_id && !parentNewId) {
        throw new HttpError({
          status: 422,
          code: "MISSING_PARENT_NODE",
          message: `parent node ${node.parent_id} missing for child ${node.id}`,
        });
      }

      const insertResult = await pg.query(
        `INSERT INTO nodes (tree_id, parent_id, level, role, text, soft_deleted_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now()))
         RETURNING id`,
        [
          newTree.id,
          parentNewId,
          node.level,
          node.role,
          node.text,
          preserveSoftDeleted ? node.soft_deleted_at : null,
          node.created_at,
        ],
      );
      const newNodeId = insertResult.rows[0].id;
      if (preserveSoftDeleted && node.soft_deleted_at) {
        softDeletedCount += 1;
      }
      nodeIdMap.set(node.id, newNodeId);
    }

    let softDeletedTurnCount = 0;
    for (const turn of turns) {
      const mappedNodeId = nodeIdMap.get(turn.node_id);
      const softDeletedAt = preserveSoftDeleted ? turn.soft_deleted_at : null;
      if (softDeletedAt) {
        softDeletedTurnCount += 1;
      }
      await pg.query(
        `INSERT INTO turns (node_id, user_text, ai_text, usage_json, status, routed, created_at, soft_deleted_at)
         VALUES ($1, $2, $3, COALESCE($4::jsonb, '{}'::jsonb), $5, $6, COALESCE($7::timestamptz, now()), $8::timestamptz)`,
        [
          mappedNodeId,
          turn.user_text,
          turn.ai_text,
          turn.usage_json ? JSON.stringify(turn.usage_json) : null,
          turn.status || "completed",
          turn.routed || "in",
          turn.created_at,
          softDeletedAt,
        ],
      );
    }

    for (const summary of summaries) {
      const mappedNodeId = nodeIdMap.get(summary.node_id);
      await pg.query(
        `INSERT INTO node_summaries (node_id, path_summary, parent_summary, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()))
         ON CONFLICT (node_id) DO UPDATE SET
           path_summary = EXCLUDED.path_summary,
           parent_summary = EXCLUDED.parent_summary,
           updated_by = EXCLUDED.updated_by,
           updated_at = EXCLUDED.updated_at`,
        [
          mappedNodeId,
          summary.path_summary,
          summary.parent_summary,
          summary.provider,
          summary.updated_at,
        ],
      );
    }

    await pg.query(
      `INSERT INTO tree_import_batches (source_tree_id, import_hash, import_batch_id, new_tree_id)
       VALUES ($1, $2, $3, $4)`,
      [sourceTreeId, importHash, importBatchId, newTree.id],
    );

    await recomputeTreeCounters(pg, newTree.id);
    await pg.query("COMMIT");

    return {
      ok: true,
      new_tree: {
        id: newTree.id,
        topic: newTree.topic,
        created_by: newTree.created_by,
        status: newTree.status,
      },
      stats: {
        nodes_imported: nodes.length,
        turns_imported: turns.length,
        summaries_imported: summaries.length,
        soft_deleted_nodes_imported: softDeletedCount,
        soft_deleted_turns_imported: softDeletedTurnCount,
      },
      meta: {
        source_tree_id: sourceTreeId,
        import_batch_id: importBatchId,
        import_hash: importHash,
        reused_existing: false,
        new_tree_id: newTree.id,
      },
    };
  } catch (error) {
    await pg.query("ROLLBACK");
    throw error;
  }
}

export default {
  importTree,
};
