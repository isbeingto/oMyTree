import { pool } from '../../db/pool.js';
import { HttpError } from '../../lib/errors.js';

export async function listUserSharedTrees({ userId }) {
  if (!userId) {
    throw new HttpError({ status: 422, code: 'INVALID_USER', message: 'userId is required' });
  }
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id,
              topic,
              display_title,
              share_token,
              share_enabled_at,
              share_view_count,
              created_at
         FROM trees
        WHERE user_id = $1
          AND share_token IS NOT NULL
        ORDER BY share_enabled_at DESC NULLS LAST, created_at DESC`,
      [userId]
    );
    return rows.map((row) => ({
      tree_id: row.id,
      topic: row.topic || null,
      display_title: row.display_title || null,
      share_token: row.share_token,
      share_enabled_at: row.share_enabled_at ? row.share_enabled_at.toISOString() : null,
      share_view_count: typeof row.share_view_count === 'number' ? row.share_view_count : null,
      created_at: row.created_at ? row.created_at.toISOString() : null,
      updated_at: row.created_at ? row.created_at.toISOString() : null,
    }));
  } finally {
    client.release();
  }
}
