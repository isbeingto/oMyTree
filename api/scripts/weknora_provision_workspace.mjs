import { validate as uuidValidate } from "uuid";
import { pool } from "../db/pool.js";
import { encryptApiKey, maskApiKey } from "../lib/api_key_crypto.js";

function printUsage() {
  console.log(`
Usage:
  node api/scripts/weknora_provision_workspace.mjs \\
    --workspace-id <uuid> \\
    --api-key <key> \\
    [--tenant-id <id>] \\
    [--dry-run]

Tips:
  - Prefer --api-key-env to avoid shell history:
      --api-key-env WEKNORA_API_KEY
  - Required env vars for DB: PG_DSN or (PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE)
`);
}

function parseArgs(argv) {
  const args = { dryRun: false };
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
      case "--api-key":
        args.apiKey = value;
        if (!inlineValue) i += 1;
        break;
      case "--api-key-env":
        args.apiKeyEnv = value;
        if (!inlineValue) i += 1;
        break;
      case "--tenant-id":
        args.tenantId = value;
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
  if (!value || typeof value !== "string" || !uuidValidate(value.trim())) {
    throw new Error("workspace-id must be a valid uuid");
  }
  return value.trim();
}

function normalizeTenantId(value) {
  if (typeof value === "undefined" || value === null || value === "") {
    return null;
  }
  const trimmed = String(value).trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error("tenant-id must be a positive integer");
  }
  return trimmed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const workspaceId = normalizeWorkspaceId(args.workspaceId);
  const apiKey = args.apiKeyEnv ? process.env[args.apiKeyEnv] : args.apiKey;
  if (!apiKey || typeof apiKey !== "string") {
    printUsage();
    throw new Error("api-key is required (use --api-key or --api-key-env)");
  }
  const tenantId = normalizeTenantId(args.tenantId);

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, kind, name, owner_user_id, weknora_tenant_id
         FROM workspaces
        WHERE id = $1
        LIMIT 1`,
      [workspaceId]
    );
    const workspace = rows[0];
    if (!workspace) {
      throw new Error(`workspace not found: ${workspaceId}`);
    }

    const encrypted = encryptApiKey(apiKey);
    const masked = maskApiKey(apiKey);

    if (args.dryRun) {
      console.log("[dry-run] Would update workspace:", {
        id: workspace.id,
        kind: workspace.kind,
        name: workspace.name,
        tenant_id: tenantId ?? workspace.weknora_tenant_id ?? null,
        api_key_masked: masked,
      });
      return;
    }

    await client.query(
      `UPDATE workspaces
          SET weknora_api_key_encrypted = $1,
              weknora_tenant_id = COALESCE($2, weknora_tenant_id),
              updated_at = NOW()
        WHERE id = $3`,
      [encrypted, tenantId, workspaceId]
    );

    console.log("✅ Workspace WeKnora key updated", {
      id: workspace.id,
      kind: workspace.kind,
      name: workspace.name,
      tenant_id: tenantId ?? workspace.weknora_tenant_id ?? null,
      api_key_masked: masked,
    });
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("❌ Provisioning failed:", err?.message || err);
  process.exit(1);
});
