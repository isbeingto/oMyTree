import express from 'express';
import { getAuthUserIdForRequest } from '../lib/auth_user.js';
import { HttpError, wrapAsync } from '../lib/errors.js';
import { withTraceId } from '../lib/trace.js';
import { buildQANodesForTree } from '../services/tree/qa_model.js';

export default function createTreeQaRouter(pgClient) {
  const router = express.Router();

  router.get(
    '/:id/qa',
    wrapAsync(async (req, res) => {
      const treeId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
      if (!treeId) {
        throw new HttpError({
          status: 422,
          code: 'INVALID_TREE_ID',
          message: 'tree id is required',
        });
      }

      const userId = await getAuthUserIdForRequest(req, pgClient);
      const nodes = await buildQANodesForTree(treeId, { userId, db: pgClient });
      const rootNode = nodes.find((n) => n.parent_id === null) || null;

      // T37-0: Fetch tree metadata (context_profile, memory_scope) for context capsule
      // T47-2: Also fetch tree_summary for debug panel
      const treeMetaResult = await pgClient.query(
        'SELECT context_profile, memory_scope, tree_summary, narrative_report, narrative_report_updated_at FROM trees WHERE id = $1',
        [treeId]
      );
      const treeMeta = treeMetaResult.rows[0] || {};

      res
        .status(200)
        .set('Cache-Control', 'no-store')
        .json(withTraceId(res, {
          tree_id: treeId,
          version: 1,
          root_id: rootNode?.id ?? null,
          nodes,
          context_profile: treeMeta.context_profile || null,
          memory_scope: treeMeta.memory_scope || null,
          tree_summary: treeMeta.tree_summary || null, // T47-2: For debug panel
          narrative_report: treeMeta.narrative_report || null,
          narrative_report_updated_at: treeMeta.narrative_report_updated_at || null,
        }));
    }),
  );

  return router;
}
