import express from "express";

import { HttpError, wrapAsync } from "../lib/errors.js";
import { getAuthUserIdForRequest } from "../lib/auth_user.js";
import { assertNodeOwnership } from "../lib/tree_access.js";
import { getTraceId, withTraceId } from "../lib/trace.js";
import { pruneNodeBranch } from "../services/node/prune.js";

export default function createNodePruneRouter(pg) {
  const router = express.Router();

  router.post(
    "/:id/prune",
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

      if (!node.parent_id || node.level === 0) {
        throw new HttpError({
          status: 422,
          code: "CANNOT_PRUNE_ROOT",
          message: "cannot prune root node",
        });
      }

      if (node.tree_status === "deleted") {
        throw new HttpError({
          status: 404,
          code: "TREE_NOT_FOUND",
          message: "tree not found",
        });
      }

      const result = await pruneNodeBranch(pg, {
        nodeId,
        treeId: node.tree_id,
        userId,
        traceId,
      });

      res.json(
        withTraceId(res, {
          ok: true,
          tree_id: node.tree_id,
          pruned_root_node_id: nodeId,
          parent_id: node.parent_id,
          deleted_count: result.deleted_count,
          target_count: result.target_count,
        }),
      );
    }),
  );

  return router;
}
