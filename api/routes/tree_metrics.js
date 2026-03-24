import express from 'express';
import { getAuthUserIdForRequest } from '../lib/auth_user.js';
import { wrapAsync } from '../lib/errors.js';
import { withTraceId } from '../lib/trace.js';
import { getTreeMetrics } from '../services/tree/metrics.js';

export default function createTreeMetricsRouter(pgClient) {
  const router = express.Router();

  router.get(
    '/:id/metrics',
    wrapAsync(async (req, res) => {
      const treeId = req.params.id;
      const userId = await getAuthUserIdForRequest(req, pgClient);
      const metrics = await getTreeMetrics({ treeId, userId });
      res
        .status(200)
        .set('Cache-Control', 'no-store')
        .json(withTraceId(res, { tree_id: treeId, metrics }));
    })
  );

  return router;
}
