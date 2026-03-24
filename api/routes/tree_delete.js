import express from "express";
import { HttpError, wrapAsync } from "../lib/errors.js";
import { getAuthUserIdForRequest } from "../lib/auth_user.js";
import { assertTreeOwnership } from "../lib/tree_access.js";
import { withTraceId } from "../lib/trace.js";
import { writeAuditLog } from "../lib/audit_log.js";
import { deleteUploadsForTree } from "../services/uploads/upload_service.js";

export default function createTreeDeleteRouter(pg) {
  const router = express.Router();

  // T15-8: Soft delete a tree (T28-3: also clears share_token)
  router.delete(
    "/:id",
    wrapAsync(async (req, res) => {
      const treeId = req.params.id;
      const userId = await getAuthUserIdForRequest(req, pg);

      // Check if user is demo user - demo users cannot delete trees
      const demoUserResult = await pg.query(
        "SELECT id FROM users WHERE email = $1 LIMIT 1",
        ["demo@omytree.local"]
      );

      if (demoUserResult.rows.length > 0 && userId === demoUserResult.rows[0].id) {
        throw new HttpError({
          status: 401,
          code: "AUTH_REQUIRED",
          message: "demo user cannot delete trees",
        });
      }

      // Assert ownership and check that tree is active
      const tree = await assertTreeOwnership(pg, treeId, userId, {
        selectColumns: ["id", "status", "topic", "node_count", "branch_count"],
      });

      // Check if tree is already deleted
      if (tree.status === "deleted") {
        throw new HttpError({
          status: 404,
          code: "TREE_NOT_FOUND",
          message: "tree not found",
        });
      }

      // T86: Delete all uploads for this tree before hard-deleting
      const uploadCleanup = await deleteUploadsForTree(treeId);

      // T87: Hard delete tree - FK CASCADE will auto-delete:
      // nodes, turns, favorites, memos, resume_snapshots, evidence_items, etc.
      await pg.query(
        `DELETE FROM trees WHERE id = $1 AND user_id = $2`,
        [treeId, userId]
      );

      const traceId = res.locals?.traceId ?? req.headers?.["x-trace-id"] ?? null;
      const forwardedFor = req.headers?.["x-forwarded-for"];
      const ip =
        (typeof forwardedFor === "string" && forwardedFor ? forwardedFor.split(",")[0].trim() : null) ||
        req.ip ||
        null;

      await writeAuditLog(
        {
          actorUserId: userId,
          actorRole: "user",
          action: "user.tree.delete",
          targetType: "tree",
          targetId: treeId,
          ip,
          traceId,
          metadata: {
            tree_title: tree.topic || null,
            node_count: tree.node_count ?? null,
            branch_count: tree.branch_count ?? null,
            uploads_deleted: uploadCleanup.deleted ?? 0,
          },
        },
        pg
      );

      res.json(
        withTraceId(res, {
          ok: true,
          tree_id: treeId,
          status: "deleted",
          uploads_deleted: uploadCleanup.deleted ?? 0,
        })
      );
    })
  );

  return router;
}
