import express from "express";
import multer from "multer";
import { Readable } from "node:stream";
import { HttpError, wrapAsync } from "../../lib/errors.js";
import { withTraceId } from "../../lib/trace.js";
import { writeAuditLog } from "../../lib/audit_log.js";
import { signPayload } from "../../lib/signed_token.js";
import { requireKnowledgeAuth } from "./auth.js";
import { attachWorkspaceWeKnoraCredentials } from "../../middleware/workspace_weknora_credentials.js";
import { syncWorkspaceWeKnoraApiKeyFromWeKnora } from "../../services/workspaces/weknora_provisioning.js";
import { requestWeKnoraJson, requestWeKnoraRawJson, requestWeKnoraStream } from "./proxy.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

function asPlainText(value) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function getClientIp(req) {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || null;
}

function getAuditContext(req, res) {
  return {
    actorUserId: res?.locals?.authUserId || null,
    workspaceId: res?.locals?.workspaceId || null,
    traceId: res?.locals?.traceId ?? req?.headers?.["x-trace-id"] ?? null,
    ip: getClientIp(req),
  };
}

function looksLikeMojibakeLatin1(value) {
  if (typeof value !== "string" || !value) return false;
  // If it already contains CJK, assume it's already correctly decoded.
  if (/[\u4E00-\u9FFF]/.test(value)) return false;
  // Common UTF-8-as-latin1 mojibake characters (e.g. "Ã©" / "Â" sequences).
  if (/[ÃÂ]/.test(value)) return true;

  // CJK filenames often end up as UTF-8 bytes interpreted as latin1 (e.g. "ä¸­æ–‡.pdf").
  // That pattern typically mixes bytes from both ranges:
  // - 0xC0-0xFF (\u00C0-\u00FF)
  // - 0x80-0xBF (\u0080-\u00BF)
  const hi = (value.match(/[\u00C0-\u00FF]/g) || []).length;
  const mid = (value.match(/[\u0080-\u00BF]/g) || []).length;

  // Require at least one from each bucket to reduce false positives on legitimate latin1 names.
  if (hi >= 1 && mid >= 1 && hi+mid >= 3) return true;

  // Fallback: many non-ASCII bytes and no CJK is suspicious.
  const nonAscii = (value.match(/[\u0080-\u00FF]/g) || []).length;
  return value.length >= 8 && nonAscii >= 4;
}

function normalizeUploadedFilename(value) {
  if (typeof value !== "string" || !value) return "document";
  const trimmed = value.trim();
  if (!trimmed) return "document";
  if (!looksLikeMojibakeLatin1(trimmed)) return trimmed;

  try {
    const recovered = Buffer.from(trimmed, "latin1").toString("utf8");
    // Pick recovered only if it looks healthier.
    const replacementOriginal = (trimmed.match(/\uFFFD/g) || []).length;
    const replacementRecovered = (recovered.match(/\uFFFD/g) || []).length;
    const cjkRecovered = (recovered.match(/[\u4E00-\u9FFF]/g) || []).length;

    if (replacementRecovered <= replacementOriginal && (cjkRecovered > 0 || recovered.length >= trimmed.length)) {
      return recovered;
    }
  } catch {
    // ignore
  }

  return trimmed;
}

function clampInt(value, { min, max, fallback }) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function getKnowledgeDownloadTokenSecret() {
  return (
    process.env.KNOWLEDGE_DOWNLOAD_TOKEN_SECRET ||
    process.env.OMYTREE_DOWNLOAD_TOKEN_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    ""
  );
}

function isEmbeddingModelMissingError(err) {
  const msg = String(err?.message || "");
  const detailMsg = String(err?.detail?.error?.message || "");
  const detailCode = err?.detail?.error?.code;
  return (
    msg.includes("model ID cannot be empty") ||
    detailMsg.includes("model ID cannot be empty") ||
    String(detailCode) === "1007"
  );
}

