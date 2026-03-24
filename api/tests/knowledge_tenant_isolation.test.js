import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { respondWithError } from "../lib/errors.js";
import createKnowledgeRouter from "../routes/knowledge/index.js";
import { encryptApiKey } from "../lib/api_key_crypto.js";
import { getOrCreatePersonalWorkspace, setActiveWorkspaceId } from "../services/workspaces/store.js";
import { startWeknoraStubServer } from "./helpers/weknora_stub.js";
import { pool } from "../db/pool.js";
import turnRouter from "../routes/turn.js";

let createdUserIds = [];
let createdWorkspaceIds = [];
let createdTreeIds = [];

async function createTestUser(label) {
  const email = `kb-iso+${label}+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const { rows } = await pool.query(
    `INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id`,
    [`KB Isolation ${label}`, email]
  );
  const userId = rows[0]?.id;
  if (userId) createdUserIds.push(userId);
  return userId;
}

async function cleanup() {
  for (const workspaceId of createdWorkspaceIds) {
    await pool.query(`DELETE FROM workspaces WHERE id = $1`, [workspaceId]);
  }
  for (const treeId of createdTreeIds) {
    await pool.query(`DELETE FROM nodes WHERE tree_id = $1`, [treeId]);
    await pool.query(`DELETE FROM trees WHERE id = $1`, [treeId]);
  }
  for (const userId of createdUserIds) {
    await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
  }
  createdWorkspaceIds = [];
  createdTreeIds = [];
  createdUserIds = [];
}

async function createTreeWithRoot({ userId, topic = "Test Tree", rootText = "Root" }) {
  const client = await pool.connect();
  try {
    const { rows: treeRows } = await client.query(
      `INSERT INTO trees(topic, created_by, status, user_id, context_profile, memory_scope)
       VALUES ($1, 'user', 'active', $2, 'lite', 'branch')
       RETURNING id`,
      [topic, userId]
    );
    const treeId = String(treeRows[0].id);
    createdTreeIds.push(treeId);

    const { rows: nodeRows } = await client.query(
      `INSERT INTO nodes(tree_id, parent_id, level, role, text)
       VALUES ($1, NULL, 0, 'user', $2)
       RETURNING id`,
      [treeId, rootText]
    );
    const nodeId = String(nodeRows[0].id);

    return { treeId, nodeId };
  } finally {
    client.release();
  }
}

let weknora = null;
let app = null;
let previousWeknoraBaseUrl = null;
let previousWeknoraAllowFallback = null;

beforeAll(async () => {
  previousWeknoraBaseUrl = process.env.WEKNORA_BASE_URL;
  previousWeknoraAllowFallback = process.env.WEKNORA_ALLOW_GLOBAL_KEY_FALLBACK;

  weknora = await startWeknoraStubServer();
  process.env.WEKNORA_BASE_URL = weknora.baseUrl;
  process.env.WEKNORA_ALLOW_GLOBAL_KEY_FALLBACK = "false";

  app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(turnRouter);
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

describe("knowledge tenant isolation (workspace api key)", () => {
  it("isolates knowledge bases and search results between users", async () => {
    const userA = await createTestUser("A");
    const userB = await createTestUser("B");

    const client = await pool.connect();
    try {
      const wsA = await getOrCreatePersonalWorkspace({ client, userId: userA });
      const wsB = await getOrCreatePersonalWorkspace({ client, userId: userB });
      createdWorkspaceIds.push(wsA.id, wsB.id);

      await setActiveWorkspaceId({ client, userId: userA, workspaceId: wsA.id });
      await setActiveWorkspaceId({ client, userId: userB, workspaceId: wsB.id });

      await client.query(
        `UPDATE workspaces SET weknora_api_key_encrypted = $1 WHERE id = $2`,
        [encryptApiKey("sk-tenant-a"), wsA.id]
      );
      await client.query(
        `UPDATE workspaces SET weknora_api_key_encrypted = $1 WHERE id = $2`,
        [encryptApiKey("sk-tenant-b"), wsB.id]
      );
    } finally {
      client.release();
    }

    // A creates KB
    const createRes = await request(app)
      .post("/api/knowledge/bases")
      .set("x-omytree-user-id", userA)
      .send({ name: "A-KB" })
      .expect(201);
    expect(createRes.body?.ok).toBe(true);
    const kbId = String(createRes.body?.data?.id || "");
    expect(kbId).toBeTruthy();

    // A lists bases -> sees it
    const listA = await request(app)
      .get("/api/knowledge/bases")
      .set("x-omytree-user-id", userA)
      .expect(200);
    expect(listA.body?.ok).toBe(true);
    const basesA = Array.isArray(listA.body?.data) ? listA.body.data : [];
    expect(basesA.some((b) => String(b?.id) === kbId)).toBe(true);

    // B lists bases -> should NOT see A's base
    const listB = await request(app)
      .get("/api/knowledge/bases")
      .set("x-omytree-user-id", userB)
      .expect(200);
    expect(listB.body?.ok).toBe(true);
    const basesB = Array.isArray(listB.body?.data) ? listB.body.data : [];
    expect(basesB.some((b) => String(b?.id) === kbId)).toBe(false);

    // A searches its KB -> returns stub results
    const searchA = await request(app)
      .post(`/api/knowledge/bases/${encodeURIComponent(kbId)}/search`)
      .set("x-omytree-user-id", userA)
      .send({ query_text: "hello", match_count: 3 })
      .expect(200);
    expect(searchA.body?.ok).toBe(true);
    const resultsA = Array.isArray(searchA.body?.data) ? searchA.body.data : [];
    expect(resultsA.length).toBeGreaterThan(0);
    expect(String(resultsA[0]?.content || "")).toContain("tenant=sk-tenant-a");

    // B tries to search A's KB id -> should be not found in B tenant
    const searchB = await request(app)
      .post(`/api/knowledge/bases/${encodeURIComponent(kbId)}/search`)
      .set("x-omytree-user-id", userB)
      .send({ query_text: "hello", match_count: 3 })
      .expect(404);
    expect(searchB.body?.code || searchB.body?.error || "").toBeTruthy();
  });

  it("isolates document upload/download across tenants", async () => {
    const userA = await createTestUser("A-doc");
    const userB = await createTestUser("B-doc");

    const client = await pool.connect();
    try {
      const wsA = await getOrCreatePersonalWorkspace({ client, userId: userA });
      const wsB = await getOrCreatePersonalWorkspace({ client, userId: userB });
      createdWorkspaceIds.push(wsA.id, wsB.id);

      await setActiveWorkspaceId({ client, userId: userA, workspaceId: wsA.id });
      await setActiveWorkspaceId({ client, userId: userB, workspaceId: wsB.id });

      await client.query(`UPDATE workspaces SET weknora_api_key_encrypted = $1 WHERE id = $2`, [
        encryptApiKey("sk-tenant-a"),
        wsA.id,
      ]);
      await client.query(`UPDATE workspaces SET weknora_api_key_encrypted = $1 WHERE id = $2`, [
        encryptApiKey("sk-tenant-b"),
        wsB.id,
      ]);
    } finally {
      client.release();
    }

    const createKb = await request(app)
      .post("/api/knowledge/bases")
      .set("x-omytree-user-id", userA)
      .send({ name: "A-KB" })
      .expect(201);
    const kbId = String(createKb.body?.data?.id || "");
    expect(kbId).toBeTruthy();

    const uploadRes = await request(app)
      .post(`/api/knowledge/bases/${encodeURIComponent(kbId)}/documents/file`)
      .set("x-omytree-user-id", userA)
      .attach("file", Buffer.from("hello"), "hello.txt")
      .expect(201);
    expect(uploadRes.body?.ok).toBe(true);
    const docId = String(uploadRes.body?.data?.id || "");
    expect(docId).toBeTruthy();

    // A can download
    const downloadA = await request(app)
      .get(`/api/knowledge/documents/${encodeURIComponent(docId)}/download`)
      .set("x-omytree-user-id", userA)
      .expect(200);
    expect(String(downloadA.headers?.["content-type"] || "")).toContain("application/octet-stream");
    expect(Buffer.isBuffer(downloadA.body) ? downloadA.body.toString("utf8") : String(downloadA.text || "")).toContain(
      "tenant=sk-tenant-a"
    );

    // B cannot download A's doc
    await request(app)
      .get(`/api/knowledge/documents/${encodeURIComponent(docId)}/download`)
      .set("x-omytree-user-id", userB)
      .expect(404);
  });

  it("isolates RAG search in /api/turn by workspace api key", async () => {
    const userA = await createTestUser("A-rag");
    const userB = await createTestUser("B-rag");

    const client = await pool.connect();
    let wsA;
    let wsB;
    try {
      wsA = await getOrCreatePersonalWorkspace({ client, userId: userA });
      wsB = await getOrCreatePersonalWorkspace({ client, userId: userB });
      createdWorkspaceIds.push(wsA.id, wsB.id);

      await setActiveWorkspaceId({ client, userId: userA, workspaceId: wsA.id });
      await setActiveWorkspaceId({ client, userId: userB, workspaceId: wsB.id });

      await client.query(`UPDATE workspaces SET weknora_api_key_encrypted = $1 WHERE id = $2`, [
        encryptApiKey("sk-tenant-a"),
        wsA.id,
      ]);
      await client.query(`UPDATE workspaces SET weknora_api_key_encrypted = $1 WHERE id = $2`, [
        encryptApiKey("sk-tenant-b"),
        wsB.id,
      ]);
    } finally {
      client.release();
    }

    // A creates KB in A tenant
    const createKb = await request(app)
      .post("/api/knowledge/bases")
      .set("x-omytree-user-id", userA)
      .send({ name: "A-KB" })
      .expect(201);
    const kbIdA = String(createKb.body?.data?.id || "");
    expect(kbIdA).toBeTruthy();

    // Prepare trees
    const treeA = await createTreeWithRoot({ userId: userA, topic: "A Tree", rootText: "A Root" });
    const treeB = await createTreeWithRoot({ userId: userB, topic: "B Tree", rootText: "B Root" });

    // A /api/turn with knowledge -> should include tenant A in citations
    const turnA = await request(app)
      .post("/api/turn")
      .set("x-omytree-user-id", userA)
      .send({
        tree_id: treeA.treeId,
        node_id: treeA.nodeId,
        user_text: "hello",
        provider: "mock",
        knowledge_base_ids: [kbIdA],
      })
      .expect(201);
    const citationsA = Array.isArray(turnA.body?.citations) ? turnA.body.citations : [];
    expect(citationsA.length).toBeGreaterThan(0);
    expect(String(citationsA[0]?.snippet || "")).toContain("tenant=sk-tenant-a");

    // B /api/turn with A's kbId -> should NOT return citations (B tenant cannot see A KB)
    const turnB = await request(app)
      .post("/api/turn")
      .set("x-omytree-user-id", userB)
      .send({
        tree_id: treeB.treeId,
        node_id: treeB.nodeId,
        user_text: "hello",
        provider: "mock",
        knowledge_base_ids: [kbIdA],
      })
      .expect(201);
    expect(turnB.body?.citations).toBeUndefined();
  });
});
