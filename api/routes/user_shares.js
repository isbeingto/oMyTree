import express from 'express';
import { wrapAsync } from '../lib/errors.js';
import { getAuthUserIdForRequest } from '../lib/auth_user.js';
import { withTraceId } from '../lib/trace.js';
import { listUserSharedTrees } from '../services/tree/share_list.js';

export default function createUserSharesRouter(pgClient) {
  const router = express.Router();

  router.get(
    '/shares',
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pgClient);
      const sharedTrees = await listUserSharedTrees({ userId });
      res
        .status(200)
        .set('Cache-Control', 'no-store')
        .json(withTraceId(res, { shared_trees: sharedTrees }));
    })
  );

  return router;
}
