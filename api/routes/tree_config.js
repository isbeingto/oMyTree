import express from "express";
import { HttpError, wrapAsync } from "../lib/errors.js";
import { getAuthUserIdForRequest } from "../lib/auth_user.js";
import { assertTreeOwnership } from "../lib/tree_access.js";
import { hasActiveUserProviders } from "../services/user_llm_providers.js";

/**
 * T53-2: PATCH /api/tree/:treeId/config
 * Update context profile and memory scope for an existing tree
 */
export default function createTreeConfigRouter(pg) {
  const router = express.Router();

  router.patch(
    "/:treeId/config",
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      const { treeId } = req.params;
      const { context_profile, memory_scope } = req.body;

      // Validate ownership
      await assertTreeOwnership(pg, userId, treeId);

      // Validate context_profile
      if (context_profile && !['lite', 'standard', 'max'].includes(context_profile)) {
        throw new HttpError({
          status: 422,
          code: "invalid_context_profile",
          message: "context_profile must be one of: lite, standard, max",
        });
      }

      // Validate memory_scope
      if (memory_scope && !['branch', 'tree'].includes(memory_scope)) {
        throw new HttpError({
          status: 422,
          code: "invalid_memory_scope",
          message: "memory_scope must be one of: branch, tree",
        });
      }

      // Check BYOK requirement for max profile
      if (context_profile === 'max') {
        const hasActive = await hasActiveUserProviders(userId);
        if (!hasActive) {
          throw new HttpError({
            status: 422,
            code: "max_profile_requires_byok",
            message: "Max profile requires an active BYOK provider",
            hint: "Please configure a BYOK provider in settings before selecting Max profile",
          });
        }
      }

      // Build update query dynamically
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (context_profile) {
        updates.push(`context_profile = $${paramCount++}`);
        values.push(context_profile);
      }

      if (memory_scope) {
        updates.push(`memory_scope = $${paramCount++}`);
        values.push(memory_scope);
      }

      if (updates.length === 0) {
        throw new HttpError({
          status: 422,
          code: "no_updates_provided",
          message: "At least one of context_profile or memory_scope must be provided",
        });
      }

      // Add treeId and userId to values
      values.push(treeId, userId);

      const updateQuery = `
        UPDATE trees
        SET ${updates.join(', ')}, updated_at = now()
        WHERE id = $${paramCount++} AND user_id = $${paramCount++}
        RETURNING id, context_profile, memory_scope, updated_at
      `;

      const result = await pg.query(updateQuery, values);

      if (result.rowCount === 0) {
        throw new HttpError({
          status: 404,
          code: "tree_not_found",
          message: "Tree not found or access denied",
        });
      }

      const updatedTree = result.rows[0];

      res.json({
        ok: true,
        tree: {
          id: updatedTree.id,
          context_profile: updatedTree.context_profile,
          memory_scope: updatedTree.memory_scope,
          updated_at: updatedTree.updated_at,
        },
      });
    })
  );

  return router;
}
