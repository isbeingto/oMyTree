import express from 'express';
import { wrapAsync } from '../lib/errors.js';
import { getAuthUserIdForRequest } from '../lib/auth_user.js';
import { enableShare, revokeShare, getShareInfo } from '../services/tree/share.js';

export default function createTreeShareRouter(pgClient) {
  const router = express.Router();

  router.get(
    '/:id/share',
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pgClient);
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const payload = await getShareInfo({ treeId: req.params.id, userId, baseUrl });
      res.json(payload);
    })
  );

  router.post(
    '/:id/share',
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pgClient);
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const payload = await enableShare({ treeId: req.params.id, userId, baseUrl });
      res.status(200).json(payload);
    })
  );

  router.delete(
    '/:id/share',
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pgClient);
      await revokeShare({ treeId: req.params.id, userId });
      res.status(204).send();
    })
  );

  return router;
}
