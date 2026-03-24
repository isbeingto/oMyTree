import express from "express";
import { HttpError, wrapAsync } from "../lib/errors.js";
import { getAuthUserIdForRequest } from "../lib/auth_user.js";
import { assertTreeOwnership } from "../lib/tree_access.js";
import { withTraceId } from "../lib/trace.js";
import { buildDefaultTitle, validateTitle, normalizeTitle } from "../lib/tree_title.js";

export default function createTreeRenameRouter(pg) {
  const router = express.Router();

  // T15-9: Rename a tree (update display_title)
  router.patch(
    "/:id",
    wrapAsync(async (req, res) => {
      const treeId = req.params.id;
      const userId = await getAuthUserIdForRequest(req, pg);
      const { title } = req.body;

      // Validate title
      const validation = validateTitle(title);
      if (!validation.valid) {
        throw new HttpError({
          status: 400,
          code: "INVALID_TITLE",
          message: validation.error,
        });
      }

      // Check ownership
      await assertTreeOwnership(pg, treeId, userId, {
        selectColumns: ["id", "topic"],
      });

      // Normalize and update
      const normalizedTitle = normalizeTitle(title);

      await pg.query(
        "UPDATE trees SET display_title = $1 WHERE id = $2 AND user_id = $3",
        [normalizedTitle, treeId, userId]
      );

      // Fetch updated tree data
      const result = await pg.query(
        `SELECT
          t.id,
          t.topic,
          t.display_title,
          COALESCE(root.text, t.topic) AS root_title
        FROM trees t
        LEFT JOIN nodes root ON root.tree_id = t.id AND root.parent_id IS NULL AND root.level = 0
        WHERE t.id = $1
        LIMIT 1`,
        [treeId]
      );

      const tree = result.rows[0];
      const finalTitle = buildDefaultTitle({
        displayTitle: tree.display_title,
        rootText: tree.root_title,
        topic: tree.topic,
      });

      res.json(
        withTraceId(res, {
          ok: true,
          tree: {
            id: tree.id,
            topic: tree.topic,
            display_title: tree.display_title,
            title: finalTitle,
          },
        })
      );
    })
  );

  return router;
}
