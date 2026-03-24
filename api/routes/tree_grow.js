import express from "express";

import { HttpError, wrapAsync } from "../lib/errors.js";
import { withTraceId, getTraceId } from "../lib/trace.js";
import {
  acceptDevEndpointsEnabled,
  addNode,
  addEdge,
  grow,
} from "../services/tree/index.js";

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

function validateLabel(label) {
  if (typeof label !== "string" || label.trim() === "") {
    throw new HttpError({
      status: 400,
      code: "invalid_label",
      message: "label is required and must be a non-empty string",
      hint: "Provide a valid label for the node",
    });
  }
  return label.trim();
}

function validateNodeId(id, fieldName = "id") {
  if (typeof id !== "string" || id.trim() === "") {
    throw new HttpError({
      status: 400,
      code: `invalid_${fieldName}`,
      message: `${fieldName} is required and must be a non-empty string`,
      hint: `Provide a valid ${fieldName}`,
    });
  }
  return id.trim();
}

export default function createTreeGrowRouter({ treeAdapter = null } = {}) {
  const router = express.Router();

  router.post(
    "/nodes",
    wrapAsync(async (req, res) => {
      ensureDevEndpoints(treeAdapter);

      const { label, parent_id, meta } = req.body || {};
      const tree = req.query.tree || "demo";

      const validLabel = validateLabel(label);
      const validParentId = parent_id ? validateNodeId(parent_id, "parent_id") : null;
      const validMeta = meta && typeof meta === "object" ? meta : {};

      try {
        const traceId = getTraceId(res);
        const node = await addNode({
          tree,
          label: validLabel,
          parent_id: validParentId,
          meta: validMeta,
        }, traceId);

        const payload = withTraceId(res, {
          ok: true,
          node,
        });

        res.status(201).json(payload);
      } catch (err) {
        if (err.message && err.message.includes("not found")) {
          throw new HttpError({
            status: 404,
            code: "parent_not_found",
            message: "parent node does not exist",
            detail: err.message,
          });
        }
        throw err;
      }
    }),
  );

  router.post(
    "/edges",
    wrapAsync(async (req, res) => {
      ensureDevEndpoints(treeAdapter);

      const { parent_id, child_id } = req.body || {};
      const tree = req.query.tree || "demo";

      const validParentId = validateNodeId(parent_id, "parent_id");
      const validChildId = validateNodeId(child_id, "child_id");

      if (validParentId === validChildId) {
        throw new HttpError({
          status: 422,
          code: "self_reference",
          message: "parent_id cannot equal child_id",
          hint: "Edges cannot create cycles to themselves",
        });
      }

      try {
        const traceId = getTraceId(res);
        const edge = await addEdge({
          tree,
          parent_id: validParentId,
          child_id: validChildId,
        }, traceId);

        const payload = withTraceId(res, {
          ok: true,
          edge,
        });

        res.status(201).json(payload);
      } catch (err) {
        if (err.message && err.message.includes("not found")) {
          throw new HttpError({
            status: 404,
            code: "node_not_found",
            message: "parent or child node does not exist",
            detail: err.message,
          });
        }
        throw err;
      }
    }),
  );

  router.post(
    "/grow",
    wrapAsync(async (req, res) => {
      ensureDevEndpoints(treeAdapter);

      const { label, parent_id, meta } = req.body || {};
      const tree = req.query.tree || "demo";

      const validLabel = validateLabel(label);
      const validParentId = parent_id ? validateNodeId(parent_id, "parent_id") : "root";
      const validMeta = meta && typeof meta === "object" ? meta : {};

      try {
        const traceId = getTraceId(res);
        const result = await grow({
          tree,
          parent_id: validParentId,
          label: validLabel,
          meta: validMeta,
        }, traceId);

        const payload = withTraceId(res, {
          ok: true,
          node: result.node,
          edge: result.edge,
        });

        res.status(201).json(payload);
      } catch (err) {
        if (err.message && err.message.includes("not found")) {
          throw new HttpError({
            status: 404,
            code: "parent_not_found",
            message: "parent node does not exist",
            detail: err.message,
          });
        }
        if (err.message && err.message.includes("cycle")) {
          throw new HttpError({
            status: 422,
            code: "cycle_detected",
            message: "cannot create circular reference",
            detail: err.message,
          });
        }
        throw err;
      }
    }),
  );

  return router;
}
