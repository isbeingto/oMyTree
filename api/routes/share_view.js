import express from 'express';
import { wrapAsync } from '../lib/errors.js';
import { withTraceId } from '../lib/trace.js';
import { getSharedTreeByToken } from '../services/tree/share.js';

export default function createShareViewRouter() {
  const router = express.Router();

  router.get(
    '/:token',
    wrapAsync(async (req, res) => {
      const token = req.params.token;
      const payload = await getSharedTreeByToken({ token });
      res
        .status(200)
        .set('Content-Type', 'application/json; charset=utf-8')
        .json(withTraceId(res, payload));
    })
  );

  return router;
}
