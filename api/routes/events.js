import express from "express";
import { randomUUID } from "crypto";

import { appendAudit } from "../lib/audit.js";
import { ensureCoreSchema } from "../lib/db.js";
import { KEY_EVENT_TYPES, isKeyEventType } from "../lib/events/key_events.js";
import { planReplay, foldEvents } from "../lib/events/replay.js";
import { HttpError, respondWithError, wrapAsync } from "../lib/errors.js";
import { withTraceId } from "../lib/trace.js";
import { getAuthUserIdForRequest } from "../lib/auth_user.js";
import { assertTreeOwnership } from "../lib/tree_access.js";

export default function createEventsRouter(pg) {
  const router = express.Router();
  const legacyReplayEnabled = process.env.ENABLE_LEGACY_EVENT_REPLAY_API !== "false";

  function normalizePayload(payload) {
    if (payload === null || typeof payload === "undefined") {
      return {};
    }
    if (typeof payload === "object" && !Buffer.isBuffer(payload)) {
      return payload;
    }
    if (typeof payload === "string") {
      try {
        return JSON.parse(payload);
      } catch (_err) {
        return { raw: payload };
      }
    }
    return payload;
  }

  router.get(
    "/last",
    wrapAsync(async (req, res) => {
      const requestedType =
        typeof req.query?.type === "string" && req.query.type.trim().length > 0
          ? req.query.type.trim()
          : "";

      if (requestedType && !isKeyEventType(requestedType)) {
        throw new HttpError({
          status: 400,
          code: "invalid_event_type",
          message: "type must be one of the supported key events",
          hint: `Use one of: ${KEY_EVENT_TYPES.join(", ")}`,
        });
      }

      const filterTypes = requestedType ? [requestedType] : KEY_EVENT_TYPES;
      const { rows } = await pg.query(
        `SELECT id, event_type, tree_id, node_id, turn_id, payload, trace_id, created_at
           FROM events
          WHERE event_type = ANY($1::text[])
       ORDER BY created_at DESC, id DESC
          LIMIT 1`,
        [filterTypes]
      );

      const row = rows[0] ?? null;
      const event = row
        ? {
            id: row.id,
            type: row.event_type,
            tree_id: row.tree_id,
            node_id: row.node_id,
            turn_id: row.turn_id,
            trace_id: row.trace_id ?? null,
            payload: normalizePayload(row.payload),
            created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
          }
        : null;

      res.json(
        withTraceId(res, {
          ok: true,
          event,
        })
      );
    })
  );

  router.post(
    "/replay",
    wrapAsync(async (req, res) => {
      if (!legacyReplayEnabled) {
        throw new HttpError({
          status: 410,
          code: "legacy_event_replay_disabled",
          message: "legacy events replay endpoint is disabled",
          hint: "Set ENABLE_LEGACY_EVENT_REPLAY_API=true to temporarily re-enable this endpoint",
        });
      }

      await ensureCoreSchema(pg);
      const { treeId, to } = req.body ?? {};

      if (typeof treeId !== "string" || treeId.trim() === "") {
        throw new HttpError({
          status: 400,
          code: "invalid_tree_id",
          message: "treeId is required",
          hint: "Provide a non-empty treeId",
        });
      }

      const normalizedTreeId = treeId.trim();
      const userId = await getAuthUserIdForRequest(req, pg);
      await assertTreeOwnership(pg, normalizedTreeId, userId);
      const eventsResult = await pg.query(
        `SELECT event_id, type, payload, ts FROM tree_event WHERE tree_id = $1 ORDER BY ts ASC, id ASC`,
        [normalizedTreeId]
      );

      const plan = planReplay(eventsResult.rows, to ?? "");
      if (plan.error) {
        throw new HttpError({
          status: 422,
          code: plan.error,
          message: "invalid replay target",
          hint: plan.hint,
          detail: plan.detail,
        });
      }

      if (!plan.changed) {
        const noopEventId = `evt_${randomUUID()}`;
        await pg.query(
          `INSERT INTO tree_event(tree_id, event_id, type, payload, trace_id)
           VALUES($1, $2, $3, $4, $5)`,
          [
            normalizedTreeId,
            noopEventId,
            "events.replay.noop",
            {
              target: to ?? null,
              reverted_to: plan.revertedTo ?? null,
              changed: false,
              trace_id: res.locals?.traceId ?? null,
            },
            res.locals?.traceId ?? null,
          ]
        );
        const response = withTraceId(res, {
          ok: true,
          reverted_to: plan.revertedTo ?? null,
        });
        res.json(response);
        await appendAudit({
          type: "events.replay",
          trace_id: res.locals?.traceId ?? null,
          tree_id: normalizedTreeId,
          changed: false,
          target: to ?? null,
        });
        return;
      }

      const state = foldEvents(plan.applied);
      const keepNodeIds = new Set(state.keys());

      await pg.query("BEGIN");
      try {
        const nodesResult = await pg.query(
          `SELECT node_id, status, parent_id, title, summary
             FROM tree_node
            WHERE tree_id = $1
            FOR UPDATE`,
          [normalizedTreeId]
        );

        const existing = new Map();
        const alwaysKeep = new Set();
        for (const row of nodesResult.rows) {
          existing.set(row.node_id, row);
          if (row.parent_id === null) {
            alwaysKeep.add(row.node_id);
          }
        }

        for (const nodeId of alwaysKeep) {
          keepNodeIds.add(nodeId);
          if (!state.has(nodeId) && existing.has(nodeId)) {
            state.set(nodeId, {
              node_id: nodeId,
              parent_id: existing.get(nodeId).parent_id,
              title: existing.get(nodeId).title,
              summary: existing.get(nodeId).summary,
              status: existing.get(nodeId).status,
            });
          }
        }

        for (const row of nodesResult.rows) {
          if (!keepNodeIds.has(row.node_id) && row.status !== "reverted") {
            await pg.query(
              `UPDATE tree_node SET status = $3, updated_at = now()
                 WHERE tree_id = $1 AND node_id = $2`,
              [normalizedTreeId, row.node_id, "reverted"]
            );
          }
        }

        for (const [nodeId, snapshot] of state.entries()) {
          const existingRow = existing.get(nodeId);
          if (!existingRow) {
            await pg.query(
              `INSERT INTO tree_node(tree_id, node_id, parent_id, title, summary, status, trace_id)
               VALUES($1, $2, $3, $4, $5, $6, $7)
               ON CONFLICT (tree_id, node_id) DO UPDATE SET
                 parent_id = EXCLUDED.parent_id,
                 title = EXCLUDED.title,
                 summary = EXCLUDED.summary,
                 status = EXCLUDED.status,
                 updated_at = now()`,
              [
                normalizedTreeId,
                nodeId,
                snapshot.parent_id ?? null,
                snapshot.title ?? "",
                typeof snapshot.summary === "undefined" ? null : snapshot.summary,
                snapshot.status ?? "confirmed",
                snapshot.trace_id ?? null,
              ]
            );
          } else {
            const desiredParent = snapshot.parent_id ?? existingRow.parent_id;
            const desiredStatus = snapshot.status ?? "confirmed";
            const desiredTitle = snapshot.title ?? existingRow.title;
            const desiredSummary =
              typeof snapshot.summary === "undefined" ? existingRow.summary : snapshot.summary;

            if (
              existingRow.parent_id !== desiredParent ||
              existingRow.status !== desiredStatus ||
              existingRow.title !== desiredTitle ||
              existingRow.summary !== desiredSummary
            ) {
              await pg.query(
                `UPDATE tree_node
                    SET parent_id = $3,
                        status = $4,
                        title = $5,
                        summary = $6,
                        updated_at = now()
                  WHERE tree_id = $1 AND node_id = $2`,
                [
                  normalizedTreeId,
                  nodeId,
                  desiredParent,
                  desiredStatus,
                  desiredTitle,
                  desiredSummary,
                ]
              );
            }
          }
        }

        const replayEventId = `evt_${randomUUID()}`;
        await pg.query(
          `INSERT INTO tree_event(tree_id, event_id, type, payload, trace_id)
           VALUES($1, $2, $3, $4, $5)`,
          [
            normalizedTreeId,
            replayEventId,
            "events.replay.executed",
            {
              target: to ?? null,
              reverted_to: plan.revertedTo ?? null,
              changed: true,
              trace_id: res.locals?.traceId ?? null,
            },
            res.locals?.traceId ?? null,
          ]
        );

        await pg.query("COMMIT");
      } catch (err) {
        try {
          await pg.query("ROLLBACK");
        } catch (rollbackErr) {
          console.error("replay rollback failed", rollbackErr);
        }
        throw err;
      }

      const response = withTraceId(res, {
        ok: true,
        reverted_to: plan.revertedTo ?? null,
      });
      res.json(response);
      await appendAudit({
        type: "events.replay",
        trace_id: res.locals?.traceId ?? null,
        tree_id: normalizedTreeId,
        changed: true,
        target: to ?? null,
        reverted_to: plan.revertedTo ?? null,
      });
    })
  );

  router.use((err, _req, res, _next) => {
    if (err instanceof HttpError) {
      respondWithError(res, err);
      return;
    }
    respondWithError(res, {
      status: 500,
      code: "events_error",
      message: "failed to process events request",
      detail: err?.message,
    });
  });

  return router;
}
