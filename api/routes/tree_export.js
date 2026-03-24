import express from "express";

import { HttpError, wrapAsync } from "../lib/errors.js";
import { withTraceId } from "../lib/trace.js";
import { loadDemoSnapshot } from "../services/tree/index.js";

export default function createTreeExportRouter() {
  const router = express.Router();

  router.get(
    "/export.json",
    wrapAsync(async (req, res) => {
      const treeName = req.query.tree || "demo";

      // For now, we only support "demo"
      if (treeName !== "demo") {
        throw new HttpError({
          status: 400,
          code: "invalid_tree",
          message: `tree "${treeName}" is not supported`,
        });
      }

      // Reuse the existing service to load the demo snapshot
      const snapshot = await loadDemoSnapshot();

      const nodes = Array.isArray(snapshot?.nodes) ? snapshot.nodes : [];
      const edges = Array.isArray(snapshot?.edges) ? snapshot.edges : [];
      const meta = snapshot?.meta && typeof snapshot.meta === "object"
        ? snapshot.meta
        : {};

      // Build the export payload
      const payload = withTraceId(res, {
        version: "0.4-lite",
        tree: treeName,
        exported_at: new Date().toISOString(),
        totals: {
          nodes: nodes.length,
          edges: edges.length,
        },
        nodes: nodes.map((node) => ({
          id: node.id,
          label: node.label,
          parent_id: node.parent_id ?? null,
          meta: node.meta ?? {},
          created_at: node.created_at ?? null,
          updated_at: node.updated_at ?? null,
        })),
        edges: edges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: edge.label ?? null,
          meta: edge.meta ?? {},
          created_at: edge.created_at ?? null,
          updated_at: edge.updated_at ?? null,
        })),
        meta,
      });

      res
        .status(200)
        .set("Content-Type", "application/json; charset=utf-8")
        .set("Cache-Control", "no-store")
        .json(payload);
    }),
  );

  return router;
}
