/**
 * P1-1: PathSnapshot API - 把黄金路径固化为可回放对象
 *
 * PathSnapshot captures the current keyframes as a replayable path artifact.
 * This allows users to:
 * - Save a snapshot of the "golden path" at any point
 * - Replay the path step by step
 * - Reference snapshots when generating Outcomes or Trails
 *
 * Routes:
 * - POST /api/tree/:treeId/path-snapshots         - Create snapshot from keyframes
 * - GET  /api/tree/:treeId/path-snapshots         - List snapshots
 * - GET  /api/tree/:treeId/path-snapshots/:id     - Get specific snapshot
 * - POST /api/tree/:treeId/path-snapshots/:id/replay - Get replay data
 *
 * @version P1-1
 */

import express from "express";
import { validate as uuidValidate } from "uuid";
import crypto from "crypto";

import { HttpError, wrapAsync } from "../lib/errors.js";
import { getAuthUserIdForRequest } from "../lib/auth_user.js";
import { assertTreeOwnership } from "../lib/tree_access.js";
import { withTraceId } from "../lib/trace.js";
import { logProcessEvent } from "../lib/process_event.js";

const PROMPT_VERSION = "path_snapshot_v1";

/**
 * Validate UUID format
 */
function assertUuid(value, { code, message } = {}) {
  if (!value || typeof value !== "string" || !uuidValidate(value)) {
    throw new HttpError({
      status: 422,
      code: code || "INVALID_UUID",
      message: message || "invalid uuid",
    });
  }
}

/**
 * Compute SHA256 checksum of content
 */
function computeChecksum(content) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Build a markdown summary for the path snapshot
 */
