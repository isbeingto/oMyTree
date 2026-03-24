#!/usr/bin/env node
import process from "node:process";
import pkg from "pg";

import { executeTreeRollback, previewTreeRollback } from "../services/tree/rollback.js";

const { Client } = pkg;

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    dryRun: false,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--tree" || arg === "--tree-id") {
      options.treeId = args[i + 1];
      i += 1;
    } else if (arg === "--turns" || arg === "--n" || arg === "--count") {
      options.turns = args[i + 1];
      i += 1;
    } else if (arg === "--operator") {
      options.operator = args[i + 1];
      i += 1;
    } else if (arg === "--reason") {
      options.reason = args[i + 1];
      i += 1;
    } else if (arg === "--dry-run" || arg === "--preview") {
      options.dryRun = true;
    } else if (arg === "--trace-id") {
      options.traceId = args[i + 1];
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    }
  }
  return options;
}

function parseBooleanEnv(value) {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function usage() {
  console.log(`Usage:
  TREE_ID=<uuid> N=<turns> bash api/tools/tree_rollback.sh

Options:
  --tree <uuid>         Tree id (overrides TREE_ID env)
  --turns <n>           Number of turns to rollback (overrides N env)
  --dry-run             Preview only, no changes
  --operator <name>     Operator label (default: cli)
  --reason <text>       Reason label (default: manual_rollback)
  --trace-id <uuid>     Optional trace identifier
`);
}

function resolveConfig() {
  if (process.env.PG_DSN) {
    return { connectionString: process.env.PG_DSN };
  }
  return {
    host: process.env.PGHOST || "127.0.0.1",
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    user: process.env.PGUSER || "linzhi",
    password: process.env.PGPASSWORD || "",
    database: process.env.PGDATABASE || "linzhi",
  };
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    usage();
    process.exit(0);
  }

  const treeId =
    options.treeId ||
    process.env.TREE_ID ||
    process.env.tree_id ||
    process.env.TREE ||
    process.env.TREEID;
  const turns =
    options.turns ||
    process.env.N ||
    process.env.TURNS ||
    process.env.ROLLBACK_TURNS ||
    process.env.TURN_COUNT;
  const dryRun =
    options.dryRun ||
    parseBooleanEnv(process.env.DRY_RUN) ||
    parseBooleanEnv(process.env.PREVIEW);
  const operator = options.operator || process.env.OPERATOR || null;
  const reason = options.reason || process.env.REASON || null;
  const traceId = options.traceId || process.env.TRACE_ID || null;

  if (!treeId || !turns) {
    console.error("✗ TREE_ID and N (turns) are required");
    usage();
    process.exit(1);
  }

  const client = new Client(resolveConfig());
  await client.connect();

  try {
    if (dryRun) {
      const preview = await previewTreeRollback(client, { treeId, turns });
      console.log(JSON.stringify({ ok: true, mode: "preview", preview }, null, 2));
    } else {
      const result = await executeTreeRollback(client, {
        treeId,
        turns,
        operator,
        reason,
        traceId,
      });
      console.log(JSON.stringify({ ok: true, mode: "execute", result }, null, 2));
    }
    await client.end();
  } catch (err) {
    await client.end();
    const errorPayload = {
      ok: false,
      code: err?.code || err?.status || "ROLLBACK_FAILED",
      message: err?.message || "tree rollback failed",
      detail: err?.detail || null,
    };
    console.error(JSON.stringify(errorPayload, null, 2));
    process.exit(1);
  }
}

main();
