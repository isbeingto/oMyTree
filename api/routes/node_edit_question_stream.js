import express from "express";

import { HttpError } from "../lib/errors.js";
import { applyRateQuotaHeaders } from "../lib/rate_quota_headers.js";
import { getAuthUserIdForRequest } from "../lib/auth_user.js";
import { assertNodeOwnership } from "../lib/tree_access.js";
import { getTraceId } from "../lib/trace.js";
import { pruneNodeBranch } from "../services/node/prune.js";
import { createTurn } from "../services/turn/create.js";
import { isLlmError, mapLlmError } from "../services/llm/errors.js";
import { registerStreamAbort, removeStream } from "../lib/stream_abort_registry.js";

function writeSse(res, payload) {
  if (res.writableEnded) return;
  try {
    const jsonStr = JSON.stringify(payload);
    res.write(`data: ${jsonStr}\n\n`);
  } catch (err) {
    console.error("[edit-question.stream] writeSse error:", err?.message || err);
  }
}

function normalizeStreamError(error, providerHint = "unknown") {
  if (error instanceof HttpError) {
    return {
      code: error.code || "internal_error",
      provider: providerHint,
      message: error.message || error.code || "error",
    };
  }
  if (isLlmError(error)) {
    return {
      code: error.code || "internal_error",
      provider: error.provider || providerHint,
      message: error.message || "error",
    };
  }
  const mapped = mapLlmError(error, { provider: providerHint });
  return {
    code: mapped.code || "internal_error",
    provider: mapped.provider || providerHint,
    message: mapped.message || "error",
  };
}

/**
 * T28-1: Edit question API (streaming)
 *
 * Semantic: Edit this user question text, delete everything after it,
 * and stream the regenerated AI response.
 *
 * POST /api/node/:id/edit-question/stream
 * Body: { new_text: string, provider?: string, model?: string, upload_ids?: string[] }
 */
export default function createNodeEditQuestionStreamRouter(pg) {
  const router = express.Router();

  router.post("/:id/edit-question/stream", async (req, res) => {
    const traceId = getTraceId(res);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    applyRateQuotaHeaders(res, "turn");
    res.flushHeaders?.();
    res.write(": connected\n\n");

    const heartbeat = setInterval(() => {
      if (res.writableEnded) return;
      try {
        res.write(": ping\n\n");
      } catch (err) {
        console.warn("[edit-question.stream] heartbeat failed:", err?.message || err);
      }
    }, 15000);

    const abortController = new AbortController();
    let streamStarted = false;
    let streamCompleted = false;
    let activeTurnId = null;

    req.on("close", () => {
      clearInterval(heartbeat);
      if (streamCompleted || abortController.signal.aborted) {
        return;
      }

      if (streamStarted) {
        console.log("[edit-question.stream] req.close during active stream (abort now)");
        abortController.abort(new Error('client disconnected'));
        return;
      }

      setTimeout(() => {
        if (!streamStarted && !streamCompleted && !abortController.signal.aborted) {
          console.log("[edit-question.stream] req.close before start (delayed abort)");
          abortController.abort(new Error('client disconnected'));
        }
      }, 500);
    });

    const markStreamStarted = () => {
      streamStarted = true;
    };
    const markStreamCompleted = () => {
      streamCompleted = true;
    };

    let providerHint = "unknown";
    try {
      const nodeId = req.params.id;
      const { new_text } = req.body || {};
      const userId = await getAuthUserIdForRequest(req, pg);
      const provider = typeof req.body?.provider === "string" ? req.body.provider : null;
      const providerMode = typeof req.body?.provider_mode === "string" ? req.body.provider_mode : null;
      const model = typeof req.body?.model === "string" ? req.body.model : null;
      const uploadIds = Array.isArray(req.body?.upload_ids) ? req.body.upload_ids : [];
      providerHint = provider || providerHint;

      if (typeof new_text !== "string" || !new_text.trim()) {
        throw new HttpError({
          status: 422,
          code: "INVALID_INPUT",
          message: "new_text is required",
        });
      }

      const newText = new_text.trim();

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

      if (node.role !== "user") {
        throw new HttpError({
          status: 422,
          code: "INVALID_NODE_ROLE",
          message: "Can only edit user questions, not AI responses",
        });
      }

      const oldText = node.text;
      const textChanged = oldText !== newText;
      let deletedCount = 0;

      await pg.query("BEGIN");
      try {
        if (textChanged) {
          await pg.query(`UPDATE nodes SET text = $1 WHERE id = $2`, [newText, nodeId]);
        }

        // Delete historical turns for this user node to ensure old Q/A is fully purged from DB.
        // Detach uploads/tree_trail_events first due to FK constraints.
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

        const { rows: childNodes } = await pg.query(
          `SELECT id FROM nodes WHERE parent_id = $1 AND soft_deleted_at IS NULL`,
          [nodeId],
        );

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
      } catch (err) {
        await pg.query("ROLLBACK");
        throw err;
      }

      const turnResult = await createTurn(
        {
          tree_id: node.tree_id,
          node_id: nodeId,
          user_text: newText,
          with_ai: true,
          who: "user",
          trace_id: traceId,
          route_mode: "auto",
          upload_ids: uploadIds,
          provider,
          provider_mode: providerMode,
          model,
          user_id: userId,
          existing_user_node_id: nodeId,
        },
        {
          enableStreaming: true,
          signal: abortController.signal,
          onStart: (meta) => {
            markStreamStarted();
            activeTurnId = meta?.turn_id || null;
            if (activeTurnId) {
              registerStreamAbort(activeTurnId, abortController);
            }
            writeSse(res, { type: "start", trace_id: traceId, ...meta });
          },
          onDelta: (text) => writeSse(res, { type: "delta", text }),
        },
      );

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
            ai_regenerated: !!turnResult.ai_node,
            ts: new Date().toISOString(),
          }),
          traceId ?? null,
        ],
      );

      writeSse(res, {
        type: "done",
        turn: turnResult.turn,
        user_node: turnResult.user_node,
        ai_node: turnResult.ai_node,
        usage: turnResult.turn?.usage_json ?? turnResult.usage_json ?? null,
        provider: turnResult.turn?.provider ?? turnResult.provider ?? provider ?? null,
        model: turnResult.turn?.model ?? model ?? null,
        is_byok: turnResult.turn?.is_byok ?? null,
        trace_id: traceId,
        node_id: nodeId,
        new_text: newText,
        deleted_count: deletedCount,
      });
      markStreamCompleted();
      if (!res.writableEnded) {
        res.end();
      }
    } catch (error) {
      console.error("[edit-question.stream] Error:", error);
      const normalized = normalizeStreamError(error, providerHint);
      writeSse(res, {
        type: "error",
        error: {
          code: normalized.code,
          provider: normalized.provider,
          message: normalized.message,
        },
        trace_id: traceId,
      });
      markStreamCompleted();
      if (!res.writableEnded) {
        res.end();
      }
    } finally {
      if (activeTurnId) {
        removeStream(activeTurnId);
      }
      clearInterval(heartbeat);
    }
  });

  return router;
}
