import express from "express";

import { HttpError, wrapAsync } from "../lib/errors.js";
import { getAuthUserIdForRequest } from "../lib/auth_user.js";
import { assertNodeOwnership } from "../lib/tree_access.js";
import { getTraceId, withTraceId } from "../lib/trace.js";
import { pruneNodeBranch } from "../services/node/prune.js";

/**
 * T28-1: Delete from here API
 * 
 * Semantic: Delete this user question and everything that came after it in this branch.
 * This is triggered from the user message bubble's kebab menu.
 * 
 * POST /api/node/:id/delete-from
 * - id: The user node (question) ID to delete from
 * - Only works on user/root nodes (not AI nodes)
 * - Deletes this node and all its descendants
 * 
 */
export default function createNodeDeleteFromRouter(pg) {
  const router = express.Router();

  router.post(
    "/:id/delete-from",
    wrapAsync(async (req, res) => {
      const nodeId = req.params.id;
      const userId = await getAuthUserIdForRequest(req, pg);
      const traceId = getTraceId(res);
      
      // Validate ownership and get node info
      const node = await assertNodeOwnership(pg, nodeId, userId, {
        selectColumns: [
          "n.id",
          "n.tree_id",
          "n.parent_id",
          "n.level",
          "n.role",
          "n.soft_deleted_at",
          "t.status AS tree_status",
        ],
      });

      if (node.tree_status === "deleted") {
        throw new HttpError({
          status: 404,
          code: "TREE_NOT_FOUND",
          message: "tree not found",
        });
      }

      // Only allow deletion from user messages (including root)
      // AI responses should not trigger this - user should click on their question
      if (node.role !== "user") {
        throw new HttpError({
          status: 422,
          code: "INVALID_NODE_ROLE",
          message: "Can only delete from user questions, not AI responses",
          hint: "Click on your question to delete from that point",
        });
      }

      // Cannot delete the root question if it's the only node
      if (!node.parent_id || node.level === 0) {
        throw new HttpError({
          status: 422,
          code: "CANNOT_DELETE_ROOT_NODE",
          message: "Cannot delete the root question",
          hint: "Delete the entire tree instead",
        });
      }

      // Find the parent node to navigate to after deletion
      const { rows: parentRows } = await pg.query(
        `SELECT id, parent_id, level, role FROM nodes WHERE id = $1`,
        [node.parent_id]
      );
      const parentNode = parentRows[0];

      // Use existing prune logic to delete this node and all descendants
      const result = await pruneNodeBranch(pg, {
        nodeId,
        treeId: node.tree_id,
        userId,
        traceId,
      });

      // Record specific event for delete-from action
      await pg.query(
        `INSERT INTO events(event_type, tree_id, node_id, payload, trace_id)
         VALUES ($1, $2, $3, $4, COALESCE($5::uuid, uuid_generate_v4()))`,
        [
          "node.delete_from",
          node.tree_id,
          nodeId,
          JSON.stringify({
            tree_id: node.tree_id,
            node_id: nodeId,
            parent_id: node.parent_id,
            user_id: userId,
            deleted_count: result.deleted_count,
            ts: new Date().toISOString(),
          }),
          traceId ?? null,
        ]
      );

      res.json(
        withTraceId(res, {
          ok: true,
          tree_id: node.tree_id,
          deleted_node_id: nodeId,
          parent_id: node.parent_id,
          navigate_to_node_id: parentNode?.id ?? null,
          deleted_count: result.deleted_count,
        })
      );
    })
  );

  return router;
}
