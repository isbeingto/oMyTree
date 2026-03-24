import express from "express";
import { HttpError, wrapAsync } from "../lib/errors.js";
import { getAuthUserIdForRequest } from "../lib/auth_user.js";
import { withTraceId } from "../lib/trace.js";
import { buildDefaultTitle } from "../lib/tree_title.js";

export default function createTreesListRouter(pg) {
  const router = express.Router();

  // T15-7: List current user's trees
  router.get(
    "/",
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      
      // Check if user is authenticated (not demo user)
      const demoUserResult = await pg.query(
        "SELECT id FROM users WHERE email = $1 LIMIT 1",
        ["demo@omytree.local"]
      );
      
      if (demoUserResult.rows.length > 0 && userId === demoUserResult.rows[0].id) {
        throw new HttpError({
          status: 401,
          code: "AUTH_REQUIRED",
          message: "authentication required to list trees",
        });
      }

      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
      const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

      const [result, countResult] = await Promise.all([
        pg.query(
          `SELECT
            t.id,
            t.topic,
            t.display_title,
            COALESCE(root.text, t.topic) AS root_title,
            t.created_at,
            t.updated_at
          FROM trees t
          LEFT JOIN nodes root ON root.tree_id = t.id AND root.parent_id IS NULL AND root.level = 0
          WHERE t.user_id = $1
            AND (t.status = 'active' OR t.status IS NULL)
          ORDER BY t.updated_at DESC
          LIMIT $2 OFFSET $3`,
          [userId, limit, offset]
        ),
        pg.query(
          `SELECT COUNT(*)::int AS total FROM trees WHERE user_id = $1 AND (status = 'active' OR status IS NULL)`,
          [userId]
        ),
      ]);

      const total = countResult.rows[0]?.total ?? 0;

      const trees = result.rows.map(row => {
        const title = buildDefaultTitle({
          displayTitle: row.display_title,
          rootText: row.root_title,
          topic: row.topic,
        });

        return {
          id: row.id,
          topic: row.topic,
          display_title: row.display_title,
          root_title: row.root_title,
          title, // T15-9: Unified display title
          created_at: row.created_at,
          updated_at: row.updated_at || row.created_at, // Use actual updated_at
        };
      });

      res.json(withTraceId(res, {
        ok: true,
        trees,
        total,
        offset,
        limit,
        has_more: offset + trees.length < total,
      }));
    }),
  );

  return router;
}
