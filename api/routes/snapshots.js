import express from 'express';
import { HttpError, wrapAsync } from '../lib/errors.js';
import { withTraceId, getTraceId } from '../lib/trace.js';
import { generateSnapshot, listSnapshotsForTree, getSnapshotById, updateSnapshotMeta } from '../services/snapshot/generate.js';

const VALID_MODES = new Set(['incremental', 'full']);

function normalizeMode(value) {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return VALID_MODES.has(raw) ? raw : 'incremental';
}

export default function createSnapshotsRouter() {
  const router = express.Router();

  router.post(
    '/api/trees/:treeId/snapshots',
    wrapAsync(async (req, res) => {
      const treeId = req.params.treeId;
      if (!treeId) {
        throw new HttpError({ status: 400, code: 'invalid_tree_id', message: 'treeId is required' });
      }
      const scopeNodeId = req.body?.scope_node_id || null;
      const mode = normalizeMode(req.body?.mode);
      const pinned = Boolean(req.body?.pinned);
      const anchorNodeId = req.body?.anchor_node_id || null; // T55-3: Support explicit anchor
      const traceId = getTraceId(req);
      try {
        const snapshot = await generateSnapshot({
          treeId,
          scopeNodeId,
          mode,
          pinned,
          userNotes: req.body?.user_notes || null,
          anchorNodeId, // T55-3: Pass anchor node ID
        });
        res.status(201).json(withTraceId(res, { ok: true, snapshot }));
      } catch (err) {
        if (err.message === 'snapshot_not_found') {
          throw new HttpError({ status: 404, code: 'snapshot_not_found', message: 'base snapshot not found' });
        }
        throw err;
      }
    })
  );

  router.get(
    '/api/trees/:treeId/snapshots',
    wrapAsync(async (req, res) => {
      const treeId = req.params.treeId;
      const scopeNodeId = req.query.scope_node_id || null;
      const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 20, 100));
      const snapshots = await listSnapshotsForTree(treeId, { scopeNodeId, limit });
      res.status(200).json(withTraceId(res, { snapshots }));
    })
  );

  router.get(
    '/api/snapshots/:id',
    wrapAsync(async (req, res) => {
      const snapshot = await getSnapshotById(req.params.id);
      if (!snapshot) {
        throw new HttpError({ status: 404, code: 'snapshot_not_found', message: 'Snapshot not found' });
      }
      res.status(200).json(withTraceId(res, { snapshot }));
    })
  );

  router.patch(
    '/api/snapshots/:id',
    wrapAsync(async (req, res) => {
      const pinned = req.body?.pinned;
      const userNotes = req.body?.user_notes;
      if (pinned === undefined && userNotes === undefined) {
        throw new HttpError({ status: 400, code: 'no_updates', message: 'pinned or user_notes required' });
      }
      const updated = await updateSnapshotMeta(req.params.id, { pinned, userNotes });
      res.status(200).json(withTraceId(res, { snapshot: updated }));
    })
  );

  // T55-3: Get snapshot anchors for a tree
  router.get(
    '/api/trees/:treeId/snapshot-anchors',
    wrapAsync(async (req, res) => {
      const treeId = req.params.treeId;
      if (!treeId) {
        throw new HttpError({ status: 400, code: 'invalid_tree_id', message: 'treeId is required' });
      }
      const { pool } = await import('../db/pool.js');
      const { rows } = await pool.query(
        `SELECT sa.snapshot_id, sa.anchor_node_id, sa.label, rs.ts, rs.pinned
         FROM snapshot_anchors sa
         JOIN resume_snapshots rs ON sa.snapshot_id = rs.id
         WHERE rs.tree_id = $1
         ORDER BY rs.ts DESC`,
        [treeId]
      );
      res.status(200).json(withTraceId(res, { anchors: rows }));
    })
  );

  return router;
}
