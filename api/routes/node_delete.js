import express from "express";

import { HttpError, wrapAsync } from "../lib/errors.js";
import { getAuthUserIdForRequest } from "../lib/auth_user.js";
import { assertNodeOwnership } from "../lib/tree_access.js";
import { getTraceId, withTraceId } from "../lib/trace.js";
import { recomputeTreeCounters } from "../services/tree/counters.js";

export default function createNodeDeleteRouter(pg) {
  const router = express.Router();

  router.post(
    "/:id/delete",
    wrapAsync(async (req, res) => {
      const nodeId = req.params.id;
      const userId = await getAuthUserIdForRequest(req, pg);
      const traceId = getTraceId(res);

      const node = await assertNodeOwnership(pg, nodeId, userId, {
        selectColumns: [
          "n.id",
          "n.tree_id",
          "n.parent_id",
          "n.level",
          "n.soft_deleted_at",
          "t.status AS tree_status",
        ],
      });

      if (node.tree_status === "deleted") {
        throw new HttpError({
          status: 404,
          code: "NODE_NOT_FOUND",
          message: "node not found",
        });
      }

      if (!node.parent_id || node.level === 0) {
        throw new HttpError({
          status: 422,
          code: "CANNOT_DELETE_ROOT_NODE",
          message: "cannot delete root node",
        });
      }

      // T87: Check for child nodes (hard delete means no soft_deleted filter needed)
      const { rows: childRows } = await pg.query(
        `SELECT COUNT(*)::int AS child_count
           FROM nodes
          WHERE parent_id = $1`,
        [nodeId],
      );
      const childCount = Number(childRows[0]?.child_count ?? 0);
      if (childCount > 0) {
        throw new HttpError({
          status: 422,
          code: "CANNOT_DELETE_NON_LEAF_NODE",
          message: "node has active children",
          hint: "Use delete branch instead",
        });
      }

      // T87: Hard delete node - FK CASCADE will auto-delete turns, favorites, etc.
      const { rows: deletedRows } = await pg.query(
        `DELETE FROM nodes WHERE id = $1 RETURNING id`,
        [nodeId],
      );

      const deleted = deletedRows.length > 0;

      await pg.query(
        `INSERT INTO events(event_type, tree_id, node_id, payload, trace_id)
         VALUES ($1, $2, $3, $4, COALESCE($5::uuid, uuid_generate_v4()))`,
        [
          "node.leaf_deleted",
          node.tree_id,
          node.id,
          JSON.stringify({
            tree_id: node.tree_id,
            node_id: node.id,
            user_id: userId,
            mode: "leaf",
            deleted,
            already_deleted: !deleted,
            ts: new Date().toISOString(),
          }),
          traceId ?? null,
        ],
      );

      await recomputeTreeCounters(pg, node.tree_id);
      res.json(
        withTraceId(res, {
          ok: true,
          tree_id: node.tree_id,
          node_id: node.id,
          parent_id: node.parent_id,
          deleted,
          already_deleted: !deleted,
        }),
      );
    }),
  );

  return router;
}
