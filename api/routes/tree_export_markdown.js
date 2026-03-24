import express from 'express';
import { getAuthUserIdForRequest } from '../lib/auth_user.js';
import { wrapAsync } from '../lib/errors.js';
import { withTraceId } from '../lib/trace.js';
import { exportTreeMarkdown } from '../services/tree/export_markdown.js';

export default function createTreeExportMarkdownRouter(pgClient) {
  const router = express.Router();

  router.get(
    '/:id/export/markdown',
    wrapAsync(async (req, res) => {
      const treeId = req.params.id;
      const userId = await getAuthUserIdForRequest(req, pgClient);
      const markdown = await exportTreeMarkdown({ treeId, userId });

      res
        .status(200)
        .set('Content-Type', 'text/markdown; charset=utf-8')
        .set('Content-Disposition', `attachment; filename="omytree-${treeId}.md"`)
        .set('Cache-Control', 'no-store')
        .send(withTraceId(res, markdown));
    })
  );

  return router;
}
