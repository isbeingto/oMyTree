import { pool } from "../../db/pool.js";

function normalizeTreeId(raw) {
  if (typeof raw !== "string") {
    return "";
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : "";
}

function coerceCount(value) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? Math.trunc(num) : 0;
}

async function recomputeTreeCounters(client, treeId) {
  const normalizedTreeId = normalizeTreeId(treeId);
  if (!normalizedTreeId) {
    return;
  }

  const { rows } = await client.query(
    `
    WITH active_nodes AS (
      SELECT id, parent_id
      FROM nodes
      WHERE tree_id = $1
        AND soft_deleted_at IS NULL
    ),
    leaf_nodes AS (
      SELECT an.id
      FROM active_nodes an
      LEFT JOIN active_nodes c ON c.parent_id = an.id
      WHERE c.id IS NULL
    )
    SELECT
      (SELECT COUNT(*) FROM active_nodes) AS node_count,
      (SELECT COUNT(*) FROM leaf_nodes) AS branch_count
    `,
    [normalizedTreeId],
  );

  const counts = rows[0] || {};
  const nodeCount = coerceCount(counts.node_count);
  const branchCount = coerceCount(counts.branch_count);

  await client.query(
    `
    UPDATE trees
       SET node_count = $2,
           branch_count = $3
     WHERE id = $1
    `,
    [normalizedTreeId, nodeCount, branchCount],
  );
}

async function recomputeTreeCountersWithPool(treeId) {
  const client = await pool.connect();
  try {
    await recomputeTreeCounters(client, treeId);
  } finally {
    client.release();
  }
}

export { recomputeTreeCounters, recomputeTreeCountersWithPool };
