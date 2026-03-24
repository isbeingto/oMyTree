import express from "express";
import { validate as uuidValidate } from "uuid";

import { HttpError, wrapAsync } from "../lib/errors.js";
import { withTraceId } from "../lib/trace.js";
import { getAuthUserIdForRequest } from "../lib/auth_user.js";
import { assertNodeOwnership, assertTreeOwnership } from "../lib/tree_access.js";
import { writeAuditLog } from "../lib/audit_log.js";
import { requestWeKnoraJson } from "./knowledge/proxy.js";
import { ensureOutcomeAssetsKnowledgeBase } from "../services/knowledge/outcome_assets_kb.js";
import { resolveProviderForRequest } from "../services/llm/providers/index.js";
import { resolveWorkspaceIdForUser } from "../services/workspaces/request_context.js";
import { resolveWorkspaceWeKnoraApiKey } from "../services/workspaces/weknora_credentials.js";
import {
  recordOutcomeAssetPublish,
  recordOutcomeAssetUnpublish,
} from "../services/outcome/outcome_asset_metrics.js";
import {
  computeMainPath,
  getKeyframesOnPath,
  getKeyframeNodeIdsOnPath,
  hasKeyframesOnPath,
  generateReport,
  findNearestAncestorOutcomeIdForPath,
  renderOutcomeAssetMarkdown,
} from "../lib/outcome/index.js";

function assertUuid(value, { code, message } = {}) {
  if (!value || typeof value !== "string" || !uuidValidate(value)) {
    throw new HttpError({
      status: 422,
      code: code || "INVALID_UUID",
      message: message || "invalid uuid",
    });
  }
}

function getClientIp(req) {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || null;
}

function getTraceId(res, req) {
  return res?.locals?.traceId ?? req?.headers?.["x-trace-id"] ?? null;
}

function normalizeText(value, { required = false, field = "text" } = {}) {
  if (typeof value !== "string") {
    if (required) {
      throw new HttpError({
        status: 422,
        code: "INVALID_PAYLOAD",
        message: `${field} must be a string`,
      });
    }
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) {
      throw new HttpError({
        status: 422,
        code: "INVALID_PAYLOAD",
        message: `${field} cannot be empty`,
      });
    }
    return null;
  }
  return trimmed;
}

function parsePagination(req, { defaultLimit = 20, maxLimit = 200 } = {}) {
  const limitRaw = req.query.limit;
  const offsetRaw = req.query.offset;

  const limitParsed = typeof limitRaw === "string" ? parseInt(limitRaw, 10) : NaN;
  const offsetParsed = typeof offsetRaw === "string" ? parseInt(offsetRaw, 10) : NaN;

  const limit = Math.max(1, Math.min(Number.isFinite(limitParsed) ? limitParsed : defaultLimit, maxLimit));
  const offset = Math.max(0, Number.isFinite(offsetParsed) ? offsetParsed : 0);

  return { limit, offset };
}

function pickAllowedBody(body, allowedKeys) {
  const payload = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const extras = Object.keys(payload).filter((key) => !allowedKeys.includes(key));
  if (extras.length > 0) {
    throw new HttpError({
      status: 400,
      code: "FIELD_FORBIDDEN",
      message: "payload contains forbidden fields",
      detail: { forbidden: extras },
    });
  }
  return payload;
}

function fallbackTitleCandidates({ anchorText, conclusion }) {
  const base = (conclusion || anchorText || "Outcome").trim().replace(/\s+/g, " ");
  const clipped = base.length > 30 ? `${base.slice(0, 30)}…` : base;
  const c1 = clipped || "Outcome";
  const c2 = `${c1}（摘要）`;
  const c3 = `${c1}（结论）`;
  return [c1, c2, c3];
}

function stripMarkdownCodeFences(text) {
  const raw = typeof text === "string" ? text.trim() : "";
  if (!raw) return "";

  const fenced = raw.match(/^```[a-zA-Z0-9_-]*\s*([\s\S]*?)\s*```$/);
  if (fenced && typeof fenced[1] === "string") return fenced[1].trim();
  return raw;
}