function buildSnapshotMarkdown(steps, title) {
  const lines = [];
  lines.push(`# ${title || "Path Snapshot"}`);
  lines.push("");
  lines.push(`> Captured ${steps.length} keyframe(s) at ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Steps");
  lines.push("");

  for (const step of steps) {
    lines.push(`### Step ${step.step_index}`);
    lines.push(`- **Node**: \`${step.node_id}\``);
    lines.push(`- **Created**: ${step.created_at}`);
    if (step.annotation) {
      lines.push(`- **Annotation**: ${step.annotation}`);
    }
    lines.push(`- **Role**: ${step.role}`);
    lines.push(`- **Preview**: ${step.text_preview}`);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format artifact version for API response
 */
function formatSnapshotResponse(row) {
  return {
    id: row.id,
    created_at: row.created_at,
    prompt_version: row.prompt_version,
    input: row.input,
    title: row.input?.title || null,
    keyframe_count: row.input?.keyframe_ids?.length || 0,
    node_count: row.input?.node_ids?.length || 0,
  };
}

export default function createPathSnapshotsRouter(pg) {
  const router = express.Router();

  /**
   * POST /api/tree/:treeId/path-snapshots
   * Create a new PathSnapshot from current keyframes
   */
  router.post(
    "/:treeId/path-snapshots",
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      const treeId = (req.params.treeId || "").trim();
      const title = req.body?.title || null;
      const scope = req.body?.scope || "keyframes"; // 'keyframes' | 'subtree' | 'custom'

      assertUuid(treeId, { code: "INVALID_TREE_ID", message: "invalid tree id" });
      await assertTreeOwnership(pg, treeId, userId);

      // Step 1: Fetch keyframes with node context, ordered by created_at ASC
      const { rows: keyframeRows } = await pg.query(
        `SELECT 
            k.id AS keyframe_id,
            k.node_id,
            k.annotation,
            k.is_pinned,
            k.created_at AS keyframe_created_at,
            n.tree_id,
            n.parent_id,
            n.level,
            n.role,
            n.text,
            n.created_at AS node_created_at
          FROM keyframes k
          JOIN nodes n ON n.id = k.node_id
          WHERE k.user_id = $1
            AND k.tree_id = $2
            AND k.is_pinned = TRUE
          ORDER BY k.created_at ASC`,
        [userId, treeId]
      );

      if (keyframeRows.length === 0) {
        throw new HttpError({
          status: 400,
          code: "NO_KEYFRAMES",
          message: "No pinned keyframes found for this tree.",
          hint: "Pin some messages as keyframes before creating a path snapshot.",
        });
      }

      console.log(
        `[path-snapshot:create] Found ${keyframeRows.length} keyframes for tree=${treeId}`
      );

      // Step 2: Build structured step data
      const steps = keyframeRows.map((row, index) => ({
        step_index: index + 1,
        keyframe_id: row.keyframe_id,
        node_id: row.node_id,
        parent_id: row.parent_id,
        level: row.level,
        role: row.role,
        annotation: row.annotation,
        created_at: row.keyframe_created_at,
        node_created_at: row.node_created_at,
        text_preview: (row.text || "").substring(0, 200) + (row.text?.length > 200 ? "..." : ""),
      }));

      // Extract unique node_ids for path traversal
      const nodeIds = keyframeRows.map((r) => r.node_id);
      const keyframeIds = keyframeRows.map((r) => r.keyframe_id);

      // Build input metadata
      const inputMeta = {
        title: title || `Snapshot ${new Date().toISOString().split("T")[0]}`,
        keyframe_ids: keyframeIds,
        node_ids: nodeIds,
        scope,
        generated_from: "keyframes",
        step_count: steps.length,
        steps, // Embed full step data for replay
      };

      // Step 3: Generate markdown summary
      const contentMarkdown = buildSnapshotMarkdown(steps, inputMeta.title);
      const checksum = computeChecksum(contentMarkdown);

      // Step 4: Insert artifact version
      const { rows: insertedRows } = await pg.query(
        `INSERT INTO artifact_versions (
          artifact_type,
          tree_id,
          created_by,
          prompt_version,
          input,
          content_markdown,
          checksum
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, created_at`,
        [
          "path_snapshot",
          treeId,
          userId,
          PROMPT_VERSION,
          JSON.stringify(inputMeta),
          contentMarkdown,
          checksum,
        ]
      );

      const snapshotId = insertedRows[0].id;
      const createdAt = insertedRows[0].created_at;

      // Step 5: Update trees.latest_path_snapshot_id
      await pg.query(
        `UPDATE trees SET latest_path_snapshot_id = $1 WHERE id = $2`,
        [snapshotId, treeId]
      );

      console.log(`[path-snapshot:create] Snapshot ${snapshotId} created for tree=${treeId}`);

      // Step 6: Log to process_events (fail-open, no try-catch needed)
      await logProcessEvent(pg, {
        tree_id: treeId,
        scope_node_id: null,
        event_type: "snapshot.created",
        meta: {
          artifact_id: snapshotId,
          keyframe_count: keyframeIds.length,
          node_count: nodeIds.length,
          scope,
        },
      });

      res.status(201).json(
        withTraceId(res, {
          ok: true,
          snapshot: {
            id: snapshotId,
            created_at: createdAt,
            title: inputMeta.title,
            keyframe_count: keyframeIds.length,
            node_count: nodeIds.length,
            scope,
          },
          content_markdown: contentMarkdown,
        })
      );
    })
  );

  /**
   * GET /api/tree/:treeId/path-snapshots
   * List PathSnapshots for a tree with pagination
   */
  router.get(
    "/:treeId/path-snapshots",
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      const treeId = (req.params.treeId || "").trim();

      assertUuid(treeId, { code: "INVALID_TREE_ID", message: "invalid tree id" });
      await assertTreeOwnership(pg, treeId, userId);

      // Pagination
      const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
      const offset = parseInt(req.query.offset, 10) || 0;

      // Fetch snapshots (without full content for list view)
      const { rows } = await pg.query(
        `SELECT 
          id,
          created_at,
          prompt_version,
          input,
          LENGTH(content_markdown) AS content_length
         FROM artifact_versions
         WHERE tree_id = $1 AND artifact_type = 'path_snapshot'
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [treeId, limit, offset]
      );

      // Get total count
      const { rows: countRows } = await pg.query(
        `SELECT COUNT(*) AS total 
         FROM artifact_versions 
         WHERE tree_id = $1 AND artifact_type = 'path_snapshot'`,
        [treeId]
      );

      const total = parseInt(countRows[0].total, 10);

      res.status(200).json(
        withTraceId(res, {
          ok: true,
          snapshots: rows.map((row) => formatSnapshotResponse(row)),
          pagination: {
            total,
            limit,
            offset,
            has_more: offset + rows.length < total,
          },
        })
      );
    })
  );

  /**
   * GET /api/tree/:treeId/path-snapshots/latest
   * Get the latest PathSnapshot for a tree
   */
  router.get(
    "/:treeId/path-snapshots/latest",
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      const treeId = (req.params.treeId || "").trim();

      assertUuid(treeId, { code: "INVALID_TREE_ID", message: "invalid tree id" });
      try {
        await assertTreeOwnership(pg, treeId, userId);
      } catch (err) {
        // Snapshot tab may query latest snapshot even in read-only/shared contexts.
        // Treat missing/inaccessible trees as "no snapshot" to avoid noisy 404s.
        if (err instanceof HttpError && err.status === 404 && err.code === "TREE_NOT_FOUND") {
          return res.status(200).json(
            withTraceId(res, {
              ok: true,
              snapshot: null,
              content_markdown: null,
            })
          );
        }
        throw err;
      }

      // Fetch via trees.latest_path_snapshot_id
      const { rows } = await pg.query(
        `SELECT av.*
         FROM trees t
         LEFT JOIN artifact_versions av ON av.id = t.latest_path_snapshot_id
         WHERE t.id = $1`,
        [treeId]
      );

      if (rows.length === 0) {
        return res.status(200).json(
          withTraceId(res, {
            ok: true,
            snapshot: null,
            content_markdown: null,
          })
        );
      }

      const artifact = rows[0];

      if (!artifact.id) {
        return res.status(200).json(
          withTraceId(res, {
            ok: true,
            snapshot: null,
            content_markdown: null,
          })
        );
      }

      res.status(200).json(
        withTraceId(res, {
          ok: true,
          snapshot: formatSnapshotResponse(artifact),
          content_markdown: artifact.content_markdown,
        })
      );
    })
  );

  /**
   * GET /api/tree/:treeId/path-snapshots/:snapshotId
   * Get a specific PathSnapshot by ID
   */
  router.get(
    "/:treeId/path-snapshots/:snapshotId",
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      const treeId = (req.params.treeId || "").trim();
      const snapshotId = (req.params.snapshotId || "").trim();

      assertUuid(treeId, { code: "INVALID_TREE_ID", message: "invalid tree id" });
      assertUuid(snapshotId, { code: "INVALID_SNAPSHOT_ID", message: "invalid snapshot id" });
      await assertTreeOwnership(pg, treeId, userId);

      // Fetch specific snapshot
      const { rows } = await pg.query(
        `SELECT *
         FROM artifact_versions
         WHERE id = $1 AND tree_id = $2 AND artifact_type = 'path_snapshot'`,
        [snapshotId, treeId]
      );

      if (rows.length === 0) {
        throw new HttpError({
          status: 404,
          code: "SNAPSHOT_NOT_FOUND",
          message: "PathSnapshot not found",
        });
      }

      const artifact = rows[0];

      res.status(200).json(
        withTraceId(res, {
          ok: true,
          snapshot: formatSnapshotResponse(artifact),
          content_markdown: artifact.content_markdown,
        })
      );
    })
  );

  /**
   * POST /api/tree/:treeId/path-snapshots/:snapshotId/replay
   * Get replay data for stepping through the snapshot
   *
   * Returns the ordered list of node_ids with context for frontend playback.
   * The frontend can use this to sequentially:
   * - Focus each node in the tree
   * - Scroll chat to the corresponding message
   */
  router.post(
    "/:treeId/path-snapshots/:snapshotId/replay",
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      const treeId = (req.params.treeId || "").trim();
      const snapshotId = (req.params.snapshotId || "").trim();

      assertUuid(treeId, { code: "INVALID_TREE_ID", message: "invalid tree id" });
      assertUuid(snapshotId, { code: "INVALID_SNAPSHOT_ID", message: "invalid snapshot id" });
      await assertTreeOwnership(pg, treeId, userId);

      // Fetch snapshot
      const { rows } = await pg.query(
        `SELECT input
         FROM artifact_versions
         WHERE id = $1 AND tree_id = $2 AND artifact_type = 'path_snapshot'`,
        [snapshotId, treeId]
      );

      if (rows.length === 0) {
        throw new HttpError({
          status: 404,
          code: "SNAPSHOT_NOT_FOUND",
          message: "PathSnapshot not found",
        });
      }

      const input = rows[0].input || {};
      const steps = input.steps || [];

      // Verify nodes still exist (some may have been deleted)
      const nodeIds = steps.map((s) => s.node_id);
      const { rows: existingNodes } = await pg.query(
        `SELECT id, soft_deleted_at FROM nodes WHERE id = ANY($1)`,
        [nodeIds]
      );

      const existingNodeSet = new Set(
        existingNodes
          .filter((n) => !n.soft_deleted_at)
          .map((n) => n.id)
      );

      // Build replay steps with validity check
      const replaySteps = steps.map((step) => ({
        step_index: step.step_index,
        node_id: step.node_id,
        annotation: step.annotation,
        role: step.role,
        text_preview: step.text_preview,
        is_valid: existingNodeSet.has(step.node_id),
      }));

      const validSteps = replaySteps.filter((s) => s.is_valid);
      const invalidCount = replaySteps.length - validSteps.length;

      if (invalidCount > 0) {
        console.warn(
          `[path-snapshot:replay] ${invalidCount} nodes no longer exist for snapshot=${snapshotId}`
        );
      }

      res.status(200).json(
        withTraceId(res, {
          ok: true,
          snapshot_id: snapshotId,
          title: input.title,
          total_steps: replaySteps.length,
          valid_steps: validSteps.length,
          steps: replaySteps,
          warnings:
            invalidCount > 0
              ? [`${invalidCount} node(s) no longer exist and will be skipped during replay`]
              : [],
        })
      );
    })
  );

  /**
   * DELETE /api/tree/:treeId/path-snapshots/:snapshotId
   * Delete a PathSnapshot
   */
  router.delete(
    "/:treeId/path-snapshots/:snapshotId",
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      const treeId = (req.params.treeId || "").trim();
      const snapshotId = (req.params.snapshotId || "").trim();

      assertUuid(treeId, { code: "INVALID_TREE_ID", message: "invalid tree id" });
      assertUuid(snapshotId, { code: "INVALID_SNAPSHOT_ID", message: "invalid snapshot id" });
      await assertTreeOwnership(pg, treeId, userId);

      // Delete snapshot
      const result = await pg.query(
        `DELETE FROM artifact_versions
         WHERE id = $1 AND tree_id = $2 AND artifact_type = 'path_snapshot'
         RETURNING id`,
        [snapshotId, treeId]
      );

      if (result.rowCount === 0) {
        throw new HttpError({
          status: 404,
          code: "SNAPSHOT_NOT_FOUND",
          message: "PathSnapshot not found",
        });
      }

      // Clear latest_path_snapshot_id if it was the deleted one
      await pg.query(
        `UPDATE trees 
         SET latest_path_snapshot_id = NULL 
         WHERE id = $1 AND latest_path_snapshot_id = $2`,
        [treeId, snapshotId]
      );

      console.log(`[path-snapshot:delete] Deleted snapshot ${snapshotId} from tree=${treeId}`);

      res.status(200).json(
        withTraceId(res, {
          ok: true,
          deleted: snapshotId,
        })
      );
    })
  );

  return router;
}
