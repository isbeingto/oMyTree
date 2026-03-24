import express from "express";
import { validate as uuidValidate } from "uuid";

import { HttpError, wrapAsync } from "../lib/errors.js";
import { getAuthUserIdForRequest } from "../lib/auth_user.js";
import { assertNodeOwnership, assertTreeOwnership } from "../lib/tree_access.js";
import { withTraceId } from "../lib/trace.js";

function assertUuid(value, { code, message } = {}) {
  if (!value || typeof value !== "string" || !uuidValidate(value)) {
    throw new HttpError({
      status: 422,
      code: code || "INVALID_UUID",
      message: message || "invalid uuid",
    });
  }
}

function normalizeAnnotationInput(value) {
  if (value === null || typeof value === "undefined") {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return null;
}

function hasAnnotationValue(value) {
  if (!value || typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.length > 0;
      }
      if (parsed && typeof parsed === "object") {
        return Object.keys(parsed).length > 0;
      }
    } catch {
      return true;
    }
  }
  return true;
}

export default function createKeyframesRouter(pg) {
  const router = express.Router();

  /**
   * GET /api/tree/:treeId/keyframes
   * Fetch all keyframes (annotated nodes) for a tree (user-owned).
   * 
   * Note: keyframes serve as internal storage for user annotations.
   * Only returns entries with non-empty annotation field.
   * 返回该树下当前用户的所有 keyframes。
   */
  router.get(
    "/:treeId/keyframes",
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      const treeId = req.params.treeId;

      await assertTreeOwnership(pg, treeId, userId);

      const { rows } = await pg.query(
        `SELECT
            id,
            node_id,
            annotation,
            is_pinned,
            created_at
          FROM keyframes
          WHERE user_id = $1
            AND tree_id = $2
            AND annotation IS NOT NULL
            AND annotation != ''
            AND annotation != '[]'
          ORDER BY created_at DESC`,
        [userId, treeId]
      );

      res.json(
        withTraceId(res, {
          ok: true,
          keyframes: rows,
        })
      );
    })
  );

  /**
   * POST /api/tree/:treeId/keyframes
   * Create or update a keyframe (annotated node).
   * 
   * Note: keyframes represent nodes with user annotations.
   * The is_pinned field is managed internally; UI only exposes annotation operations.
   * 接收 { node_id, annotation }。
   * 包含 upsert 逻辑（如果已存在则更新 annotation）。
   */
  router.post(
    "/:treeId/keyframes",
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      const treeId = req.params.treeId;
      const nodeId = req.body?.node_id;
      const annotation = normalizeAnnotationInput(req.body?.annotation);

      assertUuid(treeId, { code: "INVALID_TREE_ID", message: "invalid tree id" });
      assertUuid(nodeId, { code: "INVALID_NODE_ID", message: "invalid node id" });

      await assertTreeOwnership(pg, treeId, userId);
      const ownedNode = await assertNodeOwnership(pg, nodeId, userId);
      if (ownedNode.tree_id !== treeId) {
        throw new HttpError({
          status: 404,
          code: "NODE_NOT_FOUND",
          message: "node not found",
        });
      }

      const { rows } = await pg.query(
        `INSERT INTO keyframes (user_id, tree_id, node_id, annotation, is_pinned)
         VALUES ($1, $2, $3, $4, TRUE)
         ON CONFLICT (user_id, node_id)
         DO UPDATE SET
           annotation = EXCLUDED.annotation,
           is_pinned = TRUE
         RETURNING id, node_id, annotation, is_pinned, created_at`,
        [userId, treeId, nodeId, annotation]
      );

      const keyframe = rows[0] || null;
      if (keyframe) {
        // P0-6: Log to process_events
        await pg.query(
          `INSERT INTO process_events (tree_id, scope_node_id, event_type, meta)
           VALUES ($1, $2, $3, $4)`,
          [
            treeId,
            nodeId,
            "keyframe.pinned",
            JSON.stringify({
              keyframe_id: keyframe.id,
              has_annotation: hasAnnotationValue(annotation),
            }),
          ]
        );
      }

      res.status(200).json(
        withTraceId(res, {
          ok: true,
          keyframe,
        })
      );
    })
  );

  /**
   * DELETE /api/tree/:treeId/keyframes/:nodeId
   * Remove a keyframe (delete all annotations for a node).
   * 
   * Note: Called when user deletes the last annotation on a node.
   */
  router.delete(
    "/:treeId/keyframes/:nodeId",
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      const treeId = req.params.treeId;
      const nodeId = req.params.nodeId;

      assertUuid(treeId, { code: "INVALID_TREE_ID", message: "invalid tree id" });
      assertUuid(nodeId, { code: "INVALID_NODE_ID", message: "invalid node id" });

      await assertTreeOwnership(pg, treeId, userId);

      const result = await pg.query(
        `DELETE FROM keyframes
         WHERE user_id = $1
           AND tree_id = $2
           AND node_id = $3
         RETURNING id`,
        [userId, treeId, nodeId]
      );

      if (result.rowCount > 0) {
        // P0-6: Log to process_events
        await pg.query(
          `INSERT INTO process_events (tree_id, scope_node_id, event_type, meta)
           VALUES ($1, $2, $3, $4)`,
          [
            treeId,
            nodeId,
            "keyframe.unpinned",
            JSON.stringify({}),
          ]
        );
      }

      res.json(
        withTraceId(res, {
          ok: true,
          deleted: result.rowCount || 0,
        })
      );
    })
  );

  /**
   * GET /api/tree/:treeId/golden-path
   * Compute the "golden path" (thread path) - full ancestry of all annotated nodes.
   * 
   * Note: This path connects all nodes with annotations, forming the user's narrative thread.
   * Returns a de-duplicated list of node IDs (user + AI) from root to annotated nodes.
   * 
   * 1) 查出该用户在该树下的所有 keyframes 的 node_id
   * 2) 用递归 CTE 查询这些节点到 Root 的完整路径
   * 3) 返回去重后的节点列表
   */
  router.get(
    "/:treeId/golden-path",
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      const treeId = req.params.treeId;

      await assertTreeOwnership(pg, treeId, userId);

      const { rows: kfRows } = await pg.query(
        `SELECT node_id
           FROM keyframes
          WHERE user_id = $1
            AND tree_id = $2
            AND annotation IS NOT NULL
            AND annotation != ''
            AND annotation != '[]'`,
        [userId, treeId]
      );

      const keyframeNodeIds = kfRows.map((r) => r.node_id);
      if (keyframeNodeIds.length === 0) {
        res.json(
          withTraceId(res, {
            ok: true,
            node_ids: [],
          })
        );
        return;
      }

      const MAX_DEPTH = 2000;
      const { rows: pathRows } = await pg.query(
        `WITH RECURSIVE path AS (
            SELECT id, parent_id, 1 as depth
              FROM nodes
             WHERE tree_id = $1
               AND soft_deleted_at IS NULL
               AND id = ANY($2::uuid[])

            UNION ALL

            SELECT n.id, n.parent_id, p.depth + 1
              FROM nodes n
              JOIN path p ON n.id = p.parent_id
             WHERE n.tree_id = $1
               AND n.soft_deleted_at IS NULL
               AND p.depth < $3
          )
          SELECT DISTINCT id
            FROM path`,
        [treeId, keyframeNodeIds, MAX_DEPTH]
      );

      res.json(
        withTraceId(res, {
          ok: true,
          node_ids: pathRows.map((r) => r.id),
        })
      );
    })
  );

  return router;
}
