import { HttpError } from "../../lib/errors.js";
import { recomputeTreeCounters } from "../tree/counters.js";

function requireId(value, field = "id") {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError({
      status: 422,
      code: "INVALID_ID",
      message: `${field} is required`,
    });
  }
  return value.trim();
}

export async function pruneNodeBranch(pg, { nodeId, treeId, userId, traceId = null }) {
  const targetNodeId = requireId(nodeId, "node_id");
  const targetTreeId = requireId(treeId, "tree_id");
  const actorUserId = requireId(userId, "user_id");

  await pg.query("BEGIN");
  try {
    // T90: Collect uploads that are only referenced by turns within the subtree.
    // Note: uploads.turn_id/node_id are ON DELETE SET NULL, so without explicit cleanup,
    // delete-from can leave orphan uploads that still consume storage/quota.
    const { rows: subtreeUploadRows } = await pg.query(
      `WITH RECURSIVE subtree AS (
         SELECT id
           FROM nodes
          WHERE id = $1
            AND tree_id = $2
         UNION ALL
         SELECT n.id
           FROM nodes n
           JOIN subtree s ON n.parent_id = s.id
          WHERE n.tree_id = $2
       ),
       subtree_turns AS (
         SELECT t.id
           FROM turns t
           JOIN subtree s ON t.node_id = s.id
       ),
       uploads_to_consider AS (
         SELECT DISTINCT tu.upload_id
           FROM turn_uploads tu
          WHERE tu.turn_id IN (SELECT id FROM subtree_turns)
       ),
       uploads_to_delete AS (
         SELECT utc.upload_id
           FROM uploads_to_consider utc
          WHERE NOT EXISTS (
            SELECT 1
              FROM turn_uploads tu2
             WHERE tu2.upload_id = utc.upload_id
               AND tu2.turn_id NOT IN (SELECT id FROM subtree_turns)
          )
       )
       SELECT upload_id FROM uploads_to_delete`,
      [targetNodeId, targetTreeId],
    );
    const subtreeUploadIds = subtreeUploadRows.map((r) => r.upload_id).filter(Boolean);

    // T87: Hard delete - first collect IDs, then delete
    // FK CASCADE will auto-delete turns, favorites, node_summaries, etc.
    const { rows } = await pg.query(
      `WITH RECURSIVE subtree AS (
         SELECT id
           FROM nodes
          WHERE id = $1
            AND tree_id = $2
         UNION ALL
         SELECT n.id
           FROM nodes n
           JOIN subtree s ON n.parent_id = s.id
          WHERE n.tree_id = $2
       ),
       dedup AS (
         SELECT DISTINCT id FROM subtree
       ),
       deleted AS (
         DELETE FROM nodes
          WHERE id IN (SELECT id FROM dedup)
      RETURNING id
       )
       SELECT
         (SELECT COUNT(*) FROM dedup) AS target_count,
         (SELECT COUNT(*) FROM deleted) AS deleted_count,
         ARRAY(SELECT id FROM deleted ORDER BY id ASC LIMIT 16) AS deleted_ids`,
      [targetNodeId, targetTreeId],
    );

    const summary = rows[0] ?? {};
    const deletedCount = Number(summary.deleted_count ?? 0);
    const targetCount = Number(summary.target_count ?? 0);
    const deletedIds = Array.isArray(summary.deleted_ids) ? summary.deleted_ids : [];

    // T90: Physically delete uploads that became unreferenced.
    // Guard with NOT EXISTS to avoid deleting uploads still used elsewhere.
    let uploadsDeleted = 0;
    if (subtreeUploadIds.length > 0) {
      const { rowCount } = await pg.query(
        `DELETE FROM uploads u
          WHERE u.id = ANY($1::uuid[])
            AND NOT EXISTS (
              SELECT 1 FROM turn_uploads tu WHERE tu.upload_id = u.id
            )`,
        [subtreeUploadIds],
      );
      uploadsDeleted = Number(rowCount ?? 0);
    }

    await pg.query(
      `INSERT INTO events(event_type, tree_id, node_id, payload, trace_id)
       VALUES ($1, $2, $3, $4, COALESCE($5::uuid, uuid_generate_v4()))`,
      [
        "node.branch_pruned",
        targetTreeId,
        targetNodeId,
        JSON.stringify({
          tree_id: targetTreeId,
          node_id: targetNodeId,
          user_id: actorUserId,
          deleted_node_count: deletedCount,
          target_node_count: targetCount,
          deleted_sample_node_ids: deletedIds,
          ts: new Date().toISOString(),
        }),
        traceId ?? null,
      ],
    );

    await recomputeTreeCounters(pg, targetTreeId);
    await pg.query("COMMIT");

    return {
      deleted_count: deletedCount,
      target_count: targetCount,
      deleted_sample_ids: deletedIds,
      uploads_deleted: uploadsDeleted,
    };
  } catch (err) {
    await pg.query("ROLLBACK");
    throw err;
  }
}

export default {
  pruneNodeBranch,
};
