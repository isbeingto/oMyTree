import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { pool } from "../db/pool.js";
import { respondWithError } from "../lib/errors.js";
import createTreeOutcomesRouter from "../routes/tree_outcomes.js";
import { encryptApiKey } from "../lib/api_key_crypto.js";
import { getOrCreatePersonalWorkspace, setActiveWorkspaceId } from "../services/workspaces/store.js";
import { startWeknoraStubServer } from "./helpers/weknora_stub.js";

let app = null;
let weknora = null;
let previousWeknoraBaseUrl = null;
let previousWeknoraAllowFallback = null;

let createdUserIds = [];
let createdWorkspaceIds = [];
let createdTreeIds = [];

async function ensureOutcomeAssetsSchema() {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
  await pool.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS outcome_kb_id TEXT`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS outcome_assets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tree_id UUID NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
      outcome_id UUID NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
      knowledge_base_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_outcome_assets_workspace_outcome
      ON outcome_assets(workspace_id, outcome_id)
  `);
}

async function createTestUser(label) {
  const email = `outcome-publish+${label}+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const { rows } = await pool.query(
    `INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id`,
    [`Outcome Publish ${label}`, email]
  );
  const userId = String(rows[0]?.id || "");
  if (userId) {
    createdUserIds.push(userId);
  }
  return userId;
}

async function createTreeWithOutcome({ userId, label }) {
  const { rows: treeRows } = await pool.query(
    `INSERT INTO trees (topic, created_by, status, user_id, context_profile, memory_scope)
     VALUES ($1, 'user', 'active', $2, 'lite', 'branch')
     RETURNING id`,
    [`Outcome Publish ${label}`, userId]
  );
  const treeId = String(treeRows[0]?.id || "");
  createdTreeIds.push(treeId);

  const { rows: nodeRows } = await pool.query(
    `INSERT INTO nodes (tree_id, parent_id, level, role, text)
     VALUES ($1, NULL, 0, 'user', $2)
     RETURNING id`,
    [treeId, `root ${label}`]
  );
  const anchorNodeId = String(nodeRows[0]?.id || "");

  const reportJson = {
    sections: [
      {
        type: "conclusion",
        text: `结论 ${label}`,
        sources: [`node:${anchorNodeId}`],
      },
      {
        type: "step",
        text: `过程 ${label}`,
        sources: [`node:${anchorNodeId}`, `turn:${anchorNodeId}`],
      },
    ],
  };

  const { rows: outcomeRows } = await pool.query(
    `INSERT INTO outcomes (user_id, tree_id, anchor_node_id, title, conclusion, status, report_json)
     VALUES ($1, $2, $3, $4, $5, 'generated', $6::jsonb)
     RETURNING id`,
    [userId, treeId, anchorNodeId, `成果 ${label}`, `结论 ${label}`, JSON.stringify(reportJson)]
  );

  return {
    treeId,
    outcomeId: String(outcomeRows[0]?.id || ""),
    anchorNodeId,
  };
}

async function prepareWorkspace({ userId, apiKey }) {
  const client = await pool.connect();
  try {
    const ws = await getOrCreatePersonalWorkspace({ client, userId });
    createdWorkspaceIds.push(ws.id);
    await setActiveWorkspaceId({ client, userId, workspaceId: ws.id });

    if (apiKey) {
      await client.query(`UPDATE workspaces SET weknora_api_key_encrypted = $1 WHERE id = $2`, [
        encryptApiKey(apiKey),
        ws.id,
      ]);
    }

    return ws.id;
  } finally {
    client.release();
  }
}

async function listKnowledgeDocs({ kbId, apiKey }) {
  const response = await fetch(
    `${weknora.baseUrl}/api/v1/knowledge-bases/${encodeURIComponent(kbId)}/knowledge`,
    {
      headers: {
        "X-API-Key": apiKey,
      },
    }
  );
  if (!response.ok) {
    return [];
  }
  const payload = await response.json();
  return Array.isArray(payload?.data) ? payload.data : [];
}

async function cleanup() {
  for (const treeId of createdTreeIds) {
    await pool.query(`DELETE FROM trees WHERE id = $1`, [treeId]);
  }
  for (const workspaceId of createdWorkspaceIds) {
    await pool.query(`DELETE FROM workspaces WHERE id = $1`, [workspaceId]);
  }
  for (const userId of createdUserIds) {
    await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
  }
  createdTreeIds = [];
  createdWorkspaceIds = [];
  createdUserIds = [];
}

beforeAll(async () => {
  await ensureOutcomeAssetsSchema();

  previousWeknoraBaseUrl = process.env.WEKNORA_BASE_URL;
  previousWeknoraAllowFallback = process.env.WEKNORA_ALLOW_GLOBAL_KEY_FALLBACK;

  weknora = await startWeknoraStubServer();
  process.env.WEKNORA_BASE_URL = weknora.baseUrl;
  process.env.WEKNORA_ALLOW_GLOBAL_KEY_FALLBACK = "false";

  app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/api/tree", createTreeOutcomesRouter(pool));
  app.use((err, _req, res, _next) => {
    respondWithError(res, err);
  });
});

afterEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  if (weknora) {
    await weknora.close();
  }
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

describe("tree outcomes publish endpoint", () => {
  it("publishes outcome into workspace outcome kb and persists mapping", async () => {
    const userId = await createTestUser("publish-1");
    const workspaceId = await prepareWorkspace({ userId, apiKey: "sk-outcome-publish-1" });
    const { treeId, outcomeId } = await createTreeWithOutcome({ userId, label: "P1" });

    const publishRes = await request(app)
      .post(`/api/tree/${encodeURIComponent(treeId)}/outcomes/${encodeURIComponent(outcomeId)}/publish`)
      .set("x-omytree-user-id", userId)
      .expect(200);

    expect(publishRes.body?.ok).toBe(true);
    const asset = publishRes.body?.asset || {};
    expect(typeof asset.knowledge_base_id).toBe("string");
    expect(typeof asset.document_id).toBe("string");
    expect(asset.knowledge_base_id).toBeTruthy();
    expect(asset.document_id).toBeTruthy();

    const { rows: workspaceRows } = await pool.query(`SELECT outcome_kb_id FROM workspaces WHERE id = $1 LIMIT 1`, [
      workspaceId,
    ]);
    expect(workspaceRows[0]?.outcome_kb_id).toBe(asset.knowledge_base_id);

    const { rows: mappingRows } = await pool.query(
      `SELECT knowledge_base_id, document_id
         FROM outcome_assets
        WHERE outcome_id = $1
        LIMIT 1`,
      [outcomeId]
    );
    expect(mappingRows[0]?.knowledge_base_id).toBe(asset.knowledge_base_id);
    expect(mappingRows[0]?.document_id).toBe(asset.document_id);

    const docs = await listKnowledgeDocs({
      kbId: asset.knowledge_base_id,
      apiKey: "sk-outcome-publish-1",
    });
    expect(docs.length).toBe(1);
    expect(String(docs[0]?.id || "")).toBe(asset.document_id);
  });

  it("re-publish replaces mapping and deletes previous weknora document", async () => {
    const userId = await createTestUser("publish-2");
    await prepareWorkspace({ userId, apiKey: "sk-outcome-publish-2" });
    const { treeId, outcomeId } = await createTreeWithOutcome({ userId, label: "P2" });

    const first = await request(app)
      .post(`/api/tree/${encodeURIComponent(treeId)}/outcomes/${encodeURIComponent(outcomeId)}/publish`)
      .set("x-omytree-user-id", userId)
      .expect(200);

    const firstAsset = first.body?.asset || {};
    expect(firstAsset.document_id).toBeTruthy();
    expect(firstAsset.knowledge_base_id).toBeTruthy();

    const second = await request(app)
      .post(`/api/tree/${encodeURIComponent(treeId)}/outcomes/${encodeURIComponent(outcomeId)}/publish`)
      .set("x-omytree-user-id", userId)
      .expect(200);

    const secondAsset = second.body?.asset || {};
    expect(secondAsset.knowledge_base_id).toBe(firstAsset.knowledge_base_id);
    expect(secondAsset.document_id).toBeTruthy();
    expect(secondAsset.document_id).not.toBe(firstAsset.document_id);

    const { rows: mappingRows } = await pool.query(
      `SELECT document_id
         FROM outcome_assets
        WHERE outcome_id = $1
        LIMIT 1`,
      [outcomeId]
    );
    expect(mappingRows[0]?.document_id).toBe(secondAsset.document_id);

    const docs = await listKnowledgeDocs({
      kbId: secondAsset.knowledge_base_id,
      apiKey: "sk-outcome-publish-2",
    });
    expect(docs.length).toBe(1);
    expect(String(docs[0]?.id || "")).toBe(secondAsset.document_id);
  });
});

describe("tree outcomes detail asset field", () => {
  it("returns asset in detail response after publish", async () => {
    const userId = await createTestUser("detail-asset-1");
    await prepareWorkspace({ userId, apiKey: "sk-outcome-detail-1" });
    const { treeId, outcomeId } = await createTreeWithOutcome({ userId, label: "D1" });

    const publishRes = await request(app)
      .post(`/api/tree/${encodeURIComponent(treeId)}/outcomes/${encodeURIComponent(outcomeId)}/publish`)
      .set("x-omytree-user-id", userId)
      .expect(200);

    const publishedAsset = publishRes.body?.asset || {};
    expect(publishedAsset.knowledge_base_id).toBeTruthy();
    expect(publishedAsset.document_id).toBeTruthy();

    const detailRes = await request(app)
      .get(`/api/tree/${encodeURIComponent(treeId)}/outcomes/${encodeURIComponent(outcomeId)}`)
      .set("x-omytree-user-id", userId)
      .expect(200);

    expect(detailRes.body?.ok).toBe(true);
    expect(detailRes.body?.asset).toMatchObject({
      knowledge_base_id: publishedAsset.knowledge_base_id,
      document_id: publishedAsset.document_id,
    });
    expect(detailRes.body?.highlight?.main_path_node_ids).toBeTruthy();
  });

  it("returns null asset in detail response before publish", async () => {
    const userId = await createTestUser("detail-asset-2");
    await prepareWorkspace({ userId, apiKey: "sk-outcome-detail-2" });
    const { treeId, outcomeId } = await createTreeWithOutcome({ userId, label: "D2" });

    const detailRes = await request(app)
      .get(`/api/tree/${encodeURIComponent(treeId)}/outcomes/${encodeURIComponent(outcomeId)}`)
      .set("x-omytree-user-id", userId)
      .expect(200);

    expect(detailRes.body?.ok).toBe(true);
    expect(detailRes.body?.asset).toBeNull();
  });
});

describe("tree outcomes list asset_published", () => {
  it("marks published outcomes in list response", async () => {
    const userId = await createTestUser("list-asset-1");
    await prepareWorkspace({ userId, apiKey: "sk-outcome-list-1" });
    const { treeId, outcomeId } = await createTreeWithOutcome({ userId, label: "L1" });

    const beforeRes = await request(app)
      .get(`/api/tree/${encodeURIComponent(treeId)}/outcomes`)
      .set("x-omytree-user-id", userId)
      .expect(200);

    const beforeRow = (beforeRes.body?.outcomes || []).find((row) => row?.id === outcomeId);
    expect(beforeRow?.asset_published).toBe(false);

    await request(app)
      .post(`/api/tree/${encodeURIComponent(treeId)}/outcomes/${encodeURIComponent(outcomeId)}/publish`)
      .set("x-omytree-user-id", userId)
      .expect(200);

    const afterRes = await request(app)
      .get(`/api/tree/${encodeURIComponent(treeId)}/outcomes`)
      .set("x-omytree-user-id", userId)
      .expect(200);

    const afterRow = (afterRes.body?.outcomes || []).find((row) => row?.id === outcomeId);
    expect(afterRow?.asset_published).toBe(true);
  });
});

describe("tree outcomes unpublish endpoint", () => {
  it("deletes weknora document and removes outcome_assets mapping", async () => {
    const userId = await createTestUser("unpublish-1");
    await prepareWorkspace({ userId, apiKey: "sk-outcome-unpublish-1" });
    const { treeId, outcomeId } = await createTreeWithOutcome({ userId, label: "U1" });

    const publishRes = await request(app)
      .post(`/api/tree/${encodeURIComponent(treeId)}/outcomes/${encodeURIComponent(outcomeId)}/publish`)
      .set("x-omytree-user-id", userId)
      .expect(200);

    const asset = publishRes.body?.asset || {};
    expect(asset.knowledge_base_id).toBeTruthy();
    expect(asset.document_id).toBeTruthy();

    await request(app)
      .delete(`/api/tree/${encodeURIComponent(treeId)}/outcomes/${encodeURIComponent(outcomeId)}/publish`)
      .set("x-omytree-user-id", userId)
      .expect(200)
      .expect(({ body }) => {
        expect(body?.ok).toBe(true);
      });

    const { rowCount } = await pool.query(
      `SELECT 1
         FROM outcome_assets
        WHERE outcome_id = $1
        LIMIT 1`,
      [outcomeId]
    );
    expect(rowCount || 0).toBe(0);

    const docs = await listKnowledgeDocs({
      kbId: asset.knowledge_base_id,
      apiKey: "sk-outcome-unpublish-1",
    });
    expect(docs.length).toBe(0);

    const detailRes = await request(app)
      .get(`/api/tree/${encodeURIComponent(treeId)}/outcomes/${encodeURIComponent(outcomeId)}`)
      .set("x-omytree-user-id", userId)
      .expect(200);
    expect(detailRes.body?.asset).toBeNull();
  });

  it("is idempotent when mapping is already absent", async () => {
    const userId = await createTestUser("unpublish-2");
    await prepareWorkspace({ userId, apiKey: "sk-outcome-unpublish-2" });
    const { treeId, outcomeId } = await createTreeWithOutcome({ userId, label: "U2" });

    await request(app)
      .delete(`/api/tree/${encodeURIComponent(treeId)}/outcomes/${encodeURIComponent(outcomeId)}/publish`)
      .set("x-omytree-user-id", userId)
      .expect(200)
      .expect(({ body }) => {
        expect(body?.ok).toBe(true);
      });

    await request(app)
      .delete(`/api/tree/${encodeURIComponent(treeId)}/outcomes/${encodeURIComponent(outcomeId)}/publish`)
      .set("x-omytree-user-id", userId)
      .expect(200)
      .expect(({ body }) => {
        expect(body?.ok).toBe(true);
      });
  });
});
