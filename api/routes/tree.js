import express from "express";

import { ensureCoreSchema } from "../lib/db.js";
import { HttpError, wrapAsync } from "../lib/errors.js";
import { getAuthUserIdForRequest } from "../lib/auth_user.js";
import { assertTreeOwnership } from "../lib/tree_access.js";
import { withTraceId, getTraceId } from "../lib/trace.js";
import {
  acceptDevEndpointsEnabled,
  loadDemoSnapshot,
  resetTree,
  reloadTreeSnapshotFromAdapter,
} from "../services/tree/index.js";
import { getTreeSnapshot, getTreeInfo } from "../services/tree/snapshot.js";
import { updateRootTopic, TopicSemanticGuardError } from "../services/tree/update_topic.js";
import { exportTree as exportTreeSnapshot } from "../services/tree/export.js";
import { importTree as importTreeSnapshot } from "../services/tree/import.js";
import { previewTreeRollback } from "../services/tree/rollback.js";

function ensureDevEndpoints(treeAdapter) {
  if (!acceptDevEndpointsEnabled()) {
    throw new HttpError({
      status: 404,
      code: "tree_dev_endpoints_disabled",
      message: "tree development endpoints are disabled",
    });
  }

  if (!treeAdapter) {
    throw new HttpError({
      status: 503,
      code: "tree_adapter_unavailable",
      message: "tree adapter is not configured",
    });
  }
}

function toSnapshotPayload(snapshot) {
  const nodes = Array.isArray(snapshot?.nodes) ? snapshot.nodes : [];
  const edges = Array.isArray(snapshot?.edges) ? snapshot.edges : [];
  const meta = snapshot?.meta && typeof snapshot.meta === "object"
    ? snapshot.meta
    : {
        total_nodes: nodes.length,
        total_edges: edges.length,
        total: nodes.length,
      };

  return { nodes, edges, meta };
}

