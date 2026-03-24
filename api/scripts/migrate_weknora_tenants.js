#!/usr/bin/env node

/**
 * P0 Security Migration: Provision WeKnora Tenants for All Workspaces
 * 
 * 此脚本为所有缺少 WeKnora 租户配置的工作区创建独立租户，
 * 以修复租户隔离漏洞。
 * 
 * 运行方式:
 *   node scripts/migrate_weknora_tenants.js
 * 
 * 前置条件:
 *   - WEKNORA_BASE_URL 和 WEKNORA_API_KEY (admin key) 必须配置
 *   - PG_DSN 必须配置
 */

import { pool } from "../db/pool.js";
import { provisionAllMissingWorkspaces } from "../services/workspaces/weknora_provisioning.js";

async function main() {
  console.log("======================================================");
  console.log("P0 Security Migration: WeKnora Tenant Provisioning");
  console.log("======================================================\n");

  console.log("Environment check:");
  console.log(`  WEKNORA_BASE_URL: ${process.env.WEKNORA_BASE_URL || "(default: http://127.0.0.1:8081)"}`);
  console.log(`  WEKNORA_API_KEY: ${process.env.WEKNORA_API_KEY ? "****" + process.env.WEKNORA_API_KEY.slice(-4) : "(not set)"}`);
  console.log(`  PG_DSN: ${process.env.PG_DSN ? "****" : "(not set)"}`);
  console.log("");

  if (!process.env.WEKNORA_API_KEY) {
    console.error("ERROR: WEKNORA_API_KEY is required for admin tenant creation.");
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    console.log("Starting tenant provisioning...\n");
    
    const results = await provisionAllMissingWorkspaces({ client });

    console.log("\n======================================================");
    console.log("Migration Results:");
    console.log("======================================================");
    
    const success = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    console.log(`  Total workspaces: ${results.length}`);
    console.log(`  ✓ Success: ${success.length}`);
    console.log(`  ✗ Failed: ${failed.length}`);

    if (failed.length > 0) {
      console.log("\nFailed workspaces:");
      failed.forEach(f => {
        console.log(`  - ${f.workspaceId}: ${f.error}`);
      });
    }

    if (success.length > 0) {
      console.log("\nSuccessfully provisioned:");
      success.forEach(s => {
        console.log(`  - ${s.workspaceId} → Tenant ID: ${s.tenantId}${s.alreadyProvisioned ? " (already existed)" : ""}`);
      });
    }

    console.log("\n======================================================");
    console.log("IMPORTANT: After running this migration, restart the API:");
    console.log("  pm2 restart omytree-api");
    console.log("======================================================\n");

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
