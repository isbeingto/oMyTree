import { afterEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { encryptApiKey } from "../lib/api_key_crypto.js";
import { getWorkspaceWeKnoraApiKey } from "../services/workspaces/weknora_credentials.js";
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
  const email = `weknora-cred+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const { rows } = await pool.query(
    `INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id`,
    ["WeKnora Cred User", email]
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

describe("workspace weknora credentials", () => {
  it("decrypts workspace api key", async () => {
    const userId = await createTestUser();
    const client = await pool.connect();
    try {
      const workspace = await getOrCreatePersonalWorkspace({ client, userId });
      createdWorkspaceIds.push(workspace.id);

      const encrypted = encryptApiKey("sk-test-weknora");
      await client.query(
        `UPDATE workspaces
            SET weknora_api_key_encrypted = $1
          WHERE id = $2`,
        [encrypted, workspace.id]
      );

      const apiKey = await getWorkspaceWeKnoraApiKey({ client, workspaceId: workspace.id });
      expect(apiKey).toBe("sk-test-weknora");
    } finally {
      client.release();
    }
  });

  it("throws workspace_weknora_key_missing when empty", async () => {
    const userId = await createTestUser();
    const client = await pool.connect();
    try {
      const workspace = await getOrCreatePersonalWorkspace({ client, userId });
      createdWorkspaceIds.push(workspace.id);

      let err = null;
      try {
        await getWorkspaceWeKnoraApiKey({ client, workspaceId: workspace.id });
      } catch (e) {
        err = e;
      }
      expect(err).toBeTruthy();
      expect(err.code).toBe("workspace_weknora_key_missing");
    } finally {
      client.release();
    }
  });

  it("throws workspace_weknora_key_decrypt_failed when invalid ciphertext", async () => {
    const userId = await createTestUser();
    const client = await pool.connect();
    try {
      const workspace = await getOrCreatePersonalWorkspace({ client, userId });
      createdWorkspaceIds.push(workspace.id);

      await client.query(
        `UPDATE workspaces
            SET weknora_api_key_encrypted = $1
          WHERE id = $2`,
        ["invalid-ciphertext", workspace.id]
      );

      let err = null;
      try {
        await getWorkspaceWeKnoraApiKey({ client, workspaceId: workspace.id });
      } catch (e) {
        err = e;
      }
      expect(err).toBeTruthy();
      expect(err.code).toBe("workspace_weknora_key_decrypt_failed");
    } finally {
      client.release();
    }
  });
});

