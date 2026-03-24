/**
 * Phase 5.1: Narrative Generation API (Thinking Trail v1)
 * POST /api/tree/:treeId/narrative - Generate and persist narrative report
 * GET  /api/tree/:treeId/narrative - Fetch persisted narrative report
 * 
 * Generates a structured "Thinking Trail" report from keyframes with user annotations.
 * Uses metacognitive analyst prompting with structured JSON step input.
 * Reports are persisted to the trees table (narrative_report column).
 * 
 * @version trail_v1_metacognitive_steps_json
 */

import express from "express";
import { validate as uuidValidate } from "uuid";

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

function assertUuid(value, { code, message } = {}) {
  if (!value || typeof value !== "string" || !uuidValidate(value)) {
    throw new HttpError({
      status: 422,
      code: code || "INVALID_UUID",
      message: message || "invalid uuid",
    });
  }
}

export default function createNarrativeRouter(pg) {
  const router = express.Router();

  /**
   * POST /api/tree/:treeId/narrative
   * Generate a Thinking Trail narrative report from keyframes
   */
  router.post(
    "/:treeId/narrative",
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      const treeId = (req.params.treeId || "").trim();

      assertUuid(treeId, { code: "INVALID_TREE_ID", message: "invalid tree id" });

      // Verify tree ownership
      await assertTreeOwnership(pg, treeId, userId);

      // Step 1: Fetch keyframes with full turn context using new query
      // Strict chronological ordering: k.created_at ASC, k.id ASC
      const { rows: keyframeRows } = await pg.query(
        getKeyframesQuery(),
        [userId, treeId]
      );

      if (keyframeRows.length === 0) {
        throw new HttpError({
          status: 400,
          code: "NO_KEYFRAMES",
          message: "No keyframes found for this tree. Pin some messages first.",
          hint: "Use the Pin feature to mark important messages as keyframes before generating a narrative.",
        });
      }

      console.log(`[trail:generate] Found ${keyframeRows.length} keyframes for tree=${treeId}`);

      // Step 2: Build structured step input with truncation
      const steps = buildStepInput(keyframeRows);
      const stepsJson = formatStepsAsJson(steps);

      if (steps.length < keyframeRows.length) {
        console.log(
          `[trail:generate] Truncated from ${keyframeRows.length} to ${steps.length} steps (MAX_STEPS=${TRAIL_LIMITS.MAX_STEPS})`
        );
      }

      // Step 3: Build messages with metacognitive analyst prompts
      const messages = [
        {
          role: "system",
          content: TRAIL_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: buildUserPrompt(stepsJson, steps.length),
        },
      ];

      // Step 4: Call LLM
      const providerHint = req.body?.provider || null;
      const model = req.body?.model || null;

      const { provider, defaultModel } = await resolveProviderForRequest({
        providerHint,
        userId,
      });

      const startTime = Date.now();
      let llmResult;

      try {
        llmResult = await provider.callChat({
          messages,
          options: {
            model: model || defaultModel,
            temperature: 0.4,
            mode: "narrative",
          },
        });
      } catch (err) {
        console.error("[trail:generate] LLM call failed:", err.message);
        throw new HttpError({
          status: 502,
          code: "LLM_FAILED",
          message: "Failed to generate narrative report",
          detail: err.message,
        });
      }

      const durationMs = Date.now() - startTime;

      // Step 5: Extract and validate content
      const content = llmResult.ai_text || llmResult.text || "";

      if (!content.trim()) {
        throw new HttpError({
          status: 500,
          code: "EMPTY_RESPONSE",
          message: "LLM returned empty response",
        });
      }

      // Step 6: Validate output structure and log diagnostics
      const validation = validateTrailOutput(content, steps);
      logTrailDiagnostics(treeId, {
        inputSteps: steps.length,
        durationMs,
        validation,
        promptVersion: PROMPT_VERSION,
      });

      // Step 7: Persist the report to the trees table
      await pg.query(
        `UPDATE trees 
         SET narrative_report = $1, 
             narrative_report_updated_at = NOW()
         WHERE id = $2`,
        [content, treeId]
      );
      console.log(`[trail:generate] Report persisted for tree=${treeId}`);

      // P0-6: Log trail.generated to process_events for audit trail
      try {
        await pg.query(
          `INSERT INTO process_events (tree_id, event_type, meta)
           VALUES ($1, $2, $3)`,
          [
            treeId,
            "trail.generated",
            JSON.stringify({
              prompt_version: PROMPT_VERSION,
              step_count: steps.length,
              duration_ms: durationMs,
              legacy_route: true,
            }),
          ]
        );
      } catch (evtErr) {
        // Fail-open: log warning but never block main flow
        console.warn("[narrative:generate] process_event write failed:", evtErr.message);
      }

      res.status(200).json(
        withTraceId(res, {
          ok: true,
          content,
          keyframes_count: keyframeRows.length,
          steps_processed: steps.length,
          duration_ms: durationMs,
          persisted: true,
          validation: {
            warnings: validation.warnings,
            metrics: validation.metrics,
          },
          prompt_version: PROMPT_VERSION,
        })
      );
    })
  );

  /**
   * GET /api/tree/:treeId/narrative
   * Fetch the persisted narrative report with metadata
   */
  router.get(
    "/:treeId/narrative",
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      const treeId = (req.params.treeId || "").trim();

      assertUuid(treeId, { code: "INVALID_TREE_ID", message: "invalid tree id" });

      // Verify tree ownership
      await assertTreeOwnership(pg, treeId, userId);

      // Fetch the persisted report
      const { rows } = await pg.query(
        `SELECT narrative_report, narrative_report_updated_at
         FROM trees
         WHERE id = $1`,
        [treeId]
      );

      if (rows.length === 0) {
        throw new HttpError({
          status: 404,
          code: "TREE_NOT_FOUND",
          message: "Tree not found",
        });
      }

      const { narrative_report, narrative_report_updated_at } = rows[0];

      // Re-validate for jump link metrics if content exists
      let validation = null;
      if (narrative_report) {
        const { validateTrailOutput } = await import("../lib/trail/validator.js");
        validation = validateTrailOutput(narrative_report, []);
      }

      res.status(200).json(
        withTraceId(res, {
          ok: true,
          content: narrative_report || null,
          updated_at: narrative_report_updated_at || null,
          validation: validation
            ? { metrics: validation.metrics }
            : null,
        })
      );
    })
  );

  return router;
}
