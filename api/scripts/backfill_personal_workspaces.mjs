import { pool } from "../db/pool.js";
import {
  getActiveWorkspaceId,
  getOrCreatePersonalWorkspace,
  setActiveWorkspaceId,
} from "../services/workspaces/store.js";

function parseArgs(argv) {
  const args = {
    batchSize: 500,
    offset: 0,
    limit: null,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const entry = argv[i];
    if (!entry.startsWith("--")) continue;
    const [key, inlineValue] = entry.split("=");
    const value = inlineValue ?? argv[i + 1];
    switch (key) {
      case "--batch-size":
        args.batchSize = Number(value);
        if (!inlineValue) i += 1;
        break;
      case "--offset":
        args.offset = Number(value);
        if (!inlineValue) i += 1;
        break;
      case "--limit":
        args.limit = Number(value);
        if (!inlineValue) i += 1;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--help":
        args.help = true;
        break;
      default:
        break;
    }
  }
  return args;
}

function printUsage() {
  console.log(`
Usage:
  node api/scripts/backfill_personal_workspaces.mjs [options]

Options:
  --batch-size <n>   Batch size (default 500)
  --offset <n>       Start offset (default 0)
  --limit <n>        Max users to process
  --dry-run          Do not write, only report
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const batchSize = Number.isFinite(args.batchSize) && args.batchSize > 0 ? args.batchSize : 500;
  const offsetBase = Number.isFinite(args.offset) && args.offset >= 0 ? args.offset : 0;
  const limitTotal = Number.isFinite(args.limit) && args.limit > 0 ? args.limit : null;

  const client = await pool.connect();
  let processed = 0;
  let created = 0;
  let activated = 0;
  try {
    let offset = offsetBase;
    while (true) {
      const remaining = limitTotal ? Math.max(limitTotal - processed, 0) : null;
      const pageSize = remaining ? Math.min(batchSize, remaining) : batchSize;
      if (remaining !== null && remaining <= 0) break;

      const { rows } = await client.query(
        `SELECT id
           FROM users
          ORDER BY created_at ASC, id ASC
          LIMIT $1 OFFSET $2`,
        [pageSize, offset]
      );

      if (rows.length === 0) break;

      for (const row of rows) {
        const userId = row.id;
        processed += 1;

        const existing = await client.query(
          `SELECT id
             FROM workspaces
            WHERE owner_user_id = $1
              AND kind = 'personal'
            LIMIT 1`,
          [userId]
        );

        if (existing.rows.length === 0) {
          created += 1;
        }

        if (!args.dryRun) {
          const personal = await getOrCreatePersonalWorkspace({ client, userId });
          const activeWorkspaceId = await getActiveWorkspaceId({ client, userId });
          if (!activeWorkspaceId) {
            await setActiveWorkspaceId({ client, userId, workspaceId: personal.id });
            activated += 1;
          }
        } else {
          const activeWorkspaceId = await getActiveWorkspaceId({ client, userId });
          if (!activeWorkspaceId) {
            activated += 1;
          }
        }
      }

      offset += rows.length;
      if (rows.length < pageSize) break;
    }

    const prefix = args.dryRun ? "[dry-run] " : "";
    console.log(`${prefix}Processed users: ${processed}`);
    console.log(`${prefix}Personal workspaces missing: ${created}`);
    console.log(`${prefix}Active workspace set: ${activated}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("❌ Backfill failed:", err?.message || err);
  process.exit(1);
});