function normalizeCandidateString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const noFences = trimmed.replace(/```/g, "");
  const unquoted = noFences.replace(/^['"“”]+/, "").replace(/['"“”]+$/, "");
  const noTrailingComma = unquoted.replace(/,+\s*$/, "").trim();
  return noTrailingComma || null;
}

function dedupeAndFillToThree(items, fallback) {
  const out = [];
  const seen = new Set();

  for (const item of items) {
    const normalized = normalizeCandidateString(item);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= 3) break;
  }

  for (const item of fallback) {
    if (out.length >= 3) break;
    const normalized = normalizeCandidateString(item);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }

  return out.length >= 3 ? out.slice(0, 3) : fallback.slice(0, 3);
}

function parseTitleCandidatesFromAiText(rawText, { anchorText, conclusion } = {}) {
  const fallback = fallbackTitleCandidates({ anchorText, conclusion });
  const raw = stripMarkdownCodeFences(rawText);
  if (!raw) return fallback;

  // 1) Try direct JSON array (after removing trailing commas)
  const tryJson = (candidateJson) => {
    if (typeof candidateJson !== "string" || !candidateJson.trim()) return null;
    const cleaned = candidateJson
      .trim()
      .replace(/,\s*]/g, "]")
      .replace(/,\s*}/g, "}");
    try {
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const direct = tryJson(raw);
  if (direct) {
    return dedupeAndFillToThree(direct, fallback);
  }

  // 2) Extract the first JSON array substring if the model wrapped it with extra text
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start >= 0 && end > start) {
    const sliced = raw.slice(start, end + 1);
    const extracted = tryJson(sliced);
    if (extracted) {
      return dedupeAndFillToThree(extracted, fallback);
    }
  }

  // 3) Fallback: parse line-by-line, ignoring bracket-only lines
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => l !== "[" && l !== "]");

  const candidates = [];
  for (const line of lines) {
    const cleaned = line.replace(/^[-*\d.\s]+/, "").trim();
    if (!cleaned) continue;

    // If it looks like a JSON string, try JSON.parse after removing trailing commas.
    const noTrailingComma = cleaned.replace(/,+\s*$/, "");
    if ((noTrailingComma.startsWith('"') && noTrailingComma.endsWith('"')) || (noTrailingComma.startsWith("'") && noTrailingComma.endsWith("'"))) {
      try {
        const parsed = JSON.parse(noTrailingComma.replace(/^'/, '"').replace(/'$/, '"'));
        candidates.push(parsed);
        continue;
      } catch {
        // continue to raw
      }
    }

    candidates.push(noTrailingComma);
  }

  return dedupeAndFillToThree(candidates, fallback);
}

async function generateTitleCandidates({ userId, providerHint, modelHint, anchorText, conclusion, keyframes }) {
  const safeAnchor = (anchorText || "").trim().slice(0, 200);
  const safeConclusion = (conclusion || "").trim().slice(0, 200);
  const kfHints = Array.isArray(keyframes)
    ? keyframes
        .slice(0, 6)
        .map((k) => (k?.annotation ? String(k.annotation).trim() : ""))
        .filter(Boolean)
    : [];

  const prompt = `You generate 3 short titles for an "Outcome" report.

Constraints:
- Output MUST be a JSON array of exactly 3 strings.
- Each title should be concise (<= 18 Chinese characters or <= 36 Latin chars).
- Avoid quotes and markdown.

Context:
- Anchor text: ${JSON.stringify(safeAnchor)}
- One-line conclusion: ${JSON.stringify(safeConclusion)}
- Keyframe annotations (optional): ${JSON.stringify(kfHints)}
`;

  try {
    // If the context is truly empty, use deterministic fallback.
    // Otherwise still attempt AI generation; parsing is robust and we can fallback on errors.
    if (kfHints.length === 0 && !safeConclusion && !safeAnchor) {
      return fallbackTitleCandidates({ anchorText, conclusion });
    }

    const { provider, defaultModel } = await resolveProviderForRequest({
      providerHint: providerHint || null,
      userId,
    });

    const result = await provider.callChat({
      prompt,
      options: {
        model: modelHint || defaultModel || undefined,
        temperature: 0.3,
      },
    });

    const raw = typeof result?.ai_text === "string" ? result.ai_text.trim() : "";
    return parseTitleCandidatesFromAiText(raw, { anchorText, conclusion });
  } catch (err) {
    console.warn("[tree_outcomes] title candidate generation failed:", err?.message);
    return fallbackTitleCandidates({ anchorText, conclusion });
  }
}

function normalizeKnowledgeId(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed || "";
}

function buildOutcomeAssetFilename(outcomeId) {
  return `outcome_${outcomeId}.md`;
}

async function uploadOutcomeAssetMarkdown({ res, knowledgeBaseId, outcomeId, markdown }) {
  const form = new FormData();
  const payload = typeof markdown === "string" ? markdown : "";
  const blob = new Blob([payload], { type: "text/markdown; charset=utf-8" });
  form.append("file", blob, buildOutcomeAssetFilename(outcomeId));

  const uploadData = await requestWeKnoraJson({
    method: "POST",
    path: `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/knowledge/file`,
    body: form,
    res,
  });

  const documentId = normalizeKnowledgeId(uploadData?.id);
  if (!documentId) {
    throw new HttpError({
      status: 502,
      code: "WEKNORA_OUTCOME_DOC_INVALID_RESPONSE",
      message: "invalid WeKnora response while uploading outcome asset document",
    });
  }
  return documentId;
}

async function deleteKnowledgeDocumentSafely({ res, knowledgeBaseId, documentId }) {
  const kbId = normalizeKnowledgeId(knowledgeBaseId);
  const docId = normalizeKnowledgeId(documentId);
  if (!docId) return;

  try {
    await requestWeKnoraJson({
      method: "DELETE",
      path: `/knowledge/${encodeURIComponent(docId)}`,
      res,
    });
  } catch (err) {
    if (err?.status !== 404) throw err;

    try {
      await requestWeKnoraJson({
        method: "DELETE",
        path: `/knowledge-bases/${encodeURIComponent(kbId)}/knowledge/${encodeURIComponent(docId)}`,
        res,
      });
    } catch (fallbackErr) {
      if (fallbackErr?.status !== 404) {
        throw fallbackErr;
      }
    }
  }
}

async function upsertOutcomeAssetMapping({
  pg,
  workspaceId,
  userId,
  treeId,
  outcomeId,
  knowledgeBaseId,
  documentId,
}) {
  const { rows: existingRows } = await pg.query(
    `SELECT document_id
       FROM outcome_assets
      WHERE workspace_id = $1
        AND outcome_id = $2
      LIMIT 1`,
    [workspaceId, outcomeId]
  );
  const oldDocumentId = normalizeKnowledgeId(existingRows[0]?.document_id);

  const { rows } = await pg.query(
    `INSERT INTO outcome_assets (
       workspace_id,
       user_id,
       tree_id,
       outcome_id,
       knowledge_base_id,
       document_id
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (workspace_id, outcome_id)
     DO UPDATE SET
       user_id = EXCLUDED.user_id,
       tree_id = EXCLUDED.tree_id,
       knowledge_base_id = EXCLUDED.knowledge_base_id,
       document_id = EXCLUDED.document_id,
       updated_at = NOW()
     RETURNING knowledge_base_id, document_id, updated_at`,
    [workspaceId, userId, treeId, outcomeId, knowledgeBaseId, documentId]
  );

  return {
    asset: rows[0] || null,
    oldDocumentId: oldDocumentId && oldDocumentId !== documentId ? oldDocumentId : "",
  };
}

export default function createTreeOutcomesRouter(pg) {
  const router = express.Router();

  /**
   * POST /api/tree/:treeId/outcomes/preview
   * Generate title candidates (and warning) without creating an outcome.
   */
  router.post(
    "/:treeId/outcomes/preview",
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      const treeId = (req.params.treeId || "").trim();

      assertUuid(treeId, { code: "INVALID_TREE_ID", message: "invalid tree id" });
      await assertTreeOwnership(pg, treeId, userId);

      const body = pickAllowedBody(req.body, ["anchor_node_id", "conclusion", "provider", "model"]);
      const anchorNodeId = body.anchor_node_id;
      const conclusion = normalizeText(body.conclusion, { required: false, field: "conclusion" });
      const providerHint = typeof body.provider === "string" ? body.provider.trim() : null;
      const modelHint = typeof body.model === "string" ? body.model.trim() : null;

      assertUuid(anchorNodeId, { code: "INVALID_ANCHOR_NODE_ID", message: "invalid anchor_node_id" });

      const ownedNode = await assertNodeOwnership(pg, anchorNodeId, userId);
      if (ownedNode.tree_id !== treeId) {
        throw new HttpError({ status: 404, code: "NODE_NOT_FOUND", message: "node not found" });
      }

      const { nodeIds, nodeMap } = await computeMainPath(treeId, anchorNodeId, { client: pg });
      const hasKeyframes = await hasKeyframesOnPath(userId, treeId, nodeIds, { client: pg });
      const keyframes = hasKeyframes ? await getKeyframesOnPath(userId, treeId, nodeIds, { client: pg }) : [];
      const anchorText = nodeMap.get(anchorNodeId)?.text || "";

      const titleCandidates = await generateTitleCandidates({
        userId,
        providerHint,
        modelHint,
        anchorText,
        conclusion,
        keyframes,
      });

      const warning = hasKeyframes ? undefined : "no_keyframes_on_path";

      res.status(200).json(
        withTraceId(res, {
          ok: true,
          title_candidates: titleCandidates,
          ...(warning ? { warning } : {}),
        })
      );
    })
  );

  /**
   * POST /api/tree/:treeId/outcomes
   * Create an outcome anchored to a node.
   */
  router.post(
    "/:treeId/outcomes",
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      const treeId = (req.params.treeId || "").trim();

      assertUuid(treeId, { code: "INVALID_TREE_ID", message: "invalid tree id" });
      await assertTreeOwnership(pg, treeId, userId);

      const body = pickAllowedBody(req.body, ["anchor_node_id", "title", "conclusion", "provider", "model"]);
      const anchorNodeId = body.anchor_node_id;
      // NOTE: conclusion is used as optional guidance in the UI; allow empty/missing.
      // Persist as an empty string to keep DB constraints stable.
      const conclusion = normalizeText(body.conclusion, { required: false, field: "conclusion" }) || "";
      const requestedTitle = normalizeText(body.title, { required: false, field: "title" });
      const providerHint = typeof body.provider === "string" ? body.provider.trim() : null;
      const modelHint = typeof body.model === "string" ? body.model.trim() : null;

      assertUuid(anchorNodeId, { code: "INVALID_ANCHOR_NODE_ID", message: "invalid anchor_node_id" });

      const ownedNode = await assertNodeOwnership(pg, anchorNodeId, userId);
      if (ownedNode.tree_id !== treeId) {
        throw new HttpError({ status: 404, code: "NODE_NOT_FOUND", message: "node not found" });
      }

      const { nodeIds, nodeMap } = await computeMainPath(treeId, anchorNodeId, { client: pg });
      const hasKeyframes = await hasKeyframesOnPath(userId, treeId, nodeIds, { client: pg });

      const anchorText = nodeMap.get(anchorNodeId)?.text || "";
      const keyframes = hasKeyframes ? await getKeyframesOnPath(userId, treeId, nodeIds, { client: pg }) : [];

      const titleCandidates = await generateTitleCandidates({
        userId,
        providerHint,
        modelHint,
        anchorText,
        conclusion,
        keyframes,
      });

      const title = requestedTitle || titleCandidates[0];

      const derivedFromOutcomeId = await findNearestAncestorOutcomeIdForPath({
        userId,
        treeId,
        anchorNodeId,
        mainPathNodeIds: nodeIds,
        options: { client: pg },
      });

      const generationInput = {
        anchor_node_id: anchorNodeId,
        main_path_node_ids: nodeIds,
        has_keyframes_on_path: hasKeyframes,
        keyframe_ids_on_path: keyframes.map((k) => k.keyframeId).filter(Boolean),
        derived_from_outcome_id: derivedFromOutcomeId,
      };

      try {
        const { rows } = await pg.query(
          `INSERT INTO outcomes (
             user_id,
             tree_id,
             anchor_node_id,
             title,
             conclusion,
             derived_from_outcome_id,
             status,
             prompt_version,
             generation_input
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *`,
          [
            userId,
            treeId,
            anchorNodeId,
            title,
            conclusion,
            derivedFromOutcomeId,
            "generating",
            null,
            JSON.stringify(generationInput),
          ]
        );

        let outcome = rows[0];

        // Generate report immediately
        const reportJson = await generateReport({
          outcome,
          mainPathNodeIds: nodeIds,
          keyframes,
          nodeMap,
          options: { client: pg },
        });

        const { rows: updatedRows } = await pg.query(
          `UPDATE outcomes
           SET report_json = $1,
               prompt_version = $2,
               status = 'generated',
               updated_at = NOW()
           WHERE id = $3
           RETURNING *`,
          [JSON.stringify(reportJson), reportJson.generation_meta?.prompt_version || null, outcome.id]
        );

        outcome = updatedRows[0];

        const warning = hasKeyframes ? undefined : "no_keyframes_on_path";

        res.status(201).json(
          withTraceId(res, {
            ok: true,
            outcome,
            title_candidates: titleCandidates,
            ...(warning ? { warning } : {}),
          })
        );
      } catch (err) {
        if (err?.code === "23505") {
          throw new HttpError({
            status: 409,
            code: "OUTCOME_ALREADY_EXISTS",
            message: "outcome already exists for this anchor",
          });
        }
        throw err;
      }
    })
  );

  /**
   * GET /api/tree/:treeId/outcomes
   * List outcomes for a tree.
   */
  router.get(
    "/:treeId/outcomes",
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      const treeId = (req.params.treeId || "").trim();

      assertUuid(treeId, { code: "INVALID_TREE_ID", message: "invalid tree id" });
      await assertTreeOwnership(pg, treeId, userId);

      const { limit, offset } = parsePagination(req);

      const workspaceId = await resolveWorkspaceIdForUser({ db: pg, req, userId });

      let rows = [];
      try {
        const result = await pg.query(
          `SELECT
             o.id,
             o.tree_id,
             o.anchor_node_id,
             o.title,
             o.conclusion,
             o.status,
             o.created_at,
             o.updated_at,
             EXISTS (
               SELECT 1
                 FROM outcome_assets oa
                WHERE oa.workspace_id = $5
                  AND oa.outcome_id = o.id
             ) AS asset_published
           FROM outcomes o
           WHERE o.user_id = $1
             AND o.tree_id = $2
           ORDER BY o.created_at DESC
           LIMIT $3
           OFFSET $4`,
          [userId, treeId, limit, offset, workspaceId]
        );
        rows = result.rows;
      } catch (err) {
        if (err?.code !== "42P01") {
          throw err;
        }
        const fallback = await pg.query(
          `SELECT
             id,
             tree_id,
             anchor_node_id,
             title,
             conclusion,
             status,
             created_at,
             updated_at
           FROM outcomes
           WHERE user_id = $1
             AND tree_id = $2
           ORDER BY created_at DESC
           LIMIT $3
           OFFSET $4`,
          [userId, treeId, limit, offset]
        );
        rows = fallback.rows.map((row) => ({ ...row, asset_published: false }));
      }

      res.status(200).json(
        withTraceId(res, {
          ok: true,
          outcomes: rows,
          limit,
          offset,
        })
      );
    })
  );

  /**
   * GET /api/tree/:treeId/outcomes/:id
   * Get outcome details + highlight data.
   */
  router.get(
    "/:treeId/outcomes/:id",
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      const treeId = (req.params.treeId || "").trim();
      const outcomeId = (req.params.id || "").trim();

      assertUuid(treeId, { code: "INVALID_TREE_ID", message: "invalid tree id" });
      assertUuid(outcomeId, { code: "INVALID_OUTCOME_ID", message: "invalid outcome id" });

      await assertTreeOwnership(pg, treeId, userId);

      const { rows } = await pg.query(
        `SELECT *
         FROM outcomes
         WHERE id = $1
           AND tree_id = $2
           AND user_id = $3
         LIMIT 1`,
        [outcomeId, treeId, userId]
      );

      const outcome = rows[0];
      if (!outcome) {
        throw new HttpError({ status: 404, code: "OUTCOME_NOT_FOUND", message: "outcome not found" });
      }

      const workspaceId = await resolveWorkspaceIdForUser({ db: pg, req, userId });
      let asset = null;
      try {
        const { rows: assetRows } = await pg.query(
          `SELECT knowledge_base_id, document_id, updated_at
             FROM outcome_assets
            WHERE workspace_id = $1
              AND outcome_id = $2
            LIMIT 1`,
          [workspaceId, outcomeId]
        );
        const current = assetRows[0];
        if (current) {
          asset = {
            knowledge_base_id: current.knowledge_base_id,
            document_id: current.document_id,
            updated_at: current.updated_at,
          };
        }
      } catch (err) {
        // Keep detail endpoint backward-compatible when OA-0.1 migration is not applied yet.
        if (err?.code !== "42P01") {
          throw err;
        }
      }
      outcome.asset_published = Boolean(asset);

      const { nodeIds } = await computeMainPath(treeId, outcome.anchor_node_id, { client: pg });
      const keyframeNodeIds = await getKeyframeNodeIdsOnPath(userId, treeId, nodeIds, { client: pg });

      res.status(200).json(
        withTraceId(res, {
          ok: true,
          outcome,
          asset,
          highlight: {
            main_path_node_ids: nodeIds,
            keyframe_node_ids: keyframeNodeIds,
          },
        })
      );
    })
  );

  /**
   * POST /api/tree/:treeId/outcomes/:id/publish
   * Publish an outcome report into workspace-scoped Outcome Assets KB.
   */
  router.post(
    "/:treeId/outcomes/:id/publish",
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      const treeId = (req.params.treeId || "").trim();
      const outcomeId = (req.params.id || "").trim();

      assertUuid(treeId, { code: "INVALID_TREE_ID", message: "invalid tree id" });
      assertUuid(outcomeId, { code: "INVALID_OUTCOME_ID", message: "invalid outcome id" });

      await assertTreeOwnership(pg, treeId, userId);

      const { rows: outcomeRows } = await pg.query(
        `SELECT id, tree_id, user_id, anchor_node_id, title, conclusion, report_json
         FROM outcomes
         WHERE id = $1
           AND tree_id = $2
           AND user_id = $3
         LIMIT 1`,
        [outcomeId, treeId, userId]
      );
      const outcome = outcomeRows[0];
      if (!outcome) {
        throw new HttpError({ status: 404, code: "OUTCOME_NOT_FOUND", message: "outcome not found" });
      }

      const workspaceId = await resolveWorkspaceIdForUser({ db: pg, req, userId });
      const weknoraApiKey = await resolveWorkspaceWeKnoraApiKey({ client: pg, workspaceId });

      res.locals.authUserId = userId;
      res.locals.workspaceId = workspaceId;
      res.locals.weknoraApiKey = weknoraApiKey;

      const { knowledgeBaseId } = await ensureOutcomeAssetsKnowledgeBase({
        pg,
        res,
        workspaceId,
      });

      const markdown = renderOutcomeAssetMarkdown({
        outcome,
        treeId,
        anchorNodeId: outcome.anchor_node_id,
        appBaseUrl: process.env.APP_PUBLIC_URL || "",
      });

      const documentId = await uploadOutcomeAssetMarkdown({
        res,
        knowledgeBaseId,
        outcomeId,
        markdown,
      });

      let upserted = null;
      let oldDocumentId = "";

      try {
        const mapping = await upsertOutcomeAssetMapping({
          pg,
          workspaceId,
          userId,
          treeId,
          outcomeId,
          knowledgeBaseId,
          documentId,
        });
        upserted = mapping.asset;
        oldDocumentId = mapping.oldDocumentId;
      } catch (err) {
        try {
          await deleteKnowledgeDocumentSafely({
            res,
            knowledgeBaseId,
            documentId,
          });
        } catch (cleanupErr) {
          console.warn("[tree_outcomes] failed to cleanup uploaded outcome document after db failure", {
            outcomeId,
            workspaceId,
            documentId,
            error: cleanupErr?.message || null,
          });
        }
        throw err;
      }

      if (oldDocumentId) {
        await deleteKnowledgeDocumentSafely({
          res,
          knowledgeBaseId,
          documentId: oldDocumentId,
        });
      }

      if (!upserted) {
        throw new HttpError({
          status: 500,
          code: "OUTCOME_ASSET_UPSERT_FAILED",
          message: "failed to persist outcome asset mapping",
        });
      }

      recordOutcomeAssetPublish();
      await writeAuditLog(
        {
          actorUserId: userId,
          actorRole: "user",
          action: "outcome.asset.publish",
          targetType: "outcome",
          targetId: outcomeId,
          ip: getClientIp(req),
          traceId: getTraceId(res, req),
          metadata: {
            workspace_id: workspaceId,
            tree_id: treeId,
            outcome_id: outcomeId,
            knowledge_base_id: upserted.knowledge_base_id,
            document_id: upserted.document_id,
          },
        },
        pg
      );

      res.status(200).json(
        withTraceId(res, {
          ok: true,
          asset: {
            knowledge_base_id: upserted.knowledge_base_id,
            document_id: upserted.document_id,
            updated_at: upserted.updated_at,
          },
        })
      );
    })
  );

  /**
   * DELETE /api/tree/:treeId/outcomes/:id/publish
   * Unpublish an outcome report from workspace-scoped Outcome Assets KB.
   */
  router.delete(
    "/:treeId/outcomes/:id/publish",
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      const treeId = (req.params.treeId || "").trim();
      const outcomeId = (req.params.id || "").trim();

      assertUuid(treeId, { code: "INVALID_TREE_ID", message: "invalid tree id" });
      assertUuid(outcomeId, { code: "INVALID_OUTCOME_ID", message: "invalid outcome id" });

      await assertTreeOwnership(pg, treeId, userId);

      const workspaceId = await resolveWorkspaceIdForUser({ db: pg, req, userId });
      const weknoraApiKey = await resolveWorkspaceWeKnoraApiKey({ client: pg, workspaceId });

      res.locals.authUserId = userId;
      res.locals.workspaceId = workspaceId;
      res.locals.weknoraApiKey = weknoraApiKey;

      const { rows } = await pg.query(
        `SELECT knowledge_base_id, document_id
           FROM outcome_assets
          WHERE workspace_id = $1
            AND user_id = $2
            AND tree_id = $3
            AND outcome_id = $4
          LIMIT 1`,
        [workspaceId, userId, treeId, outcomeId]
      );

      const mapping = rows[0];
      if (!mapping) {
        res.status(200).json(withTraceId(res, { ok: true }));
        return;
      }

      await deleteKnowledgeDocumentSafely({
        res,
        knowledgeBaseId: mapping.knowledge_base_id,
        documentId: mapping.document_id,
      });

      await pg.query(
        `DELETE FROM outcome_assets
          WHERE workspace_id = $1
            AND user_id = $2
            AND tree_id = $3
            AND outcome_id = $4`,
        [workspaceId, userId, treeId, outcomeId]
      );

      recordOutcomeAssetUnpublish();
      await writeAuditLog(
        {
          actorUserId: userId,
          actorRole: "user",
          action: "outcome.asset.unpublish",
          targetType: "outcome",
          targetId: outcomeId,
          ip: getClientIp(req),
          traceId: getTraceId(res, req),
          metadata: {
            workspace_id: workspaceId,
            tree_id: treeId,
            outcome_id: outcomeId,
            knowledge_base_id: mapping.knowledge_base_id,
            document_id: mapping.document_id,
          },
        },
        pg
      );

      res.status(200).json(withTraceId(res, { ok: true }));
    })
  );

  /**
   * PATCH /api/tree/:treeId/outcomes/:id
   * Update outcome title and/or conclusion.
   */
  router.patch(
    "/:treeId/outcomes/:id",
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      const treeId = (req.params.treeId || "").trim();
      const outcomeId = (req.params.id || "").trim();

      assertUuid(treeId, { code: "INVALID_TREE_ID", message: "invalid tree id" });
      assertUuid(outcomeId, { code: "INVALID_OUTCOME_ID", message: "invalid outcome id" });

      await assertTreeOwnership(pg, treeId, userId);

      const body = pickAllowedBody(req.body, ["title", "conclusion"]);
      const title = typeof body.title === "undefined" ? undefined : normalizeText(body.title, { required: false, field: "title" });
      const conclusion = typeof body.conclusion === "undefined" ? undefined : normalizeText(body.conclusion, { required: false, field: "conclusion" });

      if (typeof title === "undefined" && typeof conclusion === "undefined") {
        throw new HttpError({ status: 422, code: "INVALID_PAYLOAD", message: "nothing to update" });
      }

      const { rows } = await pg.query(
        `UPDATE outcomes
         SET
           title = COALESCE($4, title),
           conclusion = COALESCE($5, conclusion),
           updated_at = now()
         WHERE id = $1
           AND tree_id = $2
           AND user_id = $3
         RETURNING *`,
        [outcomeId, treeId, userId, title ?? null, conclusion ?? null]
      );

      const outcome = rows[0];
      if (!outcome) {
        throw new HttpError({ status: 404, code: "OUTCOME_NOT_FOUND", message: "outcome not found" });
      }

      res.status(200).json(withTraceId(res, { ok: true, outcome }));
    })
  );

  /**
   * DELETE /api/tree/:treeId/outcomes/:id
   */
  router.delete(
    "/:treeId/outcomes/:id",
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      const treeId = (req.params.treeId || "").trim();
      const outcomeId = (req.params.id || "").trim();

      assertUuid(treeId, { code: "INVALID_TREE_ID", message: "invalid tree id" });
      assertUuid(outcomeId, { code: "INVALID_OUTCOME_ID", message: "invalid outcome id" });

      await assertTreeOwnership(pg, treeId, userId);

      const result = await pg.query(
        `DELETE FROM outcomes
         WHERE id = $1
           AND tree_id = $2
           AND user_id = $3
         RETURNING id`,
        [outcomeId, treeId, userId]
      );

      if ((result.rowCount || 0) === 0) {
        throw new HttpError({ status: 404, code: "OUTCOME_NOT_FOUND", message: "outcome not found" });
      }

      res.status(200).json(withTraceId(res, { ok: true }));
    })
  );

  /**
   * POST /api/tree/:treeId/outcomes/:id/regenerate
   * Regenerate report_json (minimal, non-LLM baseline for now).
   */
  router.post(
    "/:treeId/outcomes/:id/regenerate",
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      const treeId = (req.params.treeId || "").trim();
      const outcomeId = (req.params.id || "").trim();

      assertUuid(treeId, { code: "INVALID_TREE_ID", message: "invalid tree id" });
      assertUuid(outcomeId, { code: "INVALID_OUTCOME_ID", message: "invalid outcome id" });

      await assertTreeOwnership(pg, treeId, userId);

      const { rows } = await pg.query(
        `SELECT *
         FROM outcomes
         WHERE id = $1
           AND tree_id = $2
           AND user_id = $3
         LIMIT 1`,
        [outcomeId, treeId, userId]
      );

      const existing = rows[0];
      if (!existing) {
        throw new HttpError({ status: 404, code: "OUTCOME_NOT_FOUND", message: "outcome not found" });
      }

      const { nodeIds, nodeMap } = await computeMainPath(treeId, existing.anchor_node_id, { client: pg });
      const hasKeyframes = await hasKeyframesOnPath(userId, treeId, nodeIds, { client: pg });
      const keyframes = hasKeyframes ? await getKeyframesOnPath(userId, treeId, nodeIds, { client: pg }) : [];

      const derivedFromOutcomeId = await findNearestAncestorOutcomeIdForPath({
        userId,
        treeId,
        anchorNodeId: existing.anchor_node_id,
        mainPathNodeIds: nodeIds,
        options: { client: pg },
      });

      const outcomeForGeneration = {
        ...existing,
        derived_from_outcome_id: derivedFromOutcomeId,
      };

      // T93-5: Use skeleton-fill report generator
      const reportJson = await generateReport({
        outcome: outcomeForGeneration,
        mainPathNodeIds: nodeIds,
        keyframes,
        nodeMap,
        options: { client: pg },
      });

      const generationInput = {
        ...((existing.generation_input && typeof existing.generation_input === "object") ? existing.generation_input : {}),
        regenerated_at: new Date().toISOString(),
        main_path_node_ids: nodeIds,
        keyframe_ids_on_path: keyframes.map((k) => k.keyframeId).filter(Boolean),
        derived_from_outcome_id: derivedFromOutcomeId,
      };

      const { rows: updatedRows } = await pg.query(
        `UPDATE outcomes
         SET
           report_json = $4,
           prompt_version = $5,
           generation_input = $6,
           derived_from_outcome_id = $7,
           status = 'generated',
           updated_at = now()
         WHERE id = $1
           AND tree_id = $2
           AND user_id = $3
         RETURNING *`,
        [
          outcomeId,
          treeId,
          userId,
          JSON.stringify(reportJson),
          reportJson?.generation_meta?.prompt_version || null,
          JSON.stringify(generationInput),
          derivedFromOutcomeId,
        ]
      );

      const outcome = updatedRows[0];
      const warning = hasKeyframes ? undefined : "no_keyframes_on_path";

      res.status(200).json(
        withTraceId(res, {
          ok: true,
          outcome,
          ...(warning ? { warning } : {}),
        })
      );
    })
  );

  return router;
}
