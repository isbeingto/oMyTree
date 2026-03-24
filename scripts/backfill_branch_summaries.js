#!/usr/bin/env node
/* eslint-disable no-console */

const path = require('path');
const { pathToFileURL } = require('url');

function parseArgs(argv) {
  const args = { treeId: null, limit: 100, dryRun: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--tree-id' && argv[i + 1]) {
      args.treeId = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--limit' && argv[i + 1]) {
      const n = parseInt(argv[i + 1], 10);
      args.limit = Number.isFinite(n) ? n : args.limit;
      i += 1;
      continue;
    }
    if (arg === '--dry-run') {
      args.dryRun = true;
    }
  }
  return args;
}

async function main() {
  const { treeId, limit, dryRun } = parseArgs(process.argv);
  const poolUrl = pathToFileURL(path.resolve(__dirname, '../../api/db/pool.js')).href;
  const branchUrl = pathToFileURL(path.resolve(__dirname, '../../api/services/llm/branch_summary.js')).href;

  const { pool } = await import(poolUrl);
  const { maybeUpdateBranchSummary } = await import(branchUrl);

  const filters = [];
  const params = [];
  let idx = 1;
  if (treeId) {
    filters.push(`n.tree_id = $${idx}`);
    params.push(treeId);
    idx += 1;
  }
  params.push(limit);

  const whereClause = filters.length ? `AND ${filters.join(' AND ')}` : '';
  const sql = `
    SELECT n.id, n.tree_id
    FROM nodes n
    LEFT JOIN nodes c
      ON c.parent_id = n.id
     AND c.soft_deleted_at IS NULL
    WHERE n.soft_deleted_at IS NULL
      AND c.id IS NULL
      ${whereClause}
    ORDER BY n.created_at DESC
    LIMIT $${idx}
  `;

  console.log('[P2 Backfill] querying leaf nodes...');
  const { rows } = await pool.query(sql, params);
  console.log(`[P2 Backfill] found ${rows.length} leaf nodes`);

  let processed = 0;
  for (const row of rows) {
    processed += 1;
    if (dryRun) {
      console.log(`[P2 Backfill][dry-run] leaf=${row.id} tree=${row.tree_id}`);
      continue;
    }
    try {
      await maybeUpdateBranchSummary({
        pool,
        treeId: row.tree_id,
        nodeId: row.id,
        userId: null,
        providerHint: null,
        userLanguage: 'en',
      });
    } catch (error) {
      console.warn('[P2 Backfill] failed:', error?.message || error);
    }
    if (processed % 25 === 0) {
      console.log(`[P2 Backfill] processed ${processed}/${rows.length}`);
    }
  }

  await pool.end();
  console.log('[P2 Backfill] done');
}

main().catch((err) => {
  console.error('[P2 Backfill] fatal:', err?.message || err);
  process.exit(1);
});

