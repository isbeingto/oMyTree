import { pool } from '../../db/pool.js';

export async function saveLens(nodeId, { path_summary, parent_summary, updated_by, lens_text, userId = null }, client = null) {
	if (!userId) {
		throw Object.assign(new Error('user_id is required'), { status: 422, code: 'INVALID_USER_ID' });
	}
	// Use provided client (from transaction) or fall back to global pool
	const queryClient = client || pool;
	const { rows } = await queryClient.query(
		`WITH authorized AS (
       SELECT 1
         FROM nodes n
         JOIN trees t ON t.id = n.tree_id
        WHERE n.id = $1
          AND t.user_id = $6
        LIMIT 1
     )
     INSERT INTO node_summaries (node_id, path_summary, parent_summary, updated_by, lens_text)
     SELECT $1, $2, $3, $4, $5
       FROM authorized
     ON CONFLICT (node_id)
     DO UPDATE SET
       path_summary = COALESCE(EXCLUDED.path_summary, node_summaries.path_summary),
       parent_summary = COALESCE(EXCLUDED.parent_summary, node_summaries.parent_summary),
       updated_by = COALESCE(EXCLUDED.updated_by, node_summaries.updated_by),
       lens_text = COALESCE(EXCLUDED.lens_text, node_summaries.lens_text),
       updated_at = NOW()
     RETURNING node_id, path_summary, parent_summary, updated_by, updated_at, lens_text`,
		[nodeId, path_summary, parent_summary, updated_by, lens_text, userId]
	);

	if (!rows[0]) {
		// T32-2: Silent failure for NODE_NOT_FOUND (non-critical operation)
		// saveLens is called during turn.create which is already in a transaction
		// Visibility issues may occur due to transaction isolation, but the turn completes successfully
		// The node summary will be saved on subsequent turns when visibility is guaranteed
		return null;
	}

	return rows[0];
}
