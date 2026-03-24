import { randomBytes } from 'crypto';
import { pool } from '../../db/pool.js';
import { HttpError } from '../../lib/errors.js';
import { assertTreeOwnership } from '../../lib/tree_access.js';
import { exportTreeJson } from './export_json.js';
import { buildQANodesFromNodes } from './qa_model.js';

let shareSchemaEnsured = false;

async function ensureShareSchema(client) {
  if (shareSchemaEnsured) return;
  await client.query(`
    ALTER TABLE trees
      ADD COLUMN IF NOT EXISTS share_token TEXT NULL,
      ADD COLUMN IF NOT EXISTS share_enabled_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS share_view_count INTEGER NOT NULL DEFAULT 0;
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_trees_share_token
      ON trees(share_token)
      WHERE share_token IS NOT NULL;
  `);
  shareSchemaEnsured = true;
}

function buildShareUrl(token, baseUrl) {
  if (!token) return null;
  const base = baseUrl || process.env.PUBLIC_BASE_URL || '';
  if (base) {
    return `${base.replace(/\/$/, '')}/share/${token}`;
  }
  // fall back to viewer path; front-end will prepend origin
  return `/share/${token}`;
}

export async function enableShare({ treeId, userId, baseUrl }) {
  const client = await pool.connect();
  try {
    await ensureShareSchema(client);
    const tree = await assertTreeOwnership(client, treeId, userId, { selectColumns: ['id'] });
    const token = randomBytes(16).toString('base64url');
    await client.query(
      `UPDATE trees SET share_token = $1, share_enabled_at = now(), share_view_count = 0 WHERE id = $2`,
      [token, tree.id]
    );
    return {
      tree_id: tree.id,
      share_token: token,
      share_url: buildShareUrl(token, baseUrl),
    };
  } finally {
    client.release();
  }
}

export async function revokeShare({ treeId, userId }) {
  const client = await pool.connect();
  try {
    await ensureShareSchema(client);
    await assertTreeOwnership(client, treeId, userId, { selectColumns: ['id'] });
    await client.query(`UPDATE trees SET share_token = NULL, share_enabled_at = NULL WHERE id = $1`, [treeId]);
    return { ok: true };
  } finally {
    client.release();
  }
}

export async function getShareInfo({ treeId, userId, baseUrl }) {
  const client = await pool.connect();
  try {
    await ensureShareSchema(client);
    const tree = await assertTreeOwnership(client, treeId, userId, {
      selectColumns: ['id', 'share_token', 'share_enabled_at', 'share_view_count'],
    });
    const shareUrl = buildShareUrl(tree.share_token, baseUrl);
    return {
      tree_id: tree.id,
      share_token: tree.share_token || null,
      share_url: tree.share_token ? shareUrl : null,
      share_enabled_at: tree.share_enabled_at ? tree.share_enabled_at.toISOString() : null,
      share_view_count: typeof tree.share_view_count === 'number' ? tree.share_view_count : null,
    };
  } finally {
    client.release();
  }
}

export async function getSharedTreeByToken({ token }) {
  if (!token) {
    throw new HttpError({ status: 404, code: 'SHARE_NOT_FOUND', message: 'share link not found' });
  }
  const client = await pool.connect();
  try {
    await ensureShareSchema(client);
    const { rows } = await client.query(
      `SELECT id, topic, display_title, created_at, user_id
         FROM trees
        WHERE share_token = $1
        LIMIT 1`,
      [token]
    );
    const tree = rows[0];
    if (!tree) {
      throw new HttpError({ status: 404, code: 'SHARE_NOT_FOUND', message: 'share link not found' });
    }

    // reuse exportJson to get nodes/lens; remove user_id in payload
    const json = await exportTreeJson({ treeId: tree.id, userId: tree.user_id });
    const { user_id: _omit, ...treeSafe } = json.tree;
    
    // Build QANode view for frontend consistency
    const qaNodes = buildQANodesFromNodes(tree.id, json.nodes || []);
    const qaRootId = qaNodes.find(n => n.parent_id === null)?.id || null;
    
    // best effort view count increment
    try {
      await client.query(`UPDATE trees SET share_view_count = COALESCE(share_view_count, 0) + 1 WHERE id = $1`, [
        tree.id,
      ]);
    } catch (err) {
      console.warn('[share] failed to increment share_view_count', err);
    }
    return {
      ...json,
      tree: treeSafe,
      meta: { shared: true },
      // Add QANode view for frontend Tree v2 consistency
      qa: {
        version: 1,
        root_id: qaRootId,
        nodes: qaNodes,
      },
    };
  } finally {
    client.release();
  }
}
