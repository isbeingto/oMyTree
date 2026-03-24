/**
 * T58-3: Evidence API Routes
 * T84: Added file download endpoint
 * 
 * Endpoints:
 * - POST /api/evidence - Create evidence
 * - GET /api/evidence/:id - Get evidence details
 * - GET /api/evidence/:id/download - Download file evidence (T84)
 * - GET /api/evidence/:id/nodes - List attached nodes for an evidence item
 * - GET /api/trees/:treeId/evidence - List tree evidence
 * - POST /api/nodes/:id/evidence/:evidenceId - Attach evidence to node
 * - DELETE /api/nodes/:id/evidence/:evidenceId - Detach evidence from node
 * - GET /api/nodes/:id/evidence - List node evidence
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { HttpError, wrapAsync } from '../lib/errors.js';
import { getAuthUserIdForRequest } from '../lib/auth_user.js';
import { assertTreeOwnership } from '../lib/tree_access.js';
import { withTraceId } from '../lib/trace.js';
import {
  createEvidence,
  getEvidenceById,
  listEvidenceForTree,
  attachEvidenceToNode,
  detachEvidenceFromNode,
  listEvidenceForNode,
  listNodesForEvidence,
} from '../services/evidence/evidence_service.js';
import { recordTrailEvent } from '../services/trail/trail_events.js';
import { recordEvidenceMention } from '../services/ledger/ledger_service.js';
import { upload } from '../lib/upload.js';

export default function createEvidenceRouter(pg) {
  const router = express.Router();

  /**
   * POST /api/evidence
   * Create a new evidence item
   */
  router.post(
    '/api/evidence',
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      const {
        tree_id: treeId,
        type,
        title,
        summary,
        source_url: sourceUrl,
        text_content: textContent,
        tags,
      } = req.body;

      if (!treeId) {
        throw new HttpError({
          status: 400,
          code: 'missing_tree_id',
          message: 'tree_id is required',
        });
      }

      if (!type) {
        throw new HttpError({
          status: 400,
          code: 'missing_type',
          message: 'type is required (url, file, or text)',
        });
      }

      if (!title) {
        throw new HttpError({
          status: 400,
          code: 'missing_title',
          message: 'title is required',
        });
      }

      // Verify tree ownership
      await assertTreeOwnership(pg, treeId, userId);

      const evidence = await createEvidence({
        treeId,
        type,
        title,
        summary,
        sourceUrl,
        textContent,
        tags: tags || [],
      });

      // T58-3: Record EVIDENCE_CREATED event (trail event)
      await recordTrailEvent({
        treeId,
        type: 'EVIDENCE_CREATED',
        actor: 'user',
        payload: {
          evidence_id: evidence.id,
          evidence_type: type,
          title,
        },
      });

      // T58-3: Record evidence_mention in semantic ledger
      await recordEvidenceMention({
        treeId,
        evidenceId: evidence.id,
        evidenceType: type,
        title,
        action: 'created',
      });

      res.status(201).json(withTraceId(res, { ok: true, evidence }));
    })
  );

  /**
   * GET /api/evidence/:id
   * Get evidence details
   */
  router.get(
    '/api/evidence/:id',
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      const { id } = req.params;

      const evidence = await getEvidenceById(id);

      // Verify tree ownership
      await assertTreeOwnership(pg, evidence.tree_id, userId);

      res.json(withTraceId(res, { ok: true, evidence }));
    })
  );

  /**
   * T84: GET /api/evidence/:id/download
   * Download file evidence
   */
  router.get(
    '/api/evidence/:id/download',
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      const { id } = req.params;

      const evidence = await getEvidenceById(id);

      // Verify tree ownership
      await assertTreeOwnership(pg, evidence.tree_id, userId);

      // Only file evidence can be downloaded
      if (evidence.type !== 'file' || !evidence.stored_path) {
        throw new HttpError({
          status: 400,
          code: 'not_file_evidence',
          message: 'This evidence is not a file and cannot be downloaded',
        });
      }

      // Verify file exists
      const filePath = path.resolve(evidence.stored_path);
      if (!fs.existsSync(filePath)) {
        throw new HttpError({
          status: 404,
          code: 'file_not_found',
          message: 'The evidence file was not found on disk',
        });
      }

      // Set headers for download
      const fileName = evidence.file_name || path.basename(filePath);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
      res.setHeader('Content-Type', evidence.mime_type || 'application/octet-stream');

      // Stream file
      res.sendFile(filePath);
    })
  );

  /**
   * GET /api/evidence/:id/nodes
   * List nodes this evidence is attached to
   */
  router.get(
    '/api/evidence/:id/nodes',
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      const { id } = req.params;

      const evidence = await getEvidenceById(id);
      await assertTreeOwnership(pg, evidence.tree_id, userId);

      const nodes = await listNodesForEvidence(id);
      res.json(withTraceId(res, { ok: true, nodes }));
    })
  );

  /**
   * GET /api/trees/:treeId/evidence
   * List evidence for a tree
   */
  router.get(
    '/api/trees/:treeId/evidence',
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      const { treeId } = req.params;
      const { type, limit, offset } = req.query;

      await assertTreeOwnership(pg, treeId, userId);

      const evidence = await listEvidenceForTree(treeId, {
        type,
        limit: limit ? parseInt(limit, 10) : 100,
        offset: offset ? parseInt(offset, 10) : 0,
      });

      res.json(withTraceId(res, { ok: true, evidence }));
    })
  );

  /**
   * POST /api/nodes/:id/evidence/:evidenceId
   * Attach evidence to a node
   */
  router.post(
    '/api/nodes/:id/evidence/:evidenceId',
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      const { id: nodeId, evidenceId } = req.params;

      // Get evidence to verify tree ownership
      const evidence = await getEvidenceById(evidenceId);
      await assertTreeOwnership(pg, evidence.tree_id, userId);

      // Attach evidence to node
      const result = await attachEvidenceToNode(nodeId, evidenceId);

      // T58-3: Record EVIDENCE_ATTACHED trail event
      if (result.created) {
        await recordTrailEvent({
          treeId: evidence.tree_id,
          type: 'EVIDENCE_ATTACHED',
          actor: 'user',
          nodeId,
          payload: {
            evidence_id: evidenceId,
            evidence_type: evidence.type,
            title: evidence.title,
          },
        });

        // T58-3: Record evidence_mention in semantic ledger
        await recordEvidenceMention({
          treeId: evidence.tree_id,
          evidenceId,
          evidenceType: evidence.type,
          title: evidence.title,
          action: 'attached',
          nodeId,
        });
      }

      res.status(result.created ? 201 : 200).json(
        withTraceId(res, {
          ok: true,
          created: result.created,
          link: result.link,
        })
      );
    })
  );

  /**
   * DELETE /api/nodes/:id/evidence/:evidenceId
   * Detach evidence from a node
   */
  router.delete(
    '/api/nodes/:id/evidence/:evidenceId',
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      const { id: nodeId, evidenceId } = req.params;

      // Get evidence to verify tree ownership
      const evidence = await getEvidenceById(evidenceId);
      await assertTreeOwnership(pg, evidence.tree_id, userId);

      const link = await detachEvidenceFromNode(nodeId, evidenceId);

      res.json(withTraceId(res, { ok: true, detached: true, link }));
    })
  );

  /**
   * GET /api/nodes/:id/evidence
   * List evidence attached to a node
   */
  router.get(
    '/api/nodes/:id/evidence',
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      const { id: nodeId } = req.params;

      // Get node to verify tree ownership
      const { rows: nodeRows } = await pg.query(
        'SELECT tree_id FROM nodes WHERE id = $1',
        [nodeId]
      );

      if (nodeRows.length === 0) {
        throw new HttpError({
          status: 404,
          code: 'node_not_found',
          message: 'Node not found',
        });
      }

      await assertTreeOwnership(pg, nodeRows[0].tree_id, userId);

      const evidence = await listEvidenceForNode(nodeId);

      res.json(withTraceId(res, { ok: true, evidence }));
    })
  );

  /**
   * POST /api/evidence/upload
   * Upload a file as evidence
   */
  router.post(
    '/api/evidence/upload',
    upload.single('file'),
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);

      if (!req.file) {
        throw new HttpError({
          status: 400,
          code: 'missing_file',
          message: 'No file uploaded',
        });
      }

      const { tree_id: treeId, title, summary, tags } = req.body;

      if (!treeId) {
        throw new HttpError({
          status: 400,
          code: 'missing_tree_id',
          message: 'tree_id is required',
        });
      }

      if (!title) {
        throw new HttpError({
          status: 400,
          code: 'missing_title',
          message: 'title is required',
        });
      }

      // Verify tree ownership
      await assertTreeOwnership(pg, treeId, userId);

      // Create evidence record
      const evidence = await createEvidence({
        treeId,
        type: 'file',
        title,
        summary,
        storedPath: req.file.path,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        tags: tags ? JSON.parse(tags) : [],
      });

      // Record trail event
      await recordTrailEvent({
        treeId,
        type: 'EVIDENCE_CREATED',
        actor: 'user',
        payload: {
          evidence_id: evidence.id,
          evidence_type: 'file',
          title,
          file_name: req.file.originalname,
          file_size: req.file.size,
        },
      });

      // Record ledger atom
      await recordEvidenceMention({
        treeId,
        evidenceId: evidence.id,
        evidenceType: 'file',
        title,
        action: 'created',
      });

      res.status(201).json(
        withTraceId(res, {
          ok: true,
          evidence,
          file: {
            originalName: req.file.originalname,
            size: req.file.size,
            mimeType: req.file.mimetype,
          },
        })
      );
    })
  );

  return router;
}
