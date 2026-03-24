import express from "express";
import cors from "cors";
import Redis from "ioredis";
import createBranchRouter from "./routes/branch.js";
import createEventsRouter from "./routes/events.js";
import createEventsStreamRouter from "./routes/events_stream.js";
import createTreeRouter from "./routes/tree.js";
import treeCreateRouter from "./routes/tree.create.js";
import treeForkRouter from "./routes/tree.fork.js";
import createTreesListRouter from "./routes/trees_list.js";
import createTreeDeleteRouter from "./routes/tree_delete.js";
import createTreeRenameRouter from "./routes/tree_rename.js";
import createTreeConfigRouter from "./routes/tree_config.js";
import createTreeExportRouter from "./routes/tree_export.js";
import createTreeImportRouter from "./routes/tree_import.js";
import createTreeGrowRouter from "./routes/tree_grow.js";
import createTreeStartRootRouter from "./routes/tree_start_root.js";
import createTreeExportJsonRouter from "./routes/tree_export_json.js";
import createTreeExportMarkdownRouter from "./routes/tree_export_markdown.js";
import createTreeShareRouter from "./routes/tree_share.js";
import createShareViewRouter from "./routes/share_view.js";
import createTreeMetricsV1Router from "./routes/tree_metrics.js";
import createUserSharesRouter from "./routes/user_shares.js";
import createHistoryRouter from "./routes/history.js";
import createMetricsRouter from "./routes/metrics.js";
import createExtRouter from "./routes/ext.js";
import createMetricsExtRouter from "./routes/metrics_ext.js";
import createBusRouter from "./routes/bus.js";
import createMetricsBusRouter from "./routes/metrics_bus.js";
import createTreeMetricsRouter from "./routes/metrics_tree.js";
import createUnifiedMetricsRouter from "./routes/metrics_unified.js";
import createHealthRouter from "./routes/health.js";
import createTreeIntegrationRouter from "./routes/integration_tree.js";
import createLensRouter from "./routes/lens.js";
import createTreeQaRouter from "./routes/tree_qa.js";
import adminDebugRouter from "./routes/admin_debug.js";
import adminLedgerDebugRouter from "./routes/admin_ledger_debug.js";
import createAdminUsersRouter from "./routes/admin_users.js";
import adminLlmRouter from "./routes/admin_llm.js";
import adminStatsRouter from "./routes/admin_stats.js";
import adminSettingsRouter from "./routes/admin_settings.js";
import adminLandingMediaRouter from "./routes/admin_landing_media.js";
import adminAuditLogsRouter from "./routes/admin_audit_logs.js";
import siteMetaRouter from "./routes/site_meta.js";
import createEmailVerificationRouter from "./routes/auth_email.js";
import createPasswordResetRouter from "./routes/auth_password.js";
import createSetPasswordRouter from "./routes/auth_set_password.js";
import createUserApiKeysRouter from "./routes/account_api_keys.js";
import createLlmSettingsRouter from "./routes/account_llm_settings.js";
import createAccountQuotaStatusRouter from "./routes/account_quota_status.js";
import createEnabledModelsRouter from "./routes/account_enabled_models.js";
import createSnapshotsRouter from "./routes/snapshots.js";
import createMemoGenerateRouter from "./routes/memo_generate.js";
import createMemoExportRouter from "./routes/memo_export.js";
import createUserProvidersRouter from "./routes/account_user_providers.js";
import createAccountBillingRouter from "./routes/account_billing.js";
import createMeUsageRouter from "./routes/me_usage.js";
import securityHeaders from "./middleware/security.js";
import constitutionGuard from "./middleware/constitution_guard.js";
import createRateQuotaGuard from "./middleware/rate_quota_guard.js";
import adminPlatformProvidersRouter from "./routes/admin_platform_providers.js";
import createAdminContextInspectorRouter from "./routes/admin_context_inspector.js";
import adminContextDebugRouter from "./routes/admin_context_debug.js";
import createTrajectoryRouter from "./routes/trajectory.js";
import nodeRouter from "./routes/node.js";
import createNodePruneRouter from "./routes/node_prune.js";
import createNodeDeleteRouter from "./routes/node_delete.js";
import createNodeDeleteFromRouter from "./routes/node_delete_from.js";
import createNodeEditQuestionRouter from "./routes/node_edit_question.js";
import createNodeEditQuestionStreamRouter from "./routes/node_edit_question_stream.js";
import createKeyframesRouter from "./routes/keyframes.js";
import createNarrativeRouter from "./routes/narrative.js";
import createTrailRouter from "./routes/trail.js";
import createPathSnapshotsRouter from "./routes/path_snapshots.js";
import createBranchDiffRouter from "./routes/branch_diff.js";
import createTreeOutcomesRouter from "./routes/tree_outcomes.js";
import createOutcomesRouter from "./routes/outcomes.js";
import createEvidenceRouter from "./routes/evidence.js";
import createProcessRouter from "./routes/process.js";
import createUploadRouter from "./routes/upload.js";
import turnRouter from "./routes/turn.js"
import createTurnStreamRouter from "./routes/turn_stream.js";
import turnAbortRouter from "./routes/turn_abort.js";
import createLlmRouter from "./routes/llm.js";
import createKnowledgeRouter from "./routes/knowledge/index.js";
import createWorkspacesRouter from "./routes/workspaces.js";
import createOllamaBridgeRouter from "./routes/ollama_bridge.js";
import createMobileAuthRouter from "./routes/mobile_auth.js";
import { respondWithError } from "./lib/errors.js";
import { traceMiddleware } from "./lib/trace.js";
import bus from "./bus/event_bus.js";
import initTreeBridge from "./bridge/tree_bridge.js";
import {
  initTreeService,
  getTreeAdapter,
} from "./services/tree/index.js";
import { pool } from "./db/pool.js";

