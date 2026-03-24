/**
 * Phase P0-2: Trail API with Artifact Versioning
 * 
 * Versioned Trail generation - each generation creates a new artifact_versions record.
 * 
 * Routes:
 * - POST /api/tree/:treeId/trail           - Generate new Trail version
 * - GET  /api/tree/:treeId/trail/latest    - Get latest Trail version
 * - GET  /api/tree/:treeId/trail/versions  - List Trail version history
 * - GET  /api/tree/:treeId/trail/versions/:versionId - Get specific version
 * 
 * @version P0-2
 */

import express from "express";
import { validate as uuidValidate } from "uuid";
import crypto from "crypto";

import { HttpError, wrapAsync } from "../lib/errors.js";
import { getAuthUserIdForRequest } from "../lib/auth_user.js";
import { assertTreeOwnership } from "../lib/tree_access.js";
import { withTraceId } from "../lib/trace.js";
import { resolveProviderForRequest } from "../services/llm/providers/index.js";

// Trail service modules
import {
  getKeyframesQuery,
  buildStepInput,
  formatStepsAsJson,
  TRAIL_LIMITS,
} from "../lib/trail/step_builder.js";
import {
  TRAIL_SYSTEM_PROMPT,
  buildUserPrompt,
  PROMPT_VERSION,
} from "../lib/trail/prompts.js";
import {
  validateTrailOutput,
  logTrailDiagnostics,
} from "../lib/trail/validator.js";

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
 * Format artifact version for API response
 */
function formatVersionResponse(row) {
  return {
    id: row.id,
    created_at: row.created_at,
    prompt_version: row.prompt_version,
    provider: row.provider,
    model: row.model,
    input: row.input,
    validation_metrics: row.validation_metrics,
  };
}

