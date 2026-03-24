import express from "express";

import { HttpError, wrapAsync } from "../lib/errors.js";
import { withTraceId, getTraceId } from "../lib/trace.js";
import { importSnapshot } from "../services/tree/index.js";

export default function createTreeImportRouter() {
  const router = express.Router();

  router.post(
    "/import.json",
    express.json({ limit: "5mb" }), // Override global 1mb limit for import
    wrapAsync(async (req, res) => {
      const body = req.body;

      // Validate version
      if (body.version !== "0.4-lite") {
        throw new HttpError({
          status: 400,
          code: "invalid_version",
          message: `version must be "0.4-lite", got "${body.version}"`,
        });
      }

      // Validate required fields
      if (!body.tree || typeof body.tree !== "string") {
        throw new HttpError({
          status: 400,
          code: "missing_field",
          message: "field 'tree' is required and must be a string",
        });
      }

      if (!Array.isArray(body.nodes)) {
        throw new HttpError({
          status: 400,
          code: "missing_field",
          message: "field 'nodes' is required and must be an array",
        });
      }

      if (!Array.isArray(body.edges)) {
        throw new HttpError({
          status: 400,
          code: "missing_field",
          message: "field 'edges' is required and must be an array",
        });
      }

      // Get mode from query or body, default to truncate-then-import
      const mode = req.query.mode || body.mode || "truncate-then-import";
      
      if (mode !== "truncate-then-import" && mode !== "merge-upsert") {
        throw new HttpError({
          status: 400,
          code: "invalid_mode",
          message: `mode must be "truncate-then-import" or "merge-upsert", got "${mode}"`,
        });
      }

      // Validate nodes have required fields
      for (let i = 0; i < body.nodes.length; i++) {
        const node = body.nodes[i];
        if (!node.id || typeof node.id !== "string" || !node.id.trim()) {
          throw new HttpError({
            status: 400,
            code: "invalid_node",
            message: `node at index ${i} must have a non-empty 'id' field`,
          });
        }
      }

      // Validate edges have required fields
      for (let i = 0; i < body.edges.length; i++) {
        const edge = body.edges[i];
        if (!edge.id || typeof edge.id !== "string" || !edge.id.trim()) {
          throw new HttpError({
            status: 400,
            code: "invalid_edge",
            message: `edge at index ${i} must have a non-empty 'id' field`,
          });
        }
        if (!edge.source || typeof edge.source !== "string" || !edge.source.trim()) {
          throw new HttpError({
            status: 400,
            code: "invalid_edge",
            message: `edge at index ${i} must have a non-empty 'source' field`,
          });
        }
        if (!edge.target || typeof edge.target !== "string" || !edge.target.trim()) {
          throw new HttpError({
            status: 400,
            code: "invalid_edge",
            message: `edge at index ${i} must have a non-empty 'target' field`,
          });
        }
      }

      // Build node ID set for validation
      const nodeIds = new Set(body.nodes.map(n => n.id));

      // Validate edge references
      for (let i = 0; i < body.edges.length; i++) {
        const edge = body.edges[i];
        if (!nodeIds.has(edge.source)) {
          throw new HttpError({
            status: 422,
            code: "invalid_reference",
            message: `edge at index ${i} references non-existent source node "${edge.source}"`,
          });
        }
        if (!nodeIds.has(edge.target)) {
          throw new HttpError({
            status: 422,
            code: "invalid_reference",
            message: `edge at index ${i} references non-existent target node "${edge.target}"`,
          });
        }
      }

      // Import the snapshot
      try {
        const traceId = getTraceId(res);
        const result = await importSnapshot(
          { nodes: body.nodes, edges: body.edges },
          { mode, traceId }
        );

        const payload = withTraceId(res, {
          ok: true,
          tree: body.tree,
          mode,
          imported: {
            nodes: result.nodes,
            edges: result.edges,
          },
        });

        res
          .status(200)
          .set("Content-Type", "application/json; charset=utf-8")
          .set("Cache-Control", "no-store")
          .json(payload);
      } catch (err) {
        throw new HttpError({
          status: 500,
          code: "import_failed",
          message: "failed to import snapshot",
          detail: err?.message,
        });
      }
    })
  );

  return router;
}
