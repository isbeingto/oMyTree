import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { respondWithError } from "../lib/errors.js";
import createWorkspacesRouter from "../routes/workspaces.js";
import createKnowledgeRouter from "../routes/knowledge/index.js";
import { startWeknoraStubServer } from "./helpers/weknora_stub.js";
import { pool } from "../db/pool.js";
import { encryptApiKey } from "../lib/api_key_crypto.js";

let app = null;
let weknora = null;
let previousWeknoraBaseUrl = null;
let previousWeknoraAllowFallback = null;

let createdUserIds = [];
let createdWorkspaceIds = [];

async function createTestUser(label) {
  const email = `audit+${label}+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const { rows } = await pool.query(`INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id, email`, [
    `Audit ${label}`,
    email,
  ]);
  const user = rows[0];
  if (user?.id) createdUserIds.push(user.id);
  return user;
}

async function cleanup() {
  if (createdWorkspaceIds.length > 0) {
    await pool.query(
      `DELETE FROM audit_logs WHERE metadata->>'workspace_id' = ANY($1::text[]) OR target_id = ANY($1::text[])`,
      [createdWorkspaceIds.map(String)]
    );
    await pool.query(`DELETE FROM workspaces WHERE id = ANY($1::uuid[])`, [createdWorkspaceIds]);
  }

  if (createdUserIds.length > 0) {
    await pool.query(`DELETE FROM audit_logs WHERE actor_user_id = ANY($1::uuid[])`, [createdUserIds]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [createdUserIds]);
  }

  createdWorkspaceIds = [];
  createdUserIds = [];
}

beforeAll(async () => {
  previousWeknoraBaseUrl = process.env.WEKNORA_BASE_URL;
  previousWeknoraAllowFallback = process.env.WEKNORA_ALLOW_GLOBAL_KEY_FALLBACK;

  weknora = await startWeknoraStubServer();
  process.env.WEKNORA_BASE_URL = weknora.baseUrl;
  process.env.WEKNORA_ALLOW_GLOBAL_KEY_FALLBACK = "false";

  app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use(createWorkspacesRouter(pool));
  app.use("/api/knowledge", createKnowledgeRouter(pool));
  app.use((err, _req, res, _next) => {
    respondWithError(res, err);
  });
});

afterEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  if (weknora) await weknora.close();
  if (typeof previousWeknoraBaseUrl === "string") {
    process.env.WEKNORA_BASE_URL = previousWeknoraBaseUrl;
  } else {
    delete process.env.WEKNORA_BASE_URL;
  }
  if (typeof previousWeknoraAllowFallback === "string") {
    process.env.WEKNORA_ALLOW_GLOBAL_KEY_FALLBACK = previousWeknoraAllowFallback;
  } else {
    delete process.env.WEKNORA_ALLOW_GLOBAL_KEY_FALLBACK;
  }
});

describe("P3-AUDIT-002 Workspace/Knowledge audit logs", () => {
  it("records workspace + knowledge actions and allows owner/admin to query by workspace", async () => {
    const owner = await createTestUser("owner");
    const member = await createTestUser("member");
    expect(owner?.id && member?.id).toBeTruthy();

    // Create team workspace
    const created = await request(app)
      .post("/api/workspaces")
      .set("x-omytree-user-id", owner.id)
      .send({ name: "Audit Team" })
      .expect(201);
    const workspaceId = String(created.body?.data?.id || "");
    expect(workspaceId).toBeTruthy();
    createdWorkspaceIds.push(workspaceId);

    // Add member (member role)
    await request(app)
      .post(`/api/workspaces/${encodeURIComponent(workspaceId)}/members`)
      .set("x-omytree-user-id", owner.id)
      .send({ email: member.email, role: "member" })
      .expect(201);

    // Activate workspace
    await request(app)
      .post(`/api/workspaces/${encodeURIComponent(workspaceId)}/activate`)
      .set("x-omytree-user-id", owner.id)
      .expect(200);

    // Provision WeKnora key for this workspace
    await pool.query(`UPDATE workspaces SET weknora_api_key_encrypted = $1 WHERE id = $2`, [
      encryptApiKey("sk-audit-team"),
      workspaceId,
    ]);

    // Create KB under team workspace
    const kbCreate = await request(app)
      .post("/api/knowledge/bases")
      .set("x-omytree-user-id", owner.id)
      .set("x-omytree-workspace-id", workspaceId)
      .send({ name: "Audit KB" })
      .expect(201);
    const kbId = String(kbCreate.body?.data?.id || "");
    expect(kbId).toBeTruthy();

    // Update KB
    await request(app)
      .put(`/api/knowledge/bases/${encodeURIComponent(kbId)}`)
      .set("x-omytree-user-id", owner.id)
      .set("x-omytree-workspace-id", workspaceId)
      .send({ name: "Audit KB Renamed" })
      .expect(200);

    // Upload doc
    const uploadRes = await request(app)
      .post(`/api/knowledge/bases/${encodeURIComponent(kbId)}/documents/file`)
      .set("x-omytree-user-id", owner.id)
      .set("x-omytree-workspace-id", workspaceId)
      .attach("file", Buffer.from("hello"), "hello.txt")
      .expect(201);
    const docId = String(uploadRes.body?.data?.id || "");
    expect(docId).toBeTruthy();

    // Download doc
    await request(app)
      .get(`/api/knowledge/documents/${encodeURIComponent(docId)}/download`)
      .set("x-omytree-user-id", owner.id)
      .set("x-omytree-workspace-id", workspaceId)
      .expect(200);

    // Owner can query workspace audit logs
    const logsRes = await request(app)
      .get(`/api/workspaces/${encodeURIComponent(workspaceId)}/audit-logs?limit=200`)
      .set("x-omytree-user-id", owner.id)
      .expect(200);

    expect(logsRes.body?.ok).toBe(true);
    const actions = (Array.isArray(logsRes.body?.data) ? logsRes.body.data : []).map((row) => row.action);

    expect(actions).toContain("workspace.create");
    expect(actions).toContain("workspace.member.add");
    expect(actions).toContain("workspace.activate");
    expect(actions).toContain("knowledge.base.create");
    expect(actions).toContain("knowledge.base.update");
    expect(actions).toContain("knowledge.document.upload");
    expect(actions).toContain("knowledge.document.download");

    // Plain members cannot read audit logs
    await request(app)
      .get(`/api/workspaces/${encodeURIComponent(workspaceId)}/audit-logs`)
      .set("x-omytree-user-id", member.id)
      .expect(403);
  });
});