function isWeKnoraInvalidApiKeyError(err) {
  const status = err?.status;
  if (status !== 401) return false;
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("invalid api key");
}

async function requestWeKnoraJsonWithKeyRepair(pg, options) {
  try {
    return await requestWeKnoraJson(options);
  } catch (err) {
    if (!isWeKnoraInvalidApiKeyError(err)) throw err;

    const workspaceId = options?.res?.locals?.workspaceId;
    const tenantId = options?.res?.locals?.weknoraTenantId;
    if (!workspaceId) throw err;

    const repairedKey = await syncWorkspaceWeKnoraApiKeyFromWeKnora({
      client: pg,
      workspaceId,
      tenantId,
    });
    if (options?.res?.locals) {
      options.res.locals.weknoraApiKey = repairedKey;
    }

    return await requestWeKnoraJson(options);
  }
}

function normalizeHybridSearchBody(input) {
  const body = input && typeof input === "object" ? input : {};
  const query_text = typeof body.query_text === "string" ? body.query_text.trim() : "";
  if (!query_text) {
    throw new HttpError({
      status: 400,
      code: "missing_query_text",
      message: "query_text is required",
    });
  }

  const match_count = clampInt(body.match_count, { min: 1, max: 200, fallback: 5 });

  const out = {
    query_text,
    match_count,
  };

  // Pass-through optional knobs if provided
  if (typeof body.vector_threshold === "number") out.vector_threshold = body.vector_threshold;
  if (typeof body.keyword_threshold === "number") out.keyword_threshold = body.keyword_threshold;
  if (typeof body.disable_keywords_match === "boolean") out.disable_keywords_match = body.disable_keywords_match;
  if (typeof body.disable_vector_match === "boolean") out.disable_vector_match = body.disable_vector_match;
  if (Array.isArray(body.knowledge_ids)) out.knowledge_ids = body.knowledge_ids;
  if (Array.isArray(body.tag_ids)) out.tag_ids = body.tag_ids;
  if (typeof body.only_recommended === "boolean") out.only_recommended = body.only_recommended;

  return out;
}

