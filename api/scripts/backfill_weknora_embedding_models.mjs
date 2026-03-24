import { validate as uuidValidate } from "uuid";
import { pool } from "../db/pool.js";
import { decryptApiKey, maskApiKey } from "../lib/api_key_crypto.js";
import { ensureWeKnoraTenantEmbeddingModel } from "../services/workspaces/weknora_provisioning.js";

function printUsage() {
  console.log(`
Usage:
  node api/scripts/backfill_weknora_embedding_models.mjs [options]

Options:
  --workspace-id <uuid>   Only backfill a single workspace
  --limit <n>             Max workspaces to process (default: 500)
  --dry-run               Print what would happen without calling WeKnora
  --help                  Show this help

Notes:
  - Requires DB env vars (PG_DSN or PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE)
  - Requires default embedding config for provisioning:
      WEKNORA_DEFAULT_EMBEDDING_API_KEY (recommended)
    or OPENAI_API_KEY
`);
}

function parseArgs(argv) {
  const args = { dryRun: false, limit: 500 };
  for (let i = 0; i < argv.length; i += 1) {
    const entry = argv[i];
    if (!entry.startsWith("--")) continue;
    const [key, inlineValue] = entry.split("=");
    const value = inlineValue ?? argv[i + 1];
    switch (key) {
      case "--workspace-id":
        args.workspaceId = value;
        if (!inlineValue) i += 1;
        break;
      case "--limit":
        args.limit = Number.parseInt(String(value ?? ""), 10);
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

function normalizeWorkspaceId(value) {
  if (typeof value === "undefined" || value === null || value === "") return null;
  if (!value || typeof value !== "string" || !uuidValidate(value.trim())) {
    throw new Error("workspace-id must be a valid uuid");
  }
  return value.trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const workspaceId = normalizeWorkspaceId(args.workspaceId);
  const limit = Number.isFinite(args.limit) && args.limit > 0 ? args.limit : 500;

  const client = await pool.connect();
  let processed = 0;
  let created = 0;
  let skipped = 0;
  let failed = 0;

  try {
    const { rows } = await client.query(
      `SELECT id, kind, name, weknora_tenant_id, weknora_api_key_encrypted
         FROM workspaces
        WHERE weknora_api_key_encrypted IS NOT NULL
          AND ($1::uuid IS NULL OR id = $1)
        ORDER BY created_at ASC
        LIMIT $2`,
      [workspaceId, limit]
    );

    if (!rows.length) {
      console.log("No matching workspaces found.");
      return;
    }

    for (const ws of rows) {
      processed += 1;
      try {
        const tenantApiKey = decryptApiKey(ws.weknora_api_key_encrypted);
        const masked = maskApiKey(tenantApiKey);

        if (args.dryRun) {
          skipped += 1;
          console.log("[dry-run] Would ensure embedding model:", {
            workspace_id: ws.id,
            kind: ws.kind,
            name: ws.name,
            tenant_id: ws.weknora_tenant_id,
            tenant_key_masked: masked,
          });
          continue;
        }

        const result = await ensureWeKnoraTenantEmbeddingModel({
          tenantApiKey,
          tenantId: ws.weknora_tenant_id,
          workspaceId: ws.id,
        });

        if (result?.created) created += 1;
        else skipped += 1;

        console.log("✅ ensured", {
          workspace_id: ws.id,
          tenant_id: ws.weknora_tenant_id,
          created: Boolean(result?.created),
        });
      } catch (err) {
        failed += 1;
        console.error("❌ failed", {
          workspace_id: ws.id,
          tenant_id: ws.weknora_tenant_id,
          error: err?.message || String(err),
        });
      }
    }

    console.log("\nSummary:", { processed, created, skipped, failed });
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("❌ backfill failed:", err?.message || err);
  process.exit(1);
});
