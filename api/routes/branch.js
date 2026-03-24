import express from "express";
import { randomUUID } from "crypto";

import { appendAudit } from "../lib/audit.js";
import { ensureCoreSchema, touchTree } from "../lib/db.js";
import { HttpError, respondWithError, wrapAsync } from "../lib/errors.js";
import { withTraceId } from "../lib/trace.js";
import { getAuthUserIdForRequest } from "../lib/auth_user.js";
import { assertTreeOwnership } from "../lib/tree_access.js";

function validateString(value) {
  return typeof value === "string" && value.trim() !== "";
}

export default function createBranchRouter(pg) {
  const router = express.Router();

  router.post(
    "/suggest",
    wrapAsync(async (req, res) => {
      await ensureCoreSchema(pg);
      const { conversation, last_node: lastNode } = req.body ?? {};
      const traceId = res.locals?.traceId;

      if (!validateString(conversation)) {
        throw new HttpError({
          status: 400,
          code: "invalid_conversation",
          message: "conversation is required",
          hint: "Provide a non-empty conversation identifier",
        });
      }

      if (!validateString(lastNode)) {
        throw new HttpError({
          status: 400,
          code: "invalid_last_node",
          message: "last_node is required",
          hint: "Provide the node id being expanded",
        });
      }

      const treeId = conversation.trim();
      const userId = await getAuthUserIdForRequest(req, pg);
      await assertTreeOwnership(pg, treeId, userId);
      await touchTree(pg, treeId, `Conversation ${treeId}`);

      const parentResult = await pg.query(
        `SELECT node_id FROM tree_node WHERE tree_id = $1 AND node_id = $2`,
        [treeId, lastNode]
      );

      if (parentResult.rowCount === 0) {
        if (lastNode === "root") {
          await pg.query(
            `INSERT INTO tree_node(tree_id, node_id, parent_id, title, summary, status, trace_id)
             VALUES($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (tree_id, node_id) DO NOTHING`,
            [treeId, "root", null, "Root", null, "confirmed", traceId]
          );
        } else {
          throw new HttpError({
            status: 422,
            code: "parent_missing",
            message: "parent node not found",
            hint: "Confirm the node exists before suggesting branches",
            detail: { treeId, lastNode },
          });
        }
      }

      const candidateId = `cand_${randomUUID()}`;
      const title = `Follow-up for ${lastNode}`;
      const summary = null;

      await pg.query(
        `INSERT INTO branch_candidate(tree_id, candidate_id, parent_id, title, summary, status, trace_id)
         VALUES($1, $2, $3, $4, $5, $6, $7)`,
        [treeId, candidateId, lastNode, title, summary, "candidate", traceId]
      );

      const response = withTraceId(res, {
        candidates: [
          {
            id: candidateId,
            title,
            summary,
            parent_id: lastNode,
            status: "candidate",
            source: {
              ai_confidence: null,
              reason: null,
            },
          },
        ],
      });

      res.json(response);
    })
  );

  router.post(
    "/confirm",
    wrapAsync(async (req, res) => {
      await ensureCoreSchema(pg);
      const { candidate_id: candidateId, action } = req.body ?? {};

      if (!validateString(candidateId)) {
        throw new HttpError({
          status: 400,
          code: "invalid_candidate",
          message: "candidate_id is required",
          hint: "Provide the candidate identifier returned from suggest",
        });
      }

      if (action !== "accept" && action !== "reject") {
        throw new HttpError({
          status: 400,
          code: "invalid_action",
          message: "action must be accept or reject",
          hint: "Use one of: accept, reject",
        });
      }

      const traceId = res.locals?.traceId ?? null;
      const client = pg;
      const userId = await getAuthUserIdForRequest(req, client);

      await client.query("BEGIN");
      try {
        const candidateResult = await client.query(
          `SELECT bc.tree_id, bc.candidate_id, bc.parent_id, bc.title, bc.summary, bc.status, bc.trace_id, bc.confirmed_node_id
             FROM branch_candidate bc
             JOIN trees t ON t.id = bc.tree_id
            WHERE bc.candidate_id = $1
              AND t.user_id = $2
            FOR UPDATE`,
          [candidateId, userId]
        );

        if (candidateResult.rowCount === 0) {
          throw new HttpError({
            status: 404,
            code: "candidate_not_found",
            message: "candidate not found",
            hint: "Call /api/branch/suggest before confirm",
            detail: candidateId,
          });
        }

        const candidate = candidateResult.rows[0];

        if (action === "reject") {
          if (candidate.status === "rejected") {
            await client.query("COMMIT");
            res.json(withTraceId(res, { ok: true }));
            await appendAudit({
              type: "branch.confirm.reject",
              trace_id: traceId,
              tree_id: candidate.tree_id,
              candidate_id: candidateId,
            });
            return;
          }

          if (candidate.status === "accepted") {
            throw new HttpError({
              status: 409,
              code: "candidate_already_confirmed",
              message: "candidate already accepted",
              hint: "Reject is not allowed after acceptance",
            });
          }

          await client.query(
            `UPDATE branch_candidate
                SET status = $2, updated_at = now()
              WHERE candidate_id = $1`,
            [candidateId, "rejected"]
          );

          await client.query(
            `INSERT INTO tree_event(tree_id, event_id, type, payload, trace_id)
             VALUES($1, $2, $3, $4, $5)`,
            [
              candidate.tree_id,
              `evt_${randomUUID()}`,
              "branch.confirm.rejected",
              {
                candidate_id: candidateId,
                parent_id: candidate.parent_id,
                trace_id: traceId,
                action,
              },
              traceId,
            ]
          );

          await client.query("COMMIT");
          res.json(withTraceId(res, { ok: true }));
          await appendAudit({
            type: "branch.confirm.reject",
            trace_id: traceId,
            tree_id: candidate.tree_id,
            candidate_id: candidateId,
          });
          return;
        }

        if (candidate.status === "accepted") {
          const nodeResult = await client.query(
            `SELECT node_id, parent_id, title, status
               FROM tree_node
              WHERE tree_id = $1 AND node_id = $2`,
            [candidate.tree_id, candidate.confirmed_node_id]
          );

          await client.query("COMMIT");

          if (nodeResult.rowCount === 0) {
            throw new HttpError({
              status: 500,
              code: "node_missing",
              message: "confirmed node missing",
              hint: "Contact support with trace id",
            });
          }

          const node = nodeResult.rows[0];
          res.json(
            withTraceId(res, {
              ok: true,
              new_node: {
                id: node.node_id,
                parent_id: node.parent_id,
                title: node.title,
                status: node.status,
              },
            })
          );
          await appendAudit({
            type: "branch.confirm.accept",
            trace_id: traceId,
            tree_id: candidate.tree_id,
            candidate_id: candidateId,
            node_id: node.node_id,
            idempotent: true,
          });
          return;
        }

        const parentId = candidate.parent_id;
        if (parentId) {
          const parentCheck = await client.query(
            `SELECT status FROM tree_node WHERE tree_id = $1 AND node_id = $2`,
            [candidate.tree_id, parentId]
          );

          if (parentCheck.rowCount === 0 || parentCheck.rows[0].status !== "confirmed") {
            throw new HttpError({
              status: 409,
              code: "parent_not_confirmed",
              message: "parent is not confirmed",
              hint: "Confirm parent node first",
              detail: { parentId },
            });
          }
        }

        const nodeId = candidate.confirmed_node_id || `node_${randomUUID()}`;

        await client.query(
          `INSERT INTO tree_node(tree_id, node_id, parent_id, title, summary, status, trace_id)
           VALUES($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (tree_id, node_id) DO UPDATE SET updated_at = now()`,
          [
            candidate.tree_id,
            nodeId,
            parentId,
            candidate.title,
            candidate.summary,
            "confirmed",
            traceId,
          ]
        );

        await client.query(
          `UPDATE branch_candidate
              SET status = $2, confirmed_node_id = $3, updated_at = now()
            WHERE candidate_id = $1`,
          [candidateId, "accepted", nodeId]
        );

        const eventId = `evt_${randomUUID()}`;
        await client.query(
          `INSERT INTO tree_event(tree_id, event_id, type, payload, trace_id)
           VALUES($1, $2, $3, $4, $5)`,
          [
            candidate.tree_id,
            eventId,
            "branch.confirm.accepted",
            {
              candidate_id: candidateId,
              node_id: nodeId,
              parent_id: parentId,
              title: candidate.title,
              summary: candidate.summary,
              trace_id: traceId,
            },
            traceId,
          ]
        );

        await client.query("COMMIT");

        const payload = {
          ok: true,
          new_node: {
            id: nodeId,
            parent_id: parentId,
            title: candidate.title,
            status: "confirmed",
          },
        };

        res.json(withTraceId(res, payload));

        await appendAudit({
          type: "branch.confirm.accept",
          trace_id: traceId,
          tree_id: candidate.tree_id,
          candidate_id: candidateId,
          node_id: nodeId,
          event_id: eventId,
        });
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackErr) {
          console.error("confirm rollback failed", rollbackErr);
        }
        if (err instanceof HttpError) {
          respondWithError(res, err);
          return;
        }
        respondWithError(res, {
          status: 500,
          code: "confirm_failed",
          message: "failed to confirm branch",
          detail: err?.message,
        });
      }
    })
  );

  return router;
}
