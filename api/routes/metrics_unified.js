import express from "express";

import {
  UNIFIED_METRICS_HEADER,
  buildBridgeMetricsLines,
  buildBusMetricsLines,
  buildExtMetricsLines,
  buildTreeMetricsLines,
  buildTreePersistenceMetricsLines,
} from "../lib/metrics_formatters.js";
import { getTreePersistenceMetrics } from "../services/tree/index.js";
import { buildTreeSummaryMetricsLines } from "../lib/tree_summary_metrics.js";
import { buildStreamingMetricsLines } from "../services/llm/streaming_metrics.js";
import { buildGeminiCacheMetricsLines } from "../services/llm/gemini_cache_metrics.js";
import { buildPromptCacheMetricsLines } from "../services/llm/prompt_cache_metrics.js";
import { buildRollingSummaryMetricsLines } from "../services/llm/rolling_summary_metrics.js";
import { buildSemanticSelectionMetricsLines } from "../services/llm/semantic_selection_metrics.js";
import { buildBranchSummaryMetricsLines } from "../services/llm/branch_summary_metrics.js";
import { buildOutcomeAssetMetricsLines } from "../services/outcome/outcome_asset_metrics.js";

export default function createUnifiedMetricsRouter({ treeBridge } = {}) {
  const router = express.Router();

  router.get(
    "/",
    async (_req, res) => {
      const persistenceState = await getTreePersistenceMetrics();
      const sections = [
        UNIFIED_METRICS_HEADER,
        "",
        ...buildExtMetricsLines(),
        "",
        ...buildBusMetricsLines(),
        "",
        ...buildTreeMetricsLines(treeBridge),
        "",
        ...buildTreeSummaryMetricsLines(),
        "",
        ...buildTreePersistenceMetricsLines(persistenceState),
        "",
        ...buildBridgeMetricsLines(treeBridge),
        "",
        ...buildStreamingMetricsLines(),
        "",
        ...buildGeminiCacheMetricsLines(),
        "",
        ...buildPromptCacheMetricsLines(),
        "",
        ...buildRollingSummaryMetricsLines(),
        "",
        ...buildSemanticSelectionMetricsLines(),
        "",
        ...buildBranchSummaryMetricsLines(),
        "",
        ...buildOutcomeAssetMetricsLines(),
      ];

      res
        .status(200)
        .set("Content-Type", "text/plain; charset=utf-8")
        .set("Cache-Control", "no-store")
        .send(`${sections.join("\n")}\n`);
    },
  );

  return router;
}