const app = express();
app.use(cors());
app.use(traceMiddleware);
app.use(
  express.json({
    limit: "1mb",
    verify: (req, _res, buf) => {
      const url = typeof req.originalUrl === "string" ? req.originalUrl : "";
      // Preserve raw body for payment webhook signature verification
      if (url.startsWith("/api/billing/webhook")) {
        req.rawBody = buf.toString("utf8");
      }
    },
  })
);
app.use(securityHeaders);

const PORT = process.env.PORT || 8000;

function envEnabled(name, defaultEnabled = true) {
  const raw = process.env[name];
  if (typeof raw !== "string" || raw.trim() === "") {
    return defaultEnabled;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized !== "0" && normalized !== "false" && normalized !== "no";
}

const legacyBranchApiEnabled = envEnabled("ENABLE_LEGACY_BRANCH_API", true);
const legacyEventReplayApiEnabled = envEnabled("ENABLE_LEGACY_EVENT_REPLAY_API", true);

// T-FIX: Use connection pool instead of single client to prevent
// idle-in-transaction timeout crashes. Pool auto-recovers connections.
const pgClient = pool;

const redis = new Redis();
const rateQuotaGuard = createRateQuotaGuard({ redis, pg: pgClient });

app.use(constitutionGuard);
app.use(rateQuotaGuard);

await initTreeService({ logger: console });
const treeAdapter = getTreeAdapter();

const branchRouter = createBranchRouter(pgClient);
const eventsRouter = createEventsRouter(pgClient);
const eventsStreamRouter = createEventsStreamRouter();
const treeRouter = createTreeRouter(pgClient, { treeAdapter });
const treesListRouter = createTreesListRouter(pgClient);
const treeDeleteRouter = createTreeDeleteRouter(pgClient);
const treeRenameRouter = createTreeRenameRouter(pgClient);
const treeConfigRouter = createTreeConfigRouter(pgClient);
const treeExportRouter = createTreeExportRouter();
const treeExportJsonRouter = createTreeExportJsonRouter(pgClient);
const treeExportMarkdownRouter = createTreeExportMarkdownRouter(pgClient);
const treeShareRouter = createTreeShareRouter(pgClient);
const shareViewRouter = createShareViewRouter();
const treeMetricsV1Router = createTreeMetricsV1Router(pgClient);
const treeQaRouter = createTreeQaRouter(pgClient);
const userSharesRouter = createUserSharesRouter(pgClient);
const treeImportRouter = createTreeImportRouter();
const treeGrowRouter = createTreeGrowRouter({ treeAdapter });
const treeStartRootRouter = createTreeStartRootRouter();
const historyRouter = createHistoryRouter();
const trajectoryRouter = createTrajectoryRouter(pgClient);
const turnStreamRouter = createTurnStreamRouter();
const llmRouter = createLlmRouter();
const accountQuotaStatusRouter = createAccountQuotaStatusRouter({ redis });
const accountBillingRouter = createAccountBillingRouter();
const metricsRouter = createMetricsRouter(pgClient);
const outcomesRouter = createOutcomesRouter();
const extRouter = createExtRouter();
const metricsExtRouter = createMetricsExtRouter();
const busRouter = createBusRouter();
const metricsBusRouter = createMetricsBusRouter();
const treeBridge = initTreeBridge({ bus });
const treeMetricsRouter = createTreeMetricsRouter(treeBridge);
const treeIntegrationRouter = createTreeIntegrationRouter(treeBridge);
const metricsUnifiedRouter = createUnifiedMetricsRouter({ treeBridge, treeAdapter });
const healthRouter = createHealthRouter({ pgClient, redis, treeAdapter });
const adminContextInspectorRouter = createAdminContextInspectorRouter(pgClient);
const snapshotsRouter = createSnapshotsRouter();
const memoGenerateRouter = createMemoGenerateRouter();
const memoExportRouter = createMemoExportRouter(pgClient);
const lensRouter = createLensRouter();
const nodePruneRouter = createNodePruneRouter(pgClient);
const nodeDeleteRouter = createNodeDeleteRouter(pgClient);
const nodeDeleteFromRouter = createNodeDeleteFromRouter(pgClient);
const nodeEditQuestionRouter = createNodeEditQuestionRouter(pgClient);
const nodeEditQuestionStreamRouter = createNodeEditQuestionStreamRouter(pgClient);
const keyframesRouter = createKeyframesRouter(pgClient);
const narrativeRouter = createNarrativeRouter(pgClient);
const trailRouter = createTrailRouter(pgClient);
const pathSnapshotsRouter = createPathSnapshotsRouter(pgClient);
const branchDiffRouter = createBranchDiffRouter(pgClient);
const treeOutcomesRouter = createTreeOutcomesRouter(pgClient);
const evidenceRouter = createEvidenceRouter(pgClient);
const processRouter = createProcessRouter(pgClient);
const uploadRouter = createUploadRouter(pgClient);
const knowledgeRouter = createKnowledgeRouter(pgClient);
const workspacesRouter = createWorkspacesRouter(pgClient);
if (legacyBranchApiEnabled) {
  app.use("/api/branch", branchRouter);
} else {
  console.warn("[api] Legacy branch API disabled (ENABLE_LEGACY_BRANCH_API=false)");
}
app.use("/api/process", processRouter);
app.use("/api/events", eventsRouter);
if (!legacyEventReplayApiEnabled) {
  console.warn("[api] Legacy events replay disabled (ENABLE_LEGACY_EVENT_REPLAY_API=false)");
}
app.use("/api/events", eventsStreamRouter);
app.use("/api/trees", treesListRouter);
app.use(treeCreateRouter);
app.use(treeForkRouter);
app.use("/api/tree", treeExportRouter);
app.use("/api/tree", treeExportJsonRouter);
app.use("/api/tree", treeExportMarkdownRouter);
app.use("/api/tree", treeShareRouter);
app.use("/api/tree", treeMetricsV1Router);
app.use("/api/tree", treeQaRouter);
app.use("/api/share", shareViewRouter);
app.use("/api/user", userSharesRouter);
app.use("/api/tree", treeDeleteRouter);
app.use("/api/tree", treeRenameRouter);
app.use("/api/tree", treeConfigRouter);
app.use("/api/tree", treeImportRouter);
app.use("/api/tree", treeGrowRouter);
app.use(treeStartRootRouter);
app.use("/api/tree", treeRouter);
app.use("/api/node", lensRouter);
app.use("/api/node", nodePruneRouter);
app.use("/api/node", nodeDeleteRouter);
app.use("/api/node", nodeDeleteFromRouter);
app.use("/api/node", nodeEditQuestionRouter);
app.use("/api/node", nodeEditQuestionStreamRouter);
app.use("/api/node", nodeRouter);
app.use("/api/tree", keyframesRouter);
app.use("/api/tree", narrativeRouter);
app.use("/api/tree", trailRouter);  // P0-2: Versioned Trail API
app.use("/api/tree", pathSnapshotsRouter);  // P1-1: PathSnapshot API
app.use("/api/tree", branchDiffRouter);  // P1-2: BranchDiff API
app.use("/api/tree", treeOutcomesRouter);  // T93-4: Outcomes v2 API
app.use("/api/knowledge", knowledgeRouter);
app.use(workspacesRouter);
app.use(evidenceRouter);
app.use(uploadRouter); // T85: Text Upload v0
app.use(llmRouter);
app.use(accountQuotaStatusRouter);
app.use(accountBillingRouter);
app.use(turnStreamRouter);
app.use(turnAbortRouter);
app.use(turnRouter);
app.use("/api/history", historyRouter);
app.use(snapshotsRouter);
app.use(memoGenerateRouter); // T61: Session Memo generation
app.use("/api/memo", memoExportRouter); // T74: Memo export
app.use("/api/trajectory", trajectoryRouter);
app.use("/api/metrics", metricsRouter);
app.use("/api/ext", extRouter);
app.use("/metrics", metricsUnifiedRouter);
app.use("/metrics/ext", metricsExtRouter);
app.use("/api/bus", busRouter);
app.use("/metrics/bus", metricsBusRouter);
app.use("/metrics/tree", treeMetricsRouter);
app.use("/api/integration/tree", treeIntegrationRouter);
app.use("/api/admin/debug", adminDebugRouter);
app.use("/api/admin/debug", adminLedgerDebugRouter);
app.use("/api/admin", createAdminUsersRouter(pool));
app.use(adminLlmRouter);
app.use(adminStatsRouter);
app.use(adminSettingsRouter);
app.use(adminLandingMediaRouter);
app.use(adminAuditLogsRouter);
app.use(adminPlatformProvidersRouter);
app.use(adminContextInspectorRouter);
app.use("/api/admin/context-debug", adminContextDebugRouter);
app.use(siteMetaRouter);
app.use(outcomesRouter);
app.use("/api/auth", createEmailVerificationRouter(pool));
app.use("/api/auth", createPasswordResetRouter(pool));
app.use("/api/auth", createSetPasswordRouter(pool));
app.use(createUserApiKeysRouter());
app.use(createLlmSettingsRouter({ redis }));
app.use(createEnabledModelsRouter());
app.use(createUserProvidersRouter());
app.use(createOllamaBridgeRouter());
app.use("/api/mobile", createMobileAuthRouter(pool));
app.use(createMeUsageRouter());
app.use(healthRouter);

// 连接数据库与缓存
async function initConnections() {
  try {
    // T-FIX: Pool manages connections automatically, just verify it works
    const testResult = await pgClient.query("SELECT 1 as test");
    if (testResult.rows[0]?.test !== 1) {
      throw new Error('PostgreSQL test query failed');
    }
    await redis.ping();
    console.log("✅ PostgreSQL & Redis connected");
  } catch (err) {
    console.error("❌ Connection failed:", err);
  }
}
initConnections();

// 捕获所有未匹配路由，返回 JSON 而非 Express 默认的 HTML 页面
app.use((_req, res) => {
  res.status(404).json({ ok: false, error: 'not_found', message: 'Route not found' });
});

app.use((err, _req, res, _next) => {
  // 如果 headers 已经发送（例如 SSE 流已经开始），则不能再发送响应
  if (res.headersSent) {
    console.warn('[global-error] Headers already sent, cannot send error response:', err?.message || err);
    return;
  }

  if (err?.type === "entity.parse.failed") {
    respondWithError(res, {
      status: err.status ?? 400,
      code: "invalid_json",
      message: "request body must be valid JSON",
      detail: err?.message ?? null,
    });
    return;
  }

  respondWithError(res, err);
});

// Initialize missing providers (Claude, DeepSeek)
async function ensureProvidersExist() {
  const client = await pool.connect();
  try {
    // Check if providers exist
    const result = await client.query(
      `SELECT COUNT(*) as count FROM platform_providers WHERE kind IN ('anthropic', 'deepseek')`
    );
    
    if (result.rows[0].count >= 2) {
      console.log('✓ All providers already initialized');
      return;
    }

    console.log('[Providers] Initializing missing providers...');

    // Add Anthropic
    await client.query(`
      INSERT INTO platform_providers (kind, name, slug, base_url, enabled, is_default)
      VALUES ('anthropic', 'Anthropic Claude', 'anthropic', 'https://api.anthropic.com/v1/messages', false, false)
      ON CONFLICT (slug) DO NOTHING
    `);
    console.log('[Providers] ✓ Anthropic added');

    // Add DeepSeek
    await client.query(`
      INSERT INTO platform_providers (kind, name, slug, base_url, enabled, is_default)
      VALUES ('deepseek', 'DeepSeek', 'deepseek', 'https://api.deepseek.com/v1/chat/completions', false, false)
      ON CONFLICT (slug) DO NOTHING
    `);
    console.log('[Providers] ✓ DeepSeek added');

  } catch (error) {
    console.error('[Providers] Error during initialization:', error.message);
  } finally {
    client.release();
  }
}

// Ensure providers exist before starting server
await ensureProvidersExist();

const server = app.listen(PORT, () => {
  console.log(`🌿 oMyTree API running on http://127.0.0.1:${PORT}`);
  
  // 通知 PM2 应用已就绪 (支持零停机热更新)
  if (process.send) {
    process.send('ready');
    console.log('📡 PM2 ready signal sent');
  }
});

// 优雅关闭处理 (支持零停机热更新)
const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 Received ${signal}, gracefully shutting down...`);
  
  // 停止接受新连接
  server.close(async () => {
    console.log('✅ HTTP server closed');
    
    try {
      // 关闭数据库连接池
      await pool.end();
      console.log('✅ PostgreSQL pool closed');
      
      // 关闭 Redis 连接
      await redis.quit();
      console.log('✅ Redis connection closed');
      
      console.log('👋 Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      console.error('❌ Error during shutdown:', err);
      process.exit(1);
    }
  });
  
  // 如果 5 秒后还没有关闭完成，强制退出
  setTimeout(() => {
    console.error('⚠️  Forced shutdown after timeout');
    process.exit(1);
  }, 5000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
