const metrics = {
  publish_total: 0,
  unpublish_total: 0,
  autorecall_total: 0,
};

export function resetOutcomeAssetMetrics() {
  metrics.publish_total = 0;
  metrics.unpublish_total = 0;
  metrics.autorecall_total = 0;
}

export function recordOutcomeAssetPublish() {
  metrics.publish_total += 1;
}

export function recordOutcomeAssetUnpublish() {
  metrics.unpublish_total += 1;
}

export function recordOutcomeAssetAutorecall() {
  metrics.autorecall_total += 1;
}

export function buildOutcomeAssetMetricsLines() {
  return [
    "## outcome_assets",
    "# HELP omytree_outcome_asset_publish_total Total outcome asset publish requests",
    "# TYPE omytree_outcome_asset_publish_total counter",
    "# HELP omytree_outcome_asset_unpublish_total Total outcome asset unpublish requests",
    "# TYPE omytree_outcome_asset_unpublish_total counter",
    "# HELP omytree_outcome_asset_autorecall_total Total outcome asset auto-recall attempts",
    "# TYPE omytree_outcome_asset_autorecall_total counter",
    `omytree_outcome_asset_publish_total ${metrics.publish_total}`,
    `omytree_outcome_asset_unpublish_total ${metrics.unpublish_total}`,
    `omytree_outcome_asset_autorecall_total ${metrics.autorecall_total}`,
  ];
}

export default {
  resetOutcomeAssetMetrics,
  recordOutcomeAssetPublish,
  recordOutcomeAssetUnpublish,
  recordOutcomeAssetAutorecall,
  buildOutcomeAssetMetricsLines,
};
