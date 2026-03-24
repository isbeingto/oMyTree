import { afterEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import {
  assertWorkspaceMember,
  getOrCreatePersonalWorkspace,
  listWorkspacesForUser,
} from "../services/workspaces/store.js";

const pool = new Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: parseInt(process.env.PGPORT || "5432", 10),
  user: process.env.PGUSER || "omytree",
  password: process.env.PGPASSWORD || "test_password",
  database: process.env.PGDATABASE || "omytree",
});

let createdUserIds = [];
let createdWorkspaceIds = [];

async function createTestUser() {
  const email = `ws-test+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const { rows } = await pool.query(
    `INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id`,
    ["Workspace Test User", email]
  );
  const userId = rows[0]?.id;
  if (userId) createdUserIds.push(userId);
  return userId;
}

async function cleanup() {
  for (const workspaceId of createdWorkspaceIds) {
    await pool.query(`DELETE FROM workspaces WHERE id = $1`, [workspaceId]);
  }
  for (const userId of createdUserIds) {
    await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
  }
  createdWorkspaceIds = [];
  createdUserIds = [];
}

afterEach(async () => {
  await cleanup();
});

describe("workspaces store", () => {
  it("getOrCreatePersonalWorkspace is idempotent", async () => {
    const userId = await createTestUser();
    const first = await getOrCreatePersonalWorkspace({ userId });
    createdWorkspaceIds.push(first.id);

    const second = await getOrCreatePersonalWorkspace({ userId });
    expect(second.id).toBe(first.id);
    expect(second.kind).toBe("personal");
  });

  it("listWorkspacesForUser includes personal workspace", async () => {
    const userId = await createTestUser();
    const personal = await getOrCreatePersonalWorkspace({ userId });
    createdWorkspaceIds.push(personal.id);

    const list = await listWorkspacesForUser({ userId });
    const found = list.find((row) => row.id === personal.id);
    expect(found).toBeTruthy();
    expect(found.kind).toBe("personal");
    expect(found.role).toBe("owner");
  });

  it("assertWorkspaceMember rejects non-member", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const workspace = await getOrCreatePersonalWorkspace({ userId: userA });
    createdWorkspaceIds.push(workspace.id);

    let err = null;
    try {
      await assertWorkspaceMember({ workspaceId: workspace.id, userId: userB });
    } catch (e) {
      err = e;
    }
    expect(err).toBeTruthy();
    expect(err.status).toBe(403);
    expect(err.code).toBe("WORKSPACE_FORBIDDEN");
  });
});
