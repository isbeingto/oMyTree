import express from "express";

import { HttpError, wrapAsync } from "../lib/errors.js";
import { getAuthUserIdForRequest } from "../lib/auth_user.js";
import { assertNodeOwnership } from "../lib/tree_access.js";
import { getTraceId, withTraceId } from "../lib/trace.js";
import { pruneNodeBranch } from "../services/node/prune.js";
import { createTurn } from "../services/turn/create.js";

/**
 * T28-1: Edit question API
 * 
 * Semantic: Edit this user question text, delete everything after it,
 * and regenerate the AI response with the new question.
 * 
 * POST /api/node/:id/edit-question
 * Body: { new_text: string }
 * 
 * Steps:
 * 1. Update the user node's text
 * 2. Find and delete the AI response node (immediate child) and all its descendants
 * 3. Regenerate AI response using the turn service
 */
export default function createNodeEditQuestionRouter(pg) {
  const router = express.Router();

  router.post(
    "/:id/edit-question",
    wrapAsync(async (req, res) => {
      const nodeId = req.params.id;
      const { new_text } = req.body || {};
      const userId = await getAuthUserIdForRequest(req, pg);
      const traceId = getTraceId(res);

      // Validate input
      if (typeof new_text !== "string" || !new_text.trim()) {
        throw new HttpError({
          status: 422,
          code: "INVALID_INPUT",
          message: "new_text is required",
        });
      }

      const newText = new_text.trim();

      // Validate ownership and get node info
      const node = await assertNodeOwnership(pg, nodeId, userId, {
        selectColumns: [
          "n.id",
          "n.tree_id",
          "n.parent_id",
          "n.level",
          "n.role",
          "n.text",
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

      // Only allow editing user messages (including root)
      if (node.role !== "user") {
        throw new HttpError({
          status: 422,
          code: "INVALID_NODE_ROLE",
          message: "Can only edit user questions, not AI responses",
        });
      }

      const oldText = node.text;
      const textChanged = oldText !== newText;

      await pg.query("BEGIN");
      try {
        // Step 1: Update the user node's text (only if changed)
        if (textChanged) {
          await pg.query(
            `UPDATE nodes SET text = $1 WHERE id = $2`,
            [newText, nodeId]
          );
        }

        // Delete historical turns for this user node to ensure old Q/A is fully purged from DB.
        // Note: turns may be referenced by uploads/tree_trail_events, so detach those first.
        const { rows: oldTurns } = await pg.query(
          `SELECT id FROM turns WHERE node_id = $1`,
          [nodeId]
        );
        const oldTurnIds = oldTurns.map((r) => r.id).filter(Boolean);
        if (oldTurnIds.length > 0) {
          // T90: Collect uploads referenced by the old turns so we can delete orphans.
          const { rows: oldUploadRows } = await pg.query(
            `SELECT DISTINCT upload_id
               FROM turn_uploads
              WHERE turn_id = ANY($1::uuid[])`,
            [oldTurnIds]
          );
          const oldUploadIds = oldUploadRows.map((r) => r.upload_id).filter(Boolean);

          await pg.query(
            `UPDATE uploads SET turn_id = NULL, node_id = NULL WHERE turn_id = ANY($1)`,
            [oldTurnIds]
          );
          await pg.query(
            `DELETE FROM tree_trail_events WHERE turn_id = ANY($1)`,
            [oldTurnIds]
          );
          await pg.query(
            `DELETE FROM turn_uploads WHERE turn_id = ANY($1)`,
            [oldTurnIds]
          );
          await pg.query(
            `DELETE FROM turns WHERE id = ANY($1)`,
            [oldTurnIds]
          );

          // T90: Physically delete uploads that are no longer referenced by any turn.
          // Guarded to avoid deleting uploads still attached elsewhere.
          if (oldUploadIds.length > 0) {
            await pg.query(
              `DELETE FROM uploads u
                WHERE u.id = ANY($1::uuid[])
                  AND NOT EXISTS (
                    SELECT 1 FROM turn_uploads tu WHERE tu.upload_id = u.id
                  )`,
              [oldUploadIds]
            );
          }
        }

        // Step 2: Find direct child nodes (should be AI response) and prune them
        // 无论文本是否改变,都删除所有子节点并重新生成
        const { rows: childNodes } = await pg.query(
          `SELECT id FROM nodes WHERE parent_id = $1 AND soft_deleted_at IS NULL`,
          [nodeId]
        );

        let deletedCount = 0;
        for (const child of childNodes) {
          const pruneResult = await pruneNodeBranch(pg, {
            nodeId: child.id,
            treeId: node.tree_id,
            userId,
            traceId,
          });
          deletedCount += pruneResult.deleted_count;
        }

        await pg.query("COMMIT");

        // Step 3: Generate new AI response using createTurn
        // This will create a new AI node as a child of the edited user node
        // Use 'auto' route_mode (default) since we already pruned children
        let aiResponse = null;
        let aiNode = null;
        let turnError = null;

        try {
          const turnResult = await createTurn({
            tree_id: node.tree_id,
            node_id: nodeId,
            user_text: newText,
            with_ai: true,
            who: "user",
            trace_id: traceId,
            route_mode: "auto", // Use auto routing
            provider: typeof req.body?.provider === "string" ? req.body.provider : null,
            provider_mode: typeof req.body?.provider_mode === "string" ? req.body.provider_mode : null,
            model: typeof req.body?.model === "string" ? req.body.model : null,
            user_id: userId,
            existing_user_node_id: nodeId, // Signal that user node already exists
          });

          aiNode = turnResult.ai_node || null;
          aiResponse = turnResult.ai_text || aiNode?.text || null;
        } catch (err) {
          console.error("[edit-question] Failed to regenerate AI response:", err);
          turnError = err.message || "Failed to regenerate response";
        }

        // Record event
        await pg.query(
          `INSERT INTO events(event_type, tree_id, node_id, payload, trace_id)
           VALUES ($1, $2, $3, $4, COALESCE($5::uuid, uuid_generate_v4()))`,
          [
            "node.question_edited",
            node.tree_id,
            nodeId,
            JSON.stringify({
              tree_id: node.tree_id,
              node_id: nodeId,
              user_id: userId,
              text_changed: textChanged,
              deleted_descendants: deletedCount,
              ai_regenerated: !!aiNode,
              ts: new Date().toISOString(),
            }),
            traceId ?? null,
          ]
        );

        res.json(
          withTraceId(res, {
            ok: true,
            tree_id: node.tree_id,
            node_id: nodeId,
            new_text: newText,
            deleted_count: deletedCount,
            ai_node: aiNode
              ? {
                  id: aiNode.id,
                  text: aiNode.text,
                  role: aiNode.role,
                  level: aiNode.level,
                }
              : null,
            error: turnError,
          })
        );
      } catch (err) {
        await pg.query("ROLLBACK");
        throw err;
      }
    })
  );

  return router;
}
