import express from "express";
import request from "supertest";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { pool } from "../db/pool.js";
import { respondWithError } from "../lib/errors.js";
import createWorkspacesRouter from "../routes/workspaces.js";

let app = null;

let createdUserIds = [];
let createdUsersByLabel = new Map();

async function createTestUser(label) {
  const safeLabel = String(label || "").toLowerCase();
  const email = `ws-members+${safeLabel}+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const { rows } = await pool.query(`INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id, email`, [
    `WS Members ${label}`,
    email,
  ]);
  const user = rows[0];
  if (user?.id) {
    createdUserIds.push(user.id);
    createdUsersByLabel.set(label, { id: user.id, email: user.email });
  }
  return user;
}

async function cleanup() {
  if (createdUserIds.length > 0) {
    await pool.query(`DELETE FROM workspaces WHERE owner_user_id = ANY($1::uuid[])`, [createdUserIds]);
  }
  for (const userId of createdUserIds) {
    await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
  }
  createdUserIds = [];
  createdUsersByLabel = new Map();
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

describe("P2-API-002 Workspace members API", () => {
  it("owner can add/update/remove members; members cannot manage", async () => {
    const userA = await createTestUser("A");
    const userB = await createTestUser("B");
    const userC = await createTestUser("C");
    expect(userA?.id && userB?.id && userC?.id).toBeTruthy();

    // Ensure personal workspace exists for A (used to test not-team restriction)
    const listA = await request(app).get("/api/workspaces").set("x-omytree-user-id", userA.id).expect(200);
    const personalA = listA.body?.data?.find?.((w) => w.kind === "personal");
    expect(personalA?.id).toBeTruthy();

    const teamCreate = await request(app)
      .post("/api/workspaces")
      .set("x-omytree-user-id", userA.id)
      .send({ name: "Team A" })
      .expect(201);
    const teamId = String(teamCreate.body?.data?.id || "");
    expect(teamCreate.body?.data?.kind).toBe("team");
    expect(teamCreate.body?.data?.role).toBe("owner");
    expect(teamId).toBeTruthy();

    // Cannot manage members on personal workspace
    await request(app)
      .post(`/api/workspaces/${encodeURIComponent(personalA.id)}/members`)
      .set("x-omytree-user-id", userA.id)
      .send({ email: userB.email, role: "member" })
      .expect(422);

    // Add member B by email (default role member)
    const addB = await request(app)
      .post(`/api/workspaces/${encodeURIComponent(teamId)}/members`)
      .set("x-omytree-user-id", userA.id)
      .send({ email: userB.email })
      .expect(201);
    expect(addB.body?.ok).toBe(true);
    expect(addB.body?.data?.user_id).toBe(userB.id);
    expect(addB.body?.data?.role).toBe("member");

    // Any member can list members
    const listMembers = await request(app)
      .get(`/api/workspaces/${encodeURIComponent(teamId)}/members`)
      .set("x-omytree-user-id", userB.id)
      .expect(200);
    expect(listMembers.body?.ok).toBe(true);
    const members = Array.isArray(listMembers.body?.data) ? listMembers.body.data : [];
    expect(members.some((m) => m.user_id === userA.id && m.role === "owner")).toBe(true);
    expect(members.some((m) => m.user_id === userB.id && m.role === "member")).toBe(true);

    // Member cannot add others
    await request(app)
      .post(`/api/workspaces/${encodeURIComponent(teamId)}/members`)
      .set("x-omytree-user-id", userB.id)
      .send({ email: userC.email })
      .expect(403);

    // Member cannot update role
    await request(app)
      .patch(`/api/workspaces/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userB.id)}`)
      .set("x-omytree-user-id", userB.id)
      .send({ role: "admin" })
      .expect(403);

    // Owner updates B to admin
    const promote = await request(app)
      .patch(`/api/workspaces/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userB.id)}`)
      .set("x-omytree-user-id", userA.id)
      .send({ role: "admin" })
      .expect(200);
    expect(promote.body?.ok).toBe(true);
    expect(promote.body?.data?.role).toBe("admin");

    // Owner cannot remove owner
    await request(app)
      .delete(`/api/workspaces/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userA.id)}`)
      .set("x-omytree-user-id", userA.id)
      .expect(403);

    // Owner removes B
    await request(app)
      .delete(`/api/workspaces/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userB.id)}`)
      .set("x-omytree-user-id", userA.id)
      .expect(200);

    // Removed user cannot activate team workspace
    await request(app)
      .post(`/api/workspaces/${encodeURIComponent(teamId)}/activate`)
      .set("x-omytree-user-id", userB.id)
      .expect(403);
  });
});
