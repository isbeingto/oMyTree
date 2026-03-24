import express from 'express';
import { getAuthUserIdForRequest } from '../lib/auth_user.js';
import { wrapAsync, HttpError } from '../lib/errors.js';
import { withTraceId } from '../lib/trace.js';
import { exportTreeJson } from '../services/tree/export_json.js';

export default function createTreeExportJsonRouter(pgClient) {
  const router = express.Router();

  router.get(
    '/:id/export/json',
    wrapAsync(async (req, res) => {
      const treeId = req.params.id;
      if (!treeId) {
        throw new HttpError({ status: 422, code: 'INVALID_TREE_ID', message: 'tree id is required' });
      }

      const userId = await getAuthUserIdForRequest(req, pgClient);
      const payload = await exportTreeJson({ treeId, userId });
      res
        .status(200)
        .set('Content-Type', 'application/json; charset=utf-8')
        .set('Cache-Control', 'no-store')
        .json(withTraceId(res, payload));
    })
  );

  return router;
}
