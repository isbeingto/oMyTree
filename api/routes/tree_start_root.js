import express from "express";
import { pool } from "../db/pool.js";
import { getAuthUserIdForRequest } from "../lib/auth_user.js";
import { HttpError, wrapAsync } from "../lib/errors.js";
import { withTraceId } from "../lib/trace.js";
import { createTurn } from "../services/turn/create.js";
import { generateTreeTopic } from "../services/llm/index.js";
import { isLlmError, mapLlmError } from "../services/llm/errors.js";
import { recomputeTreeCounters } from "../services/tree/counters.js";
import { hasActiveUserProviders } from "../services/user_llm_providers.js";
import { registerStreamAbort, removeStream } from "../lib/stream_abort_registry.js";
import { assignDraftUploadsToTree } from "../services/uploads/upload_service.js";
import { resolveWorkspaceIdForUser } from "../services/workspaces/request_context.js";
import { resolveWorkspaceWeKnoraApiKey } from "../services/workspaces/weknora_credentials.js";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Async function to generate topic and update tree.
 * Called after responding to user, so it doesn't block the response.
 */
async function asyncGenerateAndUpdateTopic(treeId, userText) {
  try {
    console.log(`[tree.start-root] Starting async topic generation for tree ${treeId}`);
    const result = await generateTreeTopic({ user_text: userText });
    
    if (result.topic && result.provider !== 'fallback') {
      await pool.query(
        `UPDATE trees SET topic = $1 WHERE id = $2`,
        [result.topic, treeId]
      );
      console.log(`[tree.start-root] Updated tree ${treeId} topic to: "${result.topic}"`);
    }
  } catch (error) {
    console.error(`[tree.start-root] Failed to generate/update topic for tree ${treeId}:`, error);
    // Don't throw - this is async and shouldn't affect the main flow
  }
}

