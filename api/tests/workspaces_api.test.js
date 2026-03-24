import express from "express";
import request from "supertest";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { pool } from "../db/pool.js";
import { respondWithError } from "../lib/errors.js";
import createWorkspacesRouter from "../routes/workspaces.js";

let app = null;

let createdUserIds = [];

async function createTestUser(label) {
  const email = `ws-api+${label}+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const { rows } = await pool.query(`INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id`, [
    `WS API ${label}`,
    email,
  ]);
  const userId = rows[0]?.id;
  if (userId) createdUserIds.push(userId);
  return userId;
}

async function cleanup() {
  if (createdUserIds.length > 0) {
    await pool.query(`DELETE FROM workspaces WHERE owner_user_id = ANY($1::uuid[])`, [createdUserIds]);
  }
  for (const userId of createdUserIds) {
    await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
  }
  createdUserIds = [];
}

beforeAll(() => {
  app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(createWorkspacesRouter(pool));
  app.use((err, _req, res, _next) => {
    respondWithError(res, err);
  });
});

afterEach(async () => {
  await cleanup();
});

describe("P2-API-001 Workspace API", () => {
  it("GET /api/workspaces returns personal workspace and active_workspace_id", async () => {
    const userId = await createTestUser("list");

    const res = await request(app)
      .get("/api/workspaces")
      .set("x-omytree-user-id", userId)
      .expect(200);

    expect(res.body?.ok).toBe(true);
    expect(typeof res.body?.active_workspace_id).toBe("string");
    expect(Array.isArray(res.body?.data)).toBe(true);
    expect(res.body.data.some((w) => w.kind === "personal")).toBe(true);

    const personal = res.body.data.find((w) => w.kind === "personal");
    expect(personal?.weknora_api_key_encrypted).toBeUndefined();
    expect(personal?.weknora_configured).toBe(false);
  });

  it("POST /api/workspaces creates a team workspace and user can activate it", async () => {
    const userId = await createTestUser("create");

    // list to ensure personal exists and capture ids for cleanup
    const list1 = await request(app)
      .get("/api/workspaces")
      .set("x-omytree-user-id", userId)
      .expect(200);

    const createRes = await request(app)
      .post("/api/workspaces")
      .set("x-omytree-user-id", userId)
      .send({ name: "My Team" })
      .expect(201);
    expect(createRes.body?.ok).toBe(true);
    expect(createRes.body?.data?.kind).toBe("team");
    expect(createRes.body?.data?.role).toBe("owner");

    const activateRes = await request(app)
      .post(`/api/workspaces/${encodeURIComponent(createRes.body.data.id)}/activate`)
      .set("x-omytree-user-id", userId)
      .expect(200);
    expect(activateRes.body?.ok).toBe(true);
    expect(activateRes.body?.active_workspace_id).toBe(createRes.body.data.id);

    const list2 = await request(app)
      .get("/api/workspaces")
      .set("x-omytree-user-id", userId)
      .expect(200);
    expect(list2.body?.active_workspace_id).toBe(createRes.body.data.id);
    const active = list2.body.data.find((w) => w.id === createRes.body.data.id);
    expect(active?.is_active).toBe(true);
  });

  it("cannot activate a workspace without membership", async () => {
    const userA = await createTestUser("A");
    const userB = await createTestUser("B");

    const listA = await request(app)
      .get("/api/workspaces")
      .set("x-omytree-user-id", userA)
      .expect(200);

    const created = await request(app)
      .post("/api/workspaces")
      .set("x-omytree-user-id", userA)
      .send({ name: "A Team" })
      .expect(201);

    await request(app)
      .post(`/api/workspaces/${encodeURIComponent(created.body.data.id)}/activate`)
      .set("x-omytree-user-id", userB)
      .expect(403);
  });
});
