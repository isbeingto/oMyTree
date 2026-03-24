import express from 'express';
import { forkTreeFromNode } from '../services/tree/fork.js';

const router = express.Router();

router.post('/api/tree/fork', express.json(), async (req, res) => {
  try {
    const { node_id, created_by = 'system', dedupe = false } = req.body || {};
    if (!node_id || typeof node_id !== 'string') {
      return res.status(422).json({ ok: false, error: 'INVALID_NODE_ID' });
    }
    const { tree, root } = await forkTreeFromNode({ node_id, created_by, dedupe: !!dedupe });
    return res.status(201).json({ ok: true, tree, root });
  } catch (e) {
    if (e.status === 404) return res.status(404).json({ ok: false, error: 'NODE_NOT_FOUND' });
    if (e.status === 409) return res.status(409).json({ ok: false, error: 'TREE_EXISTS' });
    if (e.status === 422) return res.status(422).json({ ok: false, error: 'EMPTY_TOPIC' });
    return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
  }
});

export default router;
