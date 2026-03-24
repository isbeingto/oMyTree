import { afterEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { attachWorkspaceWeKnoraCredentials } from "../middleware/workspace_weknora_credentials.js";
import { encryptApiKey } from "../lib/api_key_crypto.js";
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
  const email = `ws-weknora-mid+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const { rows } = await pool.query(
    `INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id`,
    ["Workspace WeKnora Middleware User", email]
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

function makeRes(workspaceId) {
  return { locals: workspaceId ? { workspaceId } : {} };
}

async function runMiddleware(middleware, res) {
  return new Promise((resolve, reject) => {
    middleware({}, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

afterEach(async () => {
  await cleanup();
});

describe("workspace weknora credentials middleware", () => {
  it("injects res.locals.weknoraApiKey when configured", async () => {
    const userId = await createTestUser();
    const client = await pool.connect();
    try {
      const ws = await getOrCreatePersonalWorkspace({ client, userId });
      createdWorkspaceIds.push(ws.id);
      await client.query(
        `UPDATE workspaces SET weknora_api_key_encrypted = $1 WHERE id = $2`,
        [encryptApiKey("sk-ws-mid"), ws.id]
      );

      const middleware = attachWorkspaceWeKnoraCredentials(client, { required: true });
      const res = makeRes(ws.id);
      await runMiddleware(middleware, res);
      expect(res.locals.weknoraApiKey).toBe("sk-ws-mid");
    } finally {
      client.release();
    }
  });

  it("fails when required=true and missing key", async () => {
    const userId = await createTestUser();
    const client = await pool.connect();
    try {
      const ws = await getOrCreatePersonalWorkspace({ client, userId });
      createdWorkspaceIds.push(ws.id);

      const middleware = attachWorkspaceWeKnoraCredentials(client, { required: true });
      const res = makeRes(ws.id);

      let err = null;
      try {
        await runMiddleware(middleware, res);
      } catch (e) {
        err = e;
      }
      expect(err).toBeTruthy();
      expect(err.code).toBe("workspace_weknora_key_missing");
    } finally {
      client.release();
    }
  });
});