export default function createKnowledgeRouter(pg) {
  const router = express.Router();

  router.use(requireKnowledgeAuth(pg));
  // Prefer workspace-scoped key, but allow proxy-level global fallback when explicitly enabled.
  router.use(attachWorkspaceWeKnoraCredentials(pg, { required: false }));

  router.get(
    "/bases",
    wrapAsync(async (req, res) => {
      const data = await requestWeKnoraJsonWithKeyRepair(pg, {
        method: "GET",
        path: "/knowledge-bases",
        query: req.query,
        res,
      });
      res.json(withTraceId(res, { ok: true, data }));
    })
  );

  router.post(
    "/bases",
    wrapAsync(async (req, res) => {
      const data = await requestWeKnoraJsonWithKeyRepair(pg, {
        method: "POST",
        path: "/knowledge-bases",
        body: req.body,
        res,
      });

      const ctx = getAuditContext(req, res);
      await writeAuditLog(
        {
          actorUserId: ctx.actorUserId,
          actorRole: "user",
          action: "knowledge.base.create",
          targetType: "knowledge_base",
          targetId: data?.id != null ? String(data.id) : null,
          ip: ctx.ip,
          traceId: ctx.traceId,
          metadata: {
            workspace_id: ctx.workspaceId,
            knowledge_base_id: data?.id != null ? String(data.id) : null,
            name: data?.name ?? req.body?.name ?? null,
          },
        },
        pg
      );

      res.status(201).json(withTraceId(res, { ok: true, data }));
    })
  );

  router.get(
    "/bases/:id",
    wrapAsync(async (req, res) => {
      const data = await requestWeKnoraJsonWithKeyRepair(pg, {
        method: "GET",
        path: `/knowledge-bases/${req.params.id}`,
        res,
      });
      res.json(withTraceId(res, { ok: true, data }));
    })
  );

  router.put(
    "/bases/:id",
    wrapAsync(async (req, res) => {
      const data = await requestWeKnoraJsonWithKeyRepair(pg, {
        method: "PUT",
        path: `/knowledge-bases/${req.params.id}`,
        body: req.body,
        res,
      });

      const ctx = getAuditContext(req, res);
      await writeAuditLog(
        {
          actorUserId: ctx.actorUserId,
          actorRole: "user",
          action: "knowledge.base.update",
          targetType: "knowledge_base",
          targetId: String(req.params.id),
          ip: ctx.ip,
          traceId: ctx.traceId,
          metadata: {
            workspace_id: ctx.workspaceId,
            knowledge_base_id: String(req.params.id),
            name: data?.name ?? req.body?.name ?? null,
          },
        },
        pg
      );

      res.json(withTraceId(res, { ok: true, data }));
    })
  );

  router.delete(
    "/bases/:id",
    wrapAsync(async (req, res) => {
      await requestWeKnoraJsonWithKeyRepair(pg, {
        method: "DELETE",
        path: `/knowledge-bases/${req.params.id}`,
        res,
      });

      const ctx = getAuditContext(req, res);
      await writeAuditLog(
        {
          actorUserId: ctx.actorUserId,
          actorRole: "user",
          action: "knowledge.base.delete",
          targetType: "knowledge_base",
          targetId: String(req.params.id),
          ip: ctx.ip,
          traceId: ctx.traceId,
          metadata: {
            workspace_id: ctx.workspaceId,
            knowledge_base_id: String(req.params.id),
          },
        },
        pg
      );

      res.json(withTraceId(res, { ok: true }));
    })
  );

  router.post(
    "/bases/:id/documents/file",
    upload.single("file"),
    wrapAsync(async (req, res) => {
      if (!req.file) {
        throw new HttpError({
          status: 400,
          code: "missing_file",
          message: "file is required",
        });
      }

      const form = new FormData();
      const blob = new Blob([req.file.buffer], {
        type: req.file.mimetype || "application/octet-stream",
      });
      const safeFilename = normalizeUploadedFilename(req.file.originalname);
      form.append("file", blob, safeFilename);

      const fields = req.body || {};
      Object.entries(fields).forEach(([key, value]) => {
        const text = asPlainText(value);
        if (text) {
          form.append(key, text);
        }
      });

      const data = await requestWeKnoraJson({
        method: "POST",
        path: `/knowledge-bases/${req.params.id}/knowledge/file`,
        body: form,
        res,
      });

      const ctx = getAuditContext(req, res);
      await writeAuditLog(
        {
          actorUserId: ctx.actorUserId,
          actorRole: "user",
          action: "knowledge.document.upload",
          targetType: "knowledge_document",
          targetId: data?.id != null ? String(data.id) : null,
          ip: ctx.ip,
          traceId: ctx.traceId,
          metadata: {
            workspace_id: ctx.workspaceId,
            knowledge_base_id: String(req.params.id),
            document_id: data?.id != null ? String(data.id) : null,
            file_name: data?.file_name ?? data?.title ?? req.file?.originalname ?? null,
          },
        },
        pg
      );

      res.status(201).json(withTraceId(res, { ok: true, data }));
    })
  );

  router.get(
    "/bases/:id/documents",
    wrapAsync(async (req, res) => {
      const data = await requestWeKnoraJson({
        method: "GET",
        path: `/knowledge-bases/${req.params.id}/knowledge`,
        query: req.query,
        res,
      });
      res.json(withTraceId(res, { ok: true, data }));
    })
  );

  router.get(
    "/documents/:docId",
    wrapAsync(async (req, res) => {
      const data = await requestWeKnoraJson({
        method: "GET",
        path: `/knowledge/${req.params.docId}`,
        res,
      });
      res.json(withTraceId(res, { ok: true, data }));
    })
  );

  // KB-RENAME: Update/rename a document
  router.put(
    "/documents/:docId",
    wrapAsync(async (req, res) => {
      const docId = req.params.docId;
      const body = req.body || {};
      
      // WeKnora API: PUT /knowledge/:id with body { title, ... }
      const data = await requestWeKnoraJson({
        method: "PUT",
        path: `/knowledge/${docId}`,
        body: {
          title: body.title,
          // Pass through other fields if needed
          ...(body.description !== undefined && { description: body.description }),
        },
        res,
      });

      const ctx = getAuditContext(req, res);
      await writeAuditLog(
        {
          actorUserId: ctx.actorUserId,
          actorRole: "user",
          action: "knowledge.document.update",
          targetType: "knowledge_document",
          targetId: String(docId),
          ip: ctx.ip,
          traceId: ctx.traceId,
          metadata: {
            workspace_id: ctx.workspaceId,
            document_id: String(docId),
            new_title: body.title || null,
          },
        },
        pg
      );

      res.json(withTraceId(res, { ok: true, data }));
    })
  );

  router.get(
    "/documents/:docId/chunks",
    wrapAsync(async (req, res) => {
      const page = Number.parseInt(String(req.query?.page ?? "1"), 10);
      const pageSizeRaw = Number.parseInt(String(req.query?.page_size ?? "25"), 10);
      const page_size = Number.isFinite(pageSizeRaw) ? Math.min(Math.max(pageSizeRaw, 1), 100) : 25;

      const raw = await requestWeKnoraRawJson({
        method: "GET",
        path: `/chunks/${req.params.docId}`,
        query: {
          ...req.query,
          page: Number.isFinite(page) ? page : 1,
          page_size,
        },
        res,
      });

      const chunks = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
      const total = typeof raw?.total === "number" ? raw.total : chunks.length;
      const meta = {
        total,
        page: typeof raw?.page === "number" ? raw.page : (Number.isFinite(page) ? page : 1),
        page_size: typeof raw?.page_size === "number" ? raw.page_size : page_size,
      };

      res.json(withTraceId(res, { ok: true, data: chunks, meta }));
    })
  );

  router.get(
    "/documents/:docId/download",
    wrapAsync(async (req, res) => {
      // Fetch metadata to help browsers render correctly (e.g. PDF inline preview).
      // WeKnora may return application/octet-stream for downloads; combined with nosniff this
      // triggers Chrome to download instead of preview.
      let knowledgeMeta = null;
      try {
        knowledgeMeta = await requestWeKnoraJson({
          method: "GET",
          path: `/knowledge/${req.params.docId}`,
          res,
        });
      } catch {
        knowledgeMeta = null;
      }

      const response = await requestWeKnoraStream({
        method: "GET",
        path: `/knowledge/${req.params.docId}/download`,
        query: req.query,
        res,
      });

      const ctx = getAuditContext(req, res);
      await writeAuditLog(
        {
          actorUserId: ctx.actorUserId,
          actorRole: "user",
          action: "knowledge.document.download",
          targetType: "knowledge_document",
          targetId: String(req.params.docId),
          ip: ctx.ip,
          traceId: ctx.traceId,
          metadata: {
            workspace_id: ctx.workspaceId,
            document_id: String(req.params.docId),
          },
        },
        pg
      );

      res.status(response.status);

      const contentType = response.headers.get("content-type");
      const metaFileType = typeof knowledgeMeta?.file_type === "string" ? knowledgeMeta.file_type.toLowerCase() : "";
      const metaFileName = typeof knowledgeMeta?.file_name === "string" ? knowledgeMeta.file_name : "";
      const wantsPdf = metaFileType.includes("pdf") || metaFileName.toLowerCase().endsWith(".pdf");

      if (wantsPdf) {
        // Force a PDF content type for inline preview.
        res.setHeader("content-type", "application/pdf");
      } else if (contentType) {
        res.setHeader("content-type", contentType);
      }
      const contentLength = response.headers.get("content-length");
      if (contentLength) {
        res.setHeader("content-length", contentLength);
      }
      const contentDisposition = response.headers.get("content-disposition");
      if (contentDisposition) {
        // Force inline so browser/PDF viewer can render inside iframe.
        // Preserve filename if the upstream response used attachment.
        res.setHeader("content-disposition", contentDisposition.replace(/^attachment\b/i, "inline"));
      } else {
        res.setHeader("content-disposition", "inline");
      }

      if (!response.body) {
        res.end();
        return;
      }

      Readable.fromWeb(response.body).pipe(res);
    })
  );

  router.get(
    "/documents/:docId/download-url",
    wrapAsync(async (req, res) => {
      const secret = getKnowledgeDownloadTokenSecret();
      if (!secret) {
        throw new HttpError({
          status: 500,
          code: "MISSING_DOWNLOAD_TOKEN_SECRET",
          message: "download token secret is not configured",
        });
      }

      // Validate the document exists under the current workspace's WeKnora credentials.
      // Otherwise we'd mint a token that can only lead to a failing download.
      await requestWeKnoraJson({
        method: "GET",
        path: `/knowledge/${req.params.docId}`,
        res,
      });

      const exp = Math.floor(Date.now() / 1000) + 5 * 60;
      const token = signPayload(
        {
          v: 1,
          scope: "knowledge_document_download",
          user_id: res.locals.authUserId,
          workspace_id: res.locals.workspaceId,
          doc_id: String(req.params.docId),
          exp,
        },
        secret
      );

      const url = `/api/knowledge/documents/${encodeURIComponent(req.params.docId)}/download?token=${encodeURIComponent(token)}`;
      res.json(withTraceId(res, { ok: true, data: { url, exp } }));
    })
  );

  router.post(
    "/bases/:id/search",
    wrapAsync(async (req, res) => {
      const baseBody = normalizeHybridSearchBody(req.body);

      let data;
      try {
        data = await requestWeKnoraJson({
          method: "GET",
          path: `/knowledge-bases/${req.params.id}/hybrid-search`,
          body: baseBody,
          res,
        });
      } catch (err) {
        // If the KB has no embedding model configured, degrade to keyword-only search.
        if (!baseBody.disable_vector_match && isEmbeddingModelMissingError(err)) {
          data = await requestWeKnoraJson({
            method: "GET",
            path: `/knowledge-bases/${req.params.id}/hybrid-search`,
            body: { ...baseBody, disable_vector_match: true },
            res,
          });
        } else {
          throw err;
        }
      }

      const ctx = getAuditContext(req, res);
      await writeAuditLog(
        {
          actorUserId: ctx.actorUserId,
          actorRole: "user",
          action: "knowledge.base.search",
          targetType: "knowledge_base",
          targetId: String(req.params.id),
          ip: ctx.ip,
          traceId: ctx.traceId,
          metadata: {
            workspace_id: ctx.workspaceId,
            knowledge_base_id: String(req.params.id),
            match_count: baseBody.match_count,
            query_text_length: typeof baseBody.query_text === "string" ? baseBody.query_text.length : null,
            used_vector: !baseBody.disable_vector_match,
            used_keywords: !baseBody.disable_keywords_match,
          },
        },
        pg
      );

      res.json(withTraceId(res, { ok: true, data }));
    })
  );

  router.delete(
    "/bases/:id/documents/:docId",
    wrapAsync(async (req, res) => {
      const kbId = req.params.id;
      const docId = req.params.docId;

      // WeKnora docs: DELETE /knowledge/:id
      // Some deployments historically exposed a nested delete under knowledge-bases.
      // Make deletion resilient & idempotent so a stuck "processing" doc can always be cleared.
      try {
        await requestWeKnoraJson({
          method: "DELETE",
          path: `/knowledge/${docId}`,
          res,
        });
      } catch (err) {
        const status = err?.status;
        if (status !== 404) {
          throw err;
        }

        try {
          await requestWeKnoraJson({
            method: "DELETE",
            path: `/knowledge-bases/${kbId}/knowledge/${docId}`,
            res,
          });
        } catch (fallbackErr) {
          // If still not found, treat as already deleted.
          if (fallbackErr?.status !== 404) {
            throw fallbackErr;
          }
        }
      }

      const ctx = getAuditContext(req, res);
      await writeAuditLog(
        {
          actorUserId: ctx.actorUserId,
          actorRole: "user",
          action: "knowledge.document.delete",
          targetType: "knowledge_document",
          targetId: String(docId),
          ip: ctx.ip,
          traceId: ctx.traceId,
          metadata: {
            workspace_id: ctx.workspaceId,
            knowledge_base_id: String(kbId),
            document_id: String(docId),
          },
        },
        pg
      );

      res.json(withTraceId(res, { ok: true }));
    })
  );

  router.get(
    "/bases/:id/activity",
    wrapAsync(async (req, res) => {
      const ctx = getAuditContext(req, res);
      const kbId = String(req.params.id);

      const { rows } = await pg.query(
        `SELECT id, created_at, action, actor_user_id, metadata
           FROM audit_logs
          WHERE metadata->>'workspace_id' = $1
            AND metadata->>'knowledge_base_id' = $2
            AND action IN (
              'knowledge.base.create',
              'knowledge.base.update',
              'knowledge.base.delete',
              'knowledge.base.search',
              'knowledge.document.upload',
              'knowledge.document.delete',
              'knowledge.document.download'
            )
          ORDER BY created_at DESC
          LIMIT 50`,
        [ctx.workspaceId ? String(ctx.workspaceId) : "", kbId]
      );

      const activities = rows
        .map((row) => {
          const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
          const file = meta.file_name || meta.object || null;
          const docId = meta.document_id || null;

          let action = row.action;
          let object = null;

          if (action === "knowledge.document.upload") {
            action = "upload";
            object = file || (docId ? `doc:${docId}` : "document");
          } else if (action === "knowledge.document.delete") {
            action = "delete";
            object = file || (docId ? `doc:${docId}` : "document");
          } else if (action === "knowledge.document.download") {
            action = "download";
            object = file || (docId ? `doc:${docId}` : "document");
          } else if (action === "knowledge.base.search") {
            action = "search";
            object = "knowledge_base";
          } else if (action === "knowledge.base.update") {
            action = "update";
            object = meta.name || "knowledge_base";
          } else if (action === "knowledge.base.create") {
            action = "create";
            object = meta.name || "knowledge_base";
          } else if (action === "knowledge.base.delete") {
            action = "delete";
            object = meta.name || "knowledge_base";
          }

          return {
            id: String(row.id),
            time: row.created_at,
            action,
            object,
            status: "success",
            actor_user_id: row.actor_user_id ? String(row.actor_user_id) : null,
          };
        })
        .filter((entry) => entry.action && entry.time);

      res.json(withTraceId(res, { ok: true, data: activities.slice(0, 20), knowledge_base_id: kbId }));
    })
  );

  router.post(
    "/sessions",
    wrapAsync(async (_req, _res) => {
      throw new HttpError({
        status: 410,
        code: "knowledge_sessions_deprecated",
        message: "Knowledge sessions are handled by oMyTree turn APIs; /api/knowledge/sessions is deprecated",
        hint: "Use POST /api/turn or POST /api/turn/stream for conversation",
      });
    })
  );

  router.post(
    "/sessions/:id/chat",
    wrapAsync(async (_req, _res) => {
      throw new HttpError({
        status: 410,
        code: "knowledge_chat_deprecated",
        message: "Knowledge chat streaming is handled by oMyTree turn APIs; /api/knowledge/sessions/:id/chat is deprecated",
        hint: "Use POST /api/turn/stream for streaming chat",
      });
    })
  );

  return router;
}