export default function createTrailRouter(pg) {
  const router = express.Router();

  /**
   * POST /api/tree/:treeId/trail
   * Generate a new Trail version from keyframes
   */
  router.post(
    "/:treeId/trail",
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      const treeId = (req.params.treeId || "").trim();

      assertUuid(treeId, { code: "INVALID_TREE_ID", message: "invalid tree id" });
      await assertTreeOwnership(pg, treeId, userId);

      // Step 1: Fetch keyframes with full turn context
      const { rows: keyframeRows } = await pg.query(
        getKeyframesQuery(),
        [userId, treeId]
      );

      if (keyframeRows.length === 0) {
        throw new HttpError({
          status: 400,
          code: "NO_KEYFRAMES",
          message: "No keyframes found for this tree. Pin some messages first.",
          hint: "Use the Pin feature to mark important messages as keyframes before generating a Trail.",
        });
      }

      console.log(`[trail:generate] Found ${keyframeRows.length} keyframes for tree=${treeId}`);

      // Step 2: Build structured step input
      const steps = buildStepInput(keyframeRows);
      const stepsJson = formatStepsAsJson(steps);

      // Prepare input metadata for reproducibility
      const inputMeta = {
        keyframe_ids: keyframeRows.map((r) => r.keyframe_id),
        step_count: steps.length,
        truncation: {
          max_steps: TRAIL_LIMITS.MAX_STEPS,
          max_chars_user: TRAIL_LIMITS.MAX_CHARS_USER,
          max_chars_ai: TRAIL_LIMITS.MAX_CHARS_AI,
          was_truncated: keyframeRows.length > TRAIL_LIMITS.MAX_STEPS,
        },
      };

      // Step 3: Build LLM messages
      const messages = [
        { role: "system", content: TRAIL_SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(stepsJson, steps.length) },
      ];

      // Step 4: Resolve provider and call LLM
      const providerHint = req.body?.provider || null;
      const modelHint = req.body?.model || null;

      const { provider, defaultModel } = await resolveProviderForRequest({
        providerHint,
        userId,
      });

      const usedModel = modelHint || defaultModel;
      const startTime = Date.now();
      let llmResult;

      try {
        llmResult = await provider.callChat({
          messages,
          options: {
            model: usedModel,
            temperature: 0.4,
            mode: "narrative",
          },
        });
      } catch (err) {
        console.error("[trail:generate] LLM call failed:", err.message);
        throw new HttpError({
          status: 502,
          code: "LLM_FAILED",
          message: "Failed to generate Trail report",
          detail: err.message,
        });
      }

      const durationMs = Date.now() - startTime;
      const content = llmResult.ai_text || llmResult.text || "";

      if (!content.trim()) {
        throw new HttpError({
          status: 500,
          code: "EMPTY_RESPONSE",
          message: "LLM returned empty response",
        });
      }

      // Step 5: Validate output
      const validation = validateTrailOutput(content, steps);
      logTrailDiagnostics(treeId, {
        inputSteps: steps.length,
        durationMs,
        validation,
        promptVersion: PROMPT_VERSION,
      });

      // Step 6: Insert new artifact version
      const checksum = computeChecksum(content);
      const providerName = provider.name || providerHint || "unknown";

      const { rows: insertedRows } = await pg.query(
        `INSERT INTO artifact_versions (
          artifact_type,
          tree_id,
          created_by,
          provider,
          model,
          prompt_version,
          input,
          content_markdown,
          checksum,
          validation_metrics
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, created_at`,
        [
          "trail",
          treeId,
          userId,
          providerName,
          usedModel,
          PROMPT_VERSION,
          JSON.stringify(inputMeta),
          content,
          checksum,
          JSON.stringify(validation.metrics),
        ]
      );

      const artifactId = insertedRows[0].id;
      const createdAt = insertedRows[0].created_at;

      // Step 7: Update trees.latest_trail_artifact_id + backward compat narrative_report
      await pg.query(
        `UPDATE trees 
         SET latest_trail_artifact_id = $1,
             narrative_report = $2,
             narrative_report_updated_at = NOW()
         WHERE id = $3`,
        [artifactId, content, treeId]
      );

      console.log(`[trail:generate] Version ${artifactId} persisted for tree=${treeId}`);

      // Step 8: Log to process_events for audit/timeline
      // P0-6: Consistently log second-layer actions to process_events
      await pg.query(
        `INSERT INTO process_events (tree_id, event_type, meta)
         VALUES ($1, $2, $3)`,
        [
          treeId,
          "trail.generated",
          JSON.stringify({
            artifact_id: artifactId,
            prompt_version: PROMPT_VERSION,
            model: usedModel,
            step_count: steps.length,
            duration_ms: durationMs,
          }),
        ]
      );

      res.status(201).json(
        withTraceId(res, {
          ok: true,
          version: {
            id: artifactId,
            created_at: createdAt,
            prompt_version: PROMPT_VERSION,
            provider: providerName,
            model: usedModel,
            input: inputMeta,
          },
          content_markdown: content,
          keyframes_count: keyframeRows.length,
          steps_processed: steps.length,
          duration_ms: durationMs,
          validation: {
            warnings: validation.warnings,
            metrics: validation.metrics,
          },
        })
      );
    })
  );

  /**
   * GET /api/tree/:treeId/trail/latest
   * Get the latest Trail version for a tree
   */
  router.get(
    "/:treeId/trail/latest",
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      const treeId = (req.params.treeId || "").trim();

      assertUuid(treeId, { code: "INVALID_TREE_ID", message: "invalid tree id" });
      try {
        await assertTreeOwnership(pg, treeId, userId);
      } catch (err) {
        // In read-only/shared contexts, the UI may still query for a latest trail.
        // Treat missing/inaccessible trees as "no trail yet" to avoid noisy 404s.
        if (err instanceof HttpError && err.status === 404 && err.code === "TREE_NOT_FOUND") {
          return res.status(200).json(
            withTraceId(res, {
              ok: true,
              version: null,
              content_markdown: null,
            })
          );
        }
        throw err;
      }

      // Fetch latest via trees.latest_trail_artifact_id
      const { rows } = await pg.query(
        `SELECT av.*
         FROM trees t
         LEFT JOIN artifact_versions av ON av.id = t.latest_trail_artifact_id
         WHERE t.id = $1`,
        [treeId]
      );

      if (rows.length === 0) {
        return res.status(200).json(
          withTraceId(res, {
            ok: true,
            version: null,
            content_markdown: null,
          })
        );
      }

      const artifact = rows[0];

      // No Trail generated yet
      if (!artifact.id) {
        // Fallback: check legacy narrative_report
        const { rows: treeRows } = await pg.query(
          `SELECT narrative_report, narrative_report_updated_at FROM trees WHERE id = $1`,
          [treeId]
        );

        if (treeRows[0]?.narrative_report) {
          // Return legacy format for backward compatibility
          return res.status(200).json(
            withTraceId(res, {
              ok: true,
              version: null,
              content_markdown: treeRows[0].narrative_report,
              legacy: true,
              updated_at: treeRows[0].narrative_report_updated_at,
            })
          );
        }

        return res.status(200).json(
          withTraceId(res, {
            ok: true,
            version: null,
            content_markdown: null,
          })
        );
      }

      res.status(200).json(
        withTraceId(res, {
          ok: true,
          version: formatVersionResponse(artifact),
          content_markdown: artifact.content_markdown,
        })
      );
    })
  );

  /**
   * GET /api/tree/:treeId/trail/versions
   * List Trail version history with pagination
   */
  router.get(
    "/:treeId/trail/versions",
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      const treeId = (req.params.treeId || "").trim();

      assertUuid(treeId, { code: "INVALID_TREE_ID", message: "invalid tree id" });
      await assertTreeOwnership(pg, treeId, userId);

      // Pagination params
      const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
      const offset = parseInt(req.query.offset, 10) || 0;

      // Fetch versions (without content for list view)
      const { rows } = await pg.query(
        `SELECT 
          id,
          created_at,
          prompt_version,
          provider,
          model,
          input,
          validation_metrics,
          LENGTH(content_markdown) AS content_length
         FROM artifact_versions
         WHERE tree_id = $1 AND artifact_type = 'trail'
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [treeId, limit, offset]
      );

      // Get total count
      const { rows: countRows } = await pg.query(
        `SELECT COUNT(*) AS total 
         FROM artifact_versions 
         WHERE tree_id = $1 AND artifact_type = 'trail'`,
        [treeId]
      );

      const total = parseInt(countRows[0].total, 10);

      res.status(200).json(
        withTraceId(res, {
          ok: true,
          versions: rows.map((row) => ({
            id: row.id,
            created_at: row.created_at,
            prompt_version: row.prompt_version,
            provider: row.provider,
            model: row.model,
            input: row.input,
            content_length: row.content_length,
            step_count: row.input?.step_count || null,
          })),
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
   * GET /api/tree/:treeId/trail/versions/:versionId
   * Get a specific Trail version by ID
   */
  router.get(
    "/:treeId/trail/versions/:versionId",
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      const treeId = (req.params.treeId || "").trim();
      const versionId = (req.params.versionId || "").trim();

      assertUuid(treeId, { code: "INVALID_TREE_ID", message: "invalid tree id" });
      assertUuid(versionId, { code: "INVALID_VERSION_ID", message: "invalid version id" });
      await assertTreeOwnership(pg, treeId, userId);

      // Fetch specific version
      const { rows } = await pg.query(
        `SELECT *
         FROM artifact_versions
         WHERE id = $1 AND tree_id = $2 AND artifact_type = 'trail'`,
        [versionId, treeId]
      );

      if (rows.length === 0) {
        throw new HttpError({
          status: 404,
          code: "VERSION_NOT_FOUND",
          message: "Trail version not found",
        });
      }

      const artifact = rows[0];

      // P0-6: Log trail.version_viewed to process_events for audit trail
      try {
        await pg.query(
          `INSERT INTO process_events (tree_id, event_type, meta)
           VALUES ($1, $2, $3)`,
          [
            treeId,
            "trail.version_viewed",
            JSON.stringify({
              artifact_id: versionId,
              prompt_version: artifact.prompt_version,
            }),
          ]
        );
      } catch (evtErr) {
        // Fail-open: log warning but never block main flow
        console.warn("[trail:version_viewed] process_event write failed:", evtErr.message);
      }

      res.status(200).json(
        withTraceId(res, {
          ok: true,
          version: formatVersionResponse(artifact),
          content_markdown: artifact.content_markdown,
        })
      );
    })
  );

  return router;
}