export default function createTreeStartRootRouter() {
  const router = express.Router();
  const allowedProfiles = new Set(["lite", "standard", "max"]);
  const allowedScopes = new Set(["branch", "tree"]);

  router.post(
    "/api/tree/start-root",
    wrapAsync(async (req, res) => {
      try {
        const userId = await getAuthUserIdForRequest(req, pool);
        const userText = normalizeText(req.body?.user_text);
        const routeMode = normalizeText(req.body?.route_mode) || "auto";
        const routeToken = normalizeText(req.body?.route_token) || null;
        const providerOverride =
          normalizeText(req.body?.provider) ||
          (typeof req.query?.provider === "string" ? normalizeText(req.query.provider) : null);
        const providerModeOverride =
          normalizeText(req.body?.provider_mode) ||
          (typeof req.query?.provider_mode === "string" ? normalizeText(req.query.provider_mode) : null);
        const modelOverride =
          normalizeText(req.body?.model) ||
          (typeof req.query?.model === "string" ? normalizeText(req.query.model) : null);
        const contextProfileRaw = normalizeText(req.body?.context_profile);
        const memoryScopeRaw = normalizeText(req.body?.memory_scope) || "branch";
        const uploadIds = Array.isArray(req.body?.upload_ids) ? req.body.upload_ids : [];
        const knowledgeBaseIds = Array.isArray(req.body?.knowledge_base_ids) ? req.body.knowledge_base_ids : [];
        const knowledge = req.body?.knowledge ?? null;

        if (!userText) {
          throw new HttpError({
            status: 422,
            code: "INVALID_USER_TEXT",
            message: "user_text is required",
          });
        }

        const userConfig = await pool.query(
          'SELECT enable_advanced_context FROM users WHERE id = $1',
          [userId]
        );
        const advancedEnabled = Boolean(userConfig.rows[0]?.enable_advanced_context);
        if (advancedEnabled && !contextProfileRaw) {
          throw new HttpError({
            status: 422,
            code: "CONTEXT_PROFILE_REQUIRED",
            message: "高级模式下必须选择档位",
          });
        }
        const contextProfile = advancedEnabled ? contextProfileRaw : "lite";
        const memoryScope = advancedEnabled ? memoryScopeRaw : "branch";
        if (contextProfile && !allowedProfiles.has(contextProfile)) {
          throw new HttpError({
            status: 422,
            code: "INVALID_CONTEXT_PROFILE",
            message: "档位仅支持 lite/standard/max",
          });
        }
        if (memoryScope && !allowedScopes.has(memoryScope)) {
          throw new HttpError({
            status: 422,
            code: "INVALID_MEMORY_SCOPE",
            message: "记忆范围仅支持 branch/tree",
          });
        }
        if (advancedEnabled) {
          const hasActive = await hasActiveUserProviders(userId);
          if (!hasActive) {
            throw new HttpError({
              status: 400,
              code: "ADVANCED_REQUIRES_BYOK",
              message: "需先添加并启用至少一个自带模型 API Key 才能开启高级模式",
            });
          }
        }
        // T48-1: Max profile requires BYOK provider
        if (contextProfile === "max") {
          const isUsingDefault = !providerOverride || providerOverride === "omytree-default";
          if (isUsingDefault) {
            throw new HttpError({
              status: 422,
              code: "MAX_PROFILE_REQUIRES_BYOK",
              message: "Max 档位仅支持自带模型 (BYOK)，请选择您已配置的模型提供商",
              hint: "请在设置中配置 API Key，或在新建树时选择 BYOK 模型",
            });
          }
        }

        // Use truncated user text as temporary topic (will be replaced async)
        const tempTopic = userText.length > 50
          ? `${userText.slice(0, 50)}...`
          : userText;

        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          const { rows: treeRows } = await client.query(
            `INSERT INTO trees(topic, created_by, status, user_id, context_profile, memory_scope)
             VALUES ($1, $2, 'active', $3, $4, $5)
             RETURNING id, topic, created_by, status, created_at, user_id, context_profile, memory_scope`,
            [tempTopic, "user", userId, contextProfile || "lite", memoryScope || "branch"],
          );
          const tree = treeRows[0];

          const { rows: rootRows } = await client.query(
            `INSERT INTO nodes(tree_id, parent_id, level, role, text)
             VALUES ($1, NULL, 0, 'user', $2)
             RETURNING id, tree_id, parent_id, level, role, text, created_at`,
            [tree.id, userText],
          );
          const rootNode = rootRows[0];

          await client.query(
            `INSERT INTO events(event_type, tree_id, payload)
             VALUES ('tree.created', $1, jsonb_build_object('topic', $2::text, 'created_by', $3::text))`,
            [tree.id, tempTopic, "user"],
          );
          await client.query(
            `INSERT INTO events(event_type, tree_id, node_id, payload)
             VALUES ('node.created', $1, $2, jsonb_build_object('role', 'user'::text, 'level', 0::integer))`,
            [tree.id, rootNode.id],
          );

          await recomputeTreeCounters(client, tree.id);
          await client.query("COMMIT");

          // T90: If user uploaded files before the tree existed (draft uploads), bind them now.
          // This makes subsequent access control + tree quotas consistent.
          if (uploadIds.length > 0) {
            await assignDraftUploadsToTree({ userId, treeId: tree.id, uploadIds, client });
          }

        let weknoraApiKey = null;
        const wantsKnowledge =
          (knowledge && typeof knowledge === "object" && (knowledge.baseId || knowledge.base_id)) ||
          (Array.isArray(knowledgeBaseIds) && knowledgeBaseIds.length > 0);
        if (wantsKnowledge) {
          const workspaceId = await resolveWorkspaceIdForUser({ db: pool, req, userId });
          weknoraApiKey = await resolveWorkspaceWeKnoraApiKey({ client: pool, workspaceId });
        }

        const turnResult = await createTurn({
          tree_id: tree.id,
            existing_user_node_id: rootNode.id,
            user_text: userText,
            with_ai: true,
            who: "user",
            trace_id: res.locals?.traceId,
            route_mode: routeMode || "auto",
            route_token: routeToken,
            provider: providerOverride,
            provider_mode: providerModeOverride,
            model: modelOverride,
            user_id: userId,
            upload_ids: uploadIds,
            knowledge,
            knowledge_base_ids: knowledgeBaseIds,
            weknora_api_key: weknoraApiKey,
          });

          const payload = withTraceId(res, {
            ok: true,
            tree,
            root_node: rootNode,
            ai_node: turnResult.ai_node,
            user_node: turnResult.user_node,
            turn: turnResult.turn,
            citations: turnResult.citations,
            nodes: [rootNode, turnResult.user_node, turnResult.ai_node].filter(Boolean),
          });

          res.status(201).json(payload);
          
          // Async topic generation - fire and forget
          asyncGenerateAndUpdateTopic(tree.id, userText);
        } catch (error) {
          await client.query("ROLLBACK");
          console.error("[tree.start-root] error", error);
          throw error;
        } finally {
          client.release();
        }
      } catch (outerErr) {
        console.error("[tree.start-root] outer error", outerErr);
        throw outerErr;
      }
    }),
  );

  router.post(
    "/api/tree/start-root/stream",
    wrapAsync(async (req, res) => {
      // SSE streaming endpoint
      const traceId = res.locals?.traceId;
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();
      res.write(": connected\n\n");

      const heartbeat = setInterval(() => {
        if (res.writableEnded) return;
        try {
          res.write(": ping\n\n");
        } catch (err) {
          console.warn("[tree.start-root/stream] heartbeat failed:", err?.message || err);
        }
      }, 15000);

    const abortController = new AbortController();
    let streamStarted = false;
    let streamCompleted = false;
    let activeTurnId = null;
      
      req.on("close", () => {
        clearInterval(heartbeat);
        if (streamCompleted || abortController.signal.aborted) {
          return;
        }

        // 流已开始：客户端断开应立即中止后端 LLM 流
        if (streamStarted) {
          console.log("[tree.start-root/stream] req.close during active stream (abort now)");
          abortController.abort(new Error('client disconnected'));
          return;
        }

        // 流未开始：保留延迟中止，避免极少数误触发
        setTimeout(() => {
          if (!streamStarted && !streamCompleted && !abortController.signal.aborted) {
            console.log("[tree.start-root/stream] req.close event fired before stream started (delayed abort)");
            abortController.abort(new Error('client disconnected'));
          }
        }, 500);
      });
      
      // 标记流已开始（在发送 start 事件后）
      const markStreamStarted = () => { streamStarted = true; };
      const markStreamCompleted = () => { streamCompleted = true; };

      const send = (payload) => {
        if (res.writableEnded) return;
        try {
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
        } catch (err) {
          console.warn("[tree.start-root/stream] send failed:", err?.message || err);
        }
      };

      try {
        const userId = await getAuthUserIdForRequest(req, pool);
        const userText = normalizeText(req.body?.user_text);
        const routeMode = normalizeText(req.body?.route_mode) || "auto";
        const routeToken = normalizeText(req.body?.route_token) || null;
        const providerOverride =
          normalizeText(req.body?.provider) ||
          (typeof req.query?.provider === "string" ? normalizeText(req.query.provider) : null);
        const providerModeOverride =
          normalizeText(req.body?.provider_mode) ||
          (typeof req.query?.provider_mode === "string" ? normalizeText(req.query.provider_mode) : null);
        const modelOverride =
          normalizeText(req.body?.model) ||
          (typeof req.query?.model === "string" ? normalizeText(req.query.model) : null);
        const contextProfileRaw = normalizeText(req.body?.context_profile);
        const memoryScopeRaw = normalizeText(req.body?.memory_scope) || "branch";
        // T85: Extract upload_ids from request body
        const uploadIds = Array.isArray(req.body?.upload_ids) ? req.body.upload_ids : [];
        const knowledgeBaseIds = Array.isArray(req.body?.knowledge_base_ids) ? req.body.knowledge_base_ids : [];
        const knowledge = req.body?.knowledge ?? null;

        if (!userText) {
          throw new HttpError({
            status: 422,
            code: "INVALID_USER_TEXT",
            message: "user_text is required",
          });
        }

        const userConfig = await pool.query(
          'SELECT enable_advanced_context FROM users WHERE id = $1',
          [userId]
        );
        const advancedEnabled = Boolean(userConfig.rows[0]?.enable_advanced_context);
        if (advancedEnabled && !contextProfileRaw) {
          throw new HttpError({
            status: 422,
            code: "CONTEXT_PROFILE_REQUIRED",
            message: "高级模式下必须选择档位",
          });
        }
        const contextProfile = advancedEnabled ? contextProfileRaw : "lite";
        const memoryScope = advancedEnabled ? memoryScopeRaw : "branch";
        if (contextProfile && !allowedProfiles.has(contextProfile)) {
          throw new HttpError({
            status: 422,
            code: "INVALID_CONTEXT_PROFILE",
            message: "档位仅支持 lite/standard/max",
          });
        }
        if (memoryScope && !allowedScopes.has(memoryScope)) {
          throw new HttpError({
            status: 422,
            code: "INVALID_MEMORY_SCOPE",
            message: "记忆范围仅支持 branch/tree",
          });
        }
        if (advancedEnabled) {
          const hasActive = await hasActiveUserProviders(userId);
          if (!hasActive) {
            throw new HttpError({
              status: 400,
              code: "ADVANCED_REQUIRES_BYOK",
              message: "需先添加并启用至少一个自带模型 API Key 才能开启高级模式",
            });
          }
        }
        // T48-1: Max profile requires BYOK provider
        if (contextProfile === "max") {
          const isUsingDefault = !providerOverride || providerOverride === "omytree-default";
          if (isUsingDefault) {
            throw new HttpError({
              status: 422,
              code: "MAX_PROFILE_REQUIRES_BYOK",
              message: "Max 档位仅支持自带模型 (BYOK)，请选择您已配置的模型提供商",
              hint: "请在设置中配置 API Key，或在新建树时选择 BYOK 模型",
            });
          }
        }

        const tempTopic = userText.length > 50
          ? `${userText.slice(0, 50)}...`
          : userText;

        const client = await pool.connect();
        let tree = null;
        let rootNode = null;
        try {
          await client.query("BEGIN");

          const { rows: treeRows } = await client.query(
            `INSERT INTO trees(topic, created_by, status, user_id, context_profile, memory_scope)
             VALUES ($1, $2, 'active', $3, $4, $5)
             RETURNING id, topic, created_by, status, created_at, user_id, context_profile, memory_scope`,
            [tempTopic, "user", userId, contextProfile || "lite", memoryScope || "branch"],
          );
          tree = treeRows[0];

          const { rows: rootRows } = await client.query(
            `INSERT INTO nodes(tree_id, parent_id, level, role, text)
             VALUES ($1, NULL, 0, 'user', $2)
             RETURNING id, tree_id, parent_id, level, role, text, created_at`,
            [tree.id, userText],
          );
          rootNode = rootRows[0];

          await client.query(
            `INSERT INTO events(event_type, tree_id, payload)
             VALUES ('tree.created', $1, jsonb_build_object('topic', $2::text, 'created_by', $3::text))`,
            [tree.id, tempTopic, "user"],
          );
          await client.query(
            `INSERT INTO events(event_type, tree_id, node_id, payload)
             VALUES ('node.created', $1, $2, jsonb_build_object('role', 'user'::text, 'level', 0::integer))`,
            [tree.id, rootNode.id],
          );

          await recomputeTreeCounters(client, tree.id);
          await client.query("COMMIT");
          send({ type: "start", trace_id: traceId, tree, root_node: rootNode });
          markStreamStarted(); // 标记流已开始
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }

        // T90: Bind any draft uploads to this brand-new tree before attaching them to the turn.
        if (uploadIds.length > 0) {
          await assignDraftUploadsToTree({ userId, treeId: tree.id, uploadIds });
        }

          const enableGrounding = req.body?.enable_grounding === true || req.body?.enableGrounding === true;

          let weknoraApiKey = null;
          const wantsKnowledge =
            (knowledge && typeof knowledge === "object" && (knowledge.baseId || knowledge.base_id)) ||
            (Array.isArray(knowledgeBaseIds) && knowledgeBaseIds.length > 0);
          if (wantsKnowledge) {
            const workspaceId = await resolveWorkspaceIdForUser({ db: pool, req, userId });
            weknoraApiKey = await resolveWorkspaceWeKnoraApiKey({ client: pool, workspaceId });
          }

          const turnResult = await createTurn({
            tree_id: tree.id,
            existing_user_node_id: rootNode.id,
            user_text: userText,
            with_ai: true,
            who: "user",
            trace_id: res.locals?.traceId,
            route_mode: routeMode || "auto",
            route_token: routeToken,
            provider: providerOverride,
            provider_mode: providerModeOverride,
            model: modelOverride,
            enable_grounding: enableGrounding,
            user_id: userId,
            upload_ids: uploadIds,
            knowledge,
            knowledge_base_ids: knowledgeBaseIds,
            weknora_api_key: weknoraApiKey,
        }, {
          enableStreaming: true,
          signal: abortController.signal,
          onStart: (meta) => {
            if (meta?.turn_id) {
              activeTurnId = meta.turn_id;
              registerStreamAbort(activeTurnId, abortController);
            }
            send({ type: "turn", trace_id: traceId, ...meta });
          },
          onReasoningDelta: (text) => send({ type: "reasoning", text }),
          onDelta: (text) => send({ type: "delta", text }),
        });

        send({
          type: "done",
          trace_id: traceId,
          tree,
          root_node: rootNode,
          user_node: turnResult.user_node,
          ai_node: turnResult.ai_node,
          turn: turnResult.turn,
          citations: turnResult.citations,
          usage: turnResult.turn?.usage_json ?? null,
        });
        markStreamCompleted(); // 标记流已完成
        if (!res.writableEnded) {
          res.end();
        }

        // Async topic generation - fire and forget
        asyncGenerateAndUpdateTopic(tree.id, userText);
      } catch (error) {
        const normalized = isLlmError(error)
          ? error
          : mapLlmError(error, { provider: error?.provider });
        send({
          type: "error",
          error: {
            code: normalized.code || "INTERNAL_ERROR",
            provider: normalized.provider,
            message: normalized.message,
          },
          trace_id: traceId,
        });
        markStreamCompleted();
        if (!res.writableEnded) {
          res.end();
        }
      } finally {
        if (activeTurnId) {
          removeStream(activeTurnId);
        }
        clearInterval(heartbeat);
      }
    }),
  );

  return router;
}