export default function createTreeRouter(pg, { treeAdapter = null } = {}) {
  const router = express.Router();

  router.get(
    "/:id/nodes",
    wrapAsync(async (req, res) => {
      const treeId = typeof req.params.id === "string" ? req.params.id.trim() : "";

      if (!treeId) {
        throw new HttpError({
          status: 400,
          code: "invalid_tree_id",
          message: "tree id is required",
          hint: "Provide the tree id as part of the URL",
        });
      }

      const userId = await getAuthUserIdForRequest(req, pg);
      await assertTreeOwnership(pg, treeId, userId);

      const limitRaw = req.query.limit;
      const limitParsed = typeof limitRaw === "string" ? parseInt(limitRaw, 10) : NaN;
      const limit = Math.max(1, Math.min(Number.isFinite(limitParsed) ? limitParsed : 40, 200));

      const { rows } = await pg.query(
        `SELECT id, tree_id, parent_id, level, role, text, reasoning_content, created_at
         FROM nodes
         WHERE tree_id = $1
           AND soft_deleted_at IS NULL
         ORDER BY level ASC, created_at ASC
         LIMIT $2`,
        [treeId, limit],
      );

      res
        .status(200)
        .set("Cache-Control", "no-store")
        .json(withTraceId(res, {
          ok: true,
          nodes: rows,
          limit,
        }));
    }),
  );

  router.get(
    "/demo",
    wrapAsync(async (_req, res) => {
      const snapshot = toSnapshotPayload(await loadDemoSnapshot());
      const payload = withTraceId(res, {
        id: "demo",
        title: "Bridge Demo Tree",
        nodes: snapshot.nodes,
        edges: snapshot.edges,
        meta: snapshot.meta,
      });

      res.json(payload);
    }),
  );

  router.post(
    "/reset",
    wrapAsync(async (req, res) => {
      ensureDevEndpoints(treeAdapter);
      const traceId = getTraceId(res);
      await resetTree(traceId);
      const snapshot = toSnapshotPayload(await reloadTreeSnapshotFromAdapter());
      const payload = withTraceId(res, {
        ok: true,
        nodes: snapshot.nodes.length,
        edges: snapshot.edges.length,
      });

      res
        .status(200)
        .set("Cache-Control", "no-store")
        .json(payload);
    }),
  );

  router.post(
    "/seed",
    wrapAsync(async (_req, res) => {
      ensureDevEndpoints(treeAdapter);
      await treeAdapter.seed();
      const snapshot = toSnapshotPayload(await reloadTreeSnapshotFromAdapter());
      const payload = withTraceId(res, {
        ok: true,
        nodes: snapshot.nodes.length,
        edges: snapshot.edges.length,
      });

      res
        .status(200)
        .set("Cache-Control", "no-store")
        .json(payload);
    }),
  );

  router.post(
    "/import",
    wrapAsync(async (req, res) => {
      const body = typeof req.body === "object" && req.body !== null ? req.body : {};
      const result = await importTreeSnapshot(pg, body, { preserveSoftDeleted: true });
      res
        .status(200)
        .set("Cache-Control", "no-store")
        .json(withTraceId(res, result));
    }),
  );

  router.get(
    "/:id/export",
    wrapAsync(async (req, res) => {
      const treeId = typeof req.params.id === "string" ? req.params.id.trim() : "";
      if (!treeId) {
        throw new HttpError({
          status: 400,
          code: "INVALID_TREE_ID",
          message: "tree id is required",
        });
      }
      const userId = await getAuthUserIdForRequest(req, pg);
      await assertTreeOwnership(pg, treeId, userId);
      const includeSoftDeletedRaw =
        typeof req.query.include_soft_deleted !== "undefined"
          ? req.query.include_soft_deleted
          : req.query.includeSoftDeleted;
      const payload = await exportTreeSnapshot(pg, treeId, {
        includeSoftDeleted: includeSoftDeletedRaw,
      });
      res
        .status(200)
        .set("Cache-Control", "no-store")
        .json(
          withTraceId(res, {
            ok: true,
            ...payload,
          }),
        );
    }),
  );

  router.get(
    "/:id",
    wrapAsync(async (req, res) => {
      const treeId = req.params.id;

      if (typeof treeId !== "string" || treeId.trim() === "") {
        throw new HttpError({
          status: 400,
          code: "invalid_tree_id",
          message: "tree id is required",
          hint: "Provide the tree id as part of the URL",
        });
      }

      const normalizedTreeId = treeId.trim();
      const userId = await getAuthUserIdForRequest(req, pg);
      await assertTreeOwnership(pg, normalizedTreeId, userId);

      const reportResult = await pg.query(
        'SELECT narrative_report, narrative_report_updated_at FROM trees WHERE id = $1',
        [normalizedTreeId],
      );
      const reportRow = reportResult.rows[0] || {};
      
      // T1-1: Get root node from new schema
      const rootResult = await pg.query(
        `SELECT n.id, n.tree_id, n.parent_id, n.level, n.role, n.text, n.created_at
         FROM nodes n 
         WHERE n.tree_id = $1 AND n.parent_id IS NULL AND n.level = 0
         LIMIT 1`,
        [normalizedTreeId]
      );

      if (rootResult.rowCount === 0) {
        throw new HttpError({
          status: 404,
          code: "tree_root_not_found",
          message: "tree root not found",
        });
      }

      const root = rootResult.rows[0];
      const payload = withTraceId(res, {
        ok: true,
        narrative_report: reportRow.narrative_report || null,
        narrative_report_updated_at: reportRow.narrative_report_updated_at || null,
        root: {
          id: root.id,
          tree_id: root.tree_id,
          parent_id: root.parent_id,
          level: root.level,
          role: root.role,
          text: root.text,
          created_at: root.created_at,
        },
      });

      res.json(payload);
    }),
  );

  router.get(
    "/:id/snapshot",
    wrapAsync(async (req, res) => {
      const treeId = req.params.id;

      if (typeof treeId !== "string" || treeId.trim() === "") {
        throw new HttpError({
          status: 400,
          code: "invalid_tree_id",
          message: "tree id is required",
        });
      }

      const normalizedTreeId = treeId.trim();

      // 解析查询参数
      const maxDepth = req.query.maxDepth ? parseInt(req.query.maxDepth, 10) : 6;
      const maxNodes = req.query.maxNodes ? parseInt(req.query.maxNodes, 10) : 512;

      try {
        // 获取树信息
        const treeInfo = await getTreeInfo(normalizedTreeId);
        if (!treeInfo) {
          throw new HttpError({
            status: 404,
            code: "TREE_NOT_FOUND",
            message: "tree not found",
          });
        }

        // 获取树快照
        const root = await getTreeSnapshot(normalizedTreeId, maxDepth, maxNodes);
        if (!root) {
          throw new HttpError({
            status: 404,
            code: "TREE_NOT_FOUND",
            message: "tree root not found",
          });
        }

        const payload = withTraceId(res, {
          ok: true,
          tree: {
            id: normalizedTreeId,
            topic: treeInfo.topic,
            context_profile: treeInfo.context_profile,
            memory_scope: treeInfo.memory_scope,
            root: root,
          },
        });

        res.json(payload);
      } catch (e) {
        if (e.status === 422 || e.message === 'LIMIT_EXCEEDED') {
          throw new HttpError({
            status: 422,
            code: "LIMIT_EXCEEDED",
            message: "tree exceeds size limits",
          });
        }
        throw e;
      }
    }),
  );

  router.get(
    "/:id/rollback/preview",
    wrapAsync(async (req, res) => {
      const treeId = typeof req.params.id === "string" ? req.params.id.trim() : "";
      if (!treeId) {
        throw new HttpError({
          status: 400,
          code: "INVALID_TREE_ID",
          message: "tree id is required",
        });
      }
      const turnsRaw =
        typeof req.query?.n !== "undefined"
          ? req.query.n
          : typeof req.query?.turns !== "undefined"
            ? req.query.turns
            : req.query?.count;
      const userId = await getAuthUserIdForRequest(req, pg);
      const preview = await previewTreeRollback(pg, {
        treeId,
        turns: turnsRaw,
        userId,
      });
      res
        .status(200)
        .set("Cache-Control", "no-store")
        .json(withTraceId(res, {
          ok: true,
          preview,
        }));
    }),
  );

  router.patch(
    "/topic",
    wrapAsync(async (req, res) => {
      const body = typeof req.body === "object" && req.body !== null ? req.body : {};
      const treeId = typeof body.tree_id === "string" ? body.tree_id.trim() : "";
      const topicText = typeof body.topic_text === "string" ? body.topic_text : "";
      const updatedBy = typeof body.updated_by === "string" ? body.updated_by : "system";
      const breadcrumb = Array.isArray(body.breadcrumb) ? body.breadcrumb : [];
      const providerOverride = typeof body.provider === "string"
        ? body.provider
        : typeof req.query.provider === "string"
          ? req.query.provider
          : null;

      if (!treeId) {
        res.status(422).json(withTraceId(res, {
          ok: false,
          code: "INVALID_TREE_ID",
          message: "tree_id is required",
        }));
        return;
      }

      if (!topicText || topicText.trim().length === 0) {
        res.status(422).json(withTraceId(res, {
          ok: false,
          code: "INVALID_TOPIC",
          message: "topic_text is required",
        }));
        return;
      }

      const userId = await getAuthUserIdForRequest(req, pg);
      try {
        const result = await updateRootTopic({
          treeId,
          topicText,
          updatedBy,
          breadcrumb,
          providerOverride,
          traceId: res.locals?.traceId ?? null,
          userId,
        });

        res.status(200).json(withTraceId(res, {
          ok: true,
          tree_id: result.tree_id,
          root_id: result.root_id,
          topic_text: result.topic_text,
          updated: result.updated,
          guard: result.guard,
        }));
      } catch (error) {
        if (error instanceof TopicSemanticGuardError) {
          const payload = {
            ok: false,
            code: error.code || "ROOT_TOPIC_UPDATE_FAILED",
            message: error.message,
          };
          if (error.guard) {
            payload.diff_summary = error.guard.diff_summary ?? "";
            payload.score = Number.isFinite(error.guard.score) ? error.guard.score : null;
            payload.guard = error.guard;
          }
          const status = error.status || 500;
          res.status(status).json(withTraceId(res, payload));
          return;
        }

        throw error;
      }
    }),
  );

  return router;
}
