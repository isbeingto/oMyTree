import { afterEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { requireWorkspaceContext } from "../middleware/workspace_context.js";
import { getOrCreatePersonalWorkspace } from "../services/workspaces/store.js";

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
  const email = `ws-ctx+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const { rows } = await pool.query(
    `INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id`,
    ["Workspace Context User", email]
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

function makeReq(headers = {}) {
  return {
    headers,
    get(name) {
      return headers[name] || headers[name?.toLowerCase?.()] || undefined;
    },
  };
}

function makeRes() {
  return { locals: {} };
}

async function runMiddleware(middleware, req, res) {
  return new Promise((resolve, reject) => {
    middleware(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

afterEach(async () => {
  await cleanup();
});

describe("workspace context middleware", () => {
  it("uses header workspace when member", async () => {
    const userId = await createTestUser();
    const client = await pool.connect();
    try {
      const personal = await getOrCreatePersonalWorkspace({ client, userId });
      createdWorkspaceIds.push(personal.id);

      const middleware = requireWorkspaceContext(client);
      const req = makeReq({
        "x-omytree-user-id": userId,
        "x-omytree-workspace-id": personal.id,
      });
      const res = makeRes();
      await runMiddleware(middleware, req, res);

      expect(res.locals.authUserId).toBe(userId);
      expect(res.locals.workspaceId).toBe(personal.id);
      expect(res.locals.workspaceRole).toBe("owner");
    } finally {
      client.release();
    }
  });

  it("creates personal workspace when missing active", async () => {
    const userId = await createTestUser();
    const client = await pool.connect();
    try {
      const middleware = requireWorkspaceContext(client, { allowPersonalFallback: true });
      const req = makeReq({ "x-omytree-user-id": userId });
      const res = makeRes();
      await runMiddleware(middleware, req, res);

      expect(res.locals.authUserId).toBe(userId);
      expect(res.locals.workspaceId).toBeTruthy();

      const { rows } = await client.query(
        `SELECT active_workspace_id FROM users WHERE id = $1`,
        [userId]
      );
      const activeId = rows[0]?.active_workspace_id;
      expect(activeId).toBeTruthy();
      createdWorkspaceIds.push(activeId);
    } finally {
      client.release();
    }
  });
});
