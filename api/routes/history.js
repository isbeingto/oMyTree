import express from "express";

import { HttpError, wrapAsync } from "../lib/errors.js";
import { withTraceId, getTraceId } from "../lib/trace.js";
import {
  createSnapshot,
  listSnapshots,
  getSnapshotById,
  replaySnapshot,
} from "../services/tree/index.js";

export default function createHistoryRouter() {
  const router = express.Router();

  // POST /api/history/snapshot - Create a snapshot
  router.post(
    "/snapshot",
    wrapAsync(async (req, res) => {
      const { tree = "demo", meta = null } = req.body;

      if (typeof tree !== "string" || tree.trim() === "") {
        throw new HttpError({
          status: 400,
          code: "invalid_tree",
          message: "tree must be a non-empty string",
        });
      }

      const traceId = getTraceId(req);
      const snapshot = await createSnapshot({ tree, meta }, traceId);

      res
        .status(201)
        .json(withTraceId(res, {
          ok: true,
          snapshot_id: snapshot.id,
          totals: snapshot.totals,
        }));
    })
  );

  // GET /api/history/list?tree=demo&limit=20 - List snapshots
  router.get(
    "/list",
    wrapAsync(async (req, res) => {
      const tree = req.query.tree || "demo";
      const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));

      const snapshots = await listSnapshots({ tree, limit });

      // Set trace_id header instead of including in response body for arrays
      const traceId = res.locals?.traceId;
      if (traceId) {
        res.set('X-Trace-Id', traceId);
      }

      res
        .status(200)
        .json(snapshots);
    })
  );

  // GET /api/history/:id - Get a specific snapshot
  router.get(
    "/:id",
    wrapAsync(async (req, res) => {
      const snapshotId = req.params.id;

      if (!snapshotId) {
        throw new HttpError({
          status: 400,
          code: "invalid_snapshot_id",
          message: "snapshot_id is required",
        });
      }

      const snapshot = await getSnapshotById(snapshotId);

      if (!snapshot) {
        throw new HttpError({
          status: 404,
          code: "snapshot_not_found",
          message: `snapshot ${snapshotId} not found`,
        });
      }

      res
        .status(200)
        .json(withTraceId(res, snapshot));
    })
  );

  // POST /api/history/replay - Replay a snapshot
  router.post(
    "/replay",
    wrapAsync(async (req, res) => {
      const { id } = req.body;

      if (!id) {
        throw new HttpError({
          status: 400,
          code: "missing_snapshot_id",
          message: "id is required",
        });
      }

      const traceId = getTraceId(req);

      try {
        const result = await replaySnapshot(id, traceId);

        res
          .status(200)
          .json(withTraceId(res, {
            ok: true,
            id: result.id,
            totals: result.totals,
          }));
      } catch (err) {
        if (err.message && err.message.includes("not found")) {
          throw new HttpError({
            status: 404,
            code: "snapshot_not_found",
            message: `snapshot ${id} not found`,
          });
        }
        throw err;
      }
    })
  );

  return router;
}
