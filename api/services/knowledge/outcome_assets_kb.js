import { validate as uuidValidate } from "uuid";

import { pool } from "../../db/pool.js";
import { HttpError } from "../../lib/errors.js";
import { requestWeKnoraJson } from "../../routes/knowledge/proxy.js";

export const OUTCOME_ASSETS_KB_NAME = "成果资产库";
export const OUTCOME_ASSETS_KB_DESCRIPTION = "oMyTree 自动沉淀的成果报告（可回链）";

function normalizeWorkspaceId(workspaceId) {
  if (typeof workspaceId !== "string") {
    throw new HttpError({
      status: 422,
      code: "INVALID_WORKSPACE_ID",
      message: "workspaceId must be a valid uuid",
    });
  }

  const trimmed = workspaceId.trim();
  if (!uuidValidate(trimmed)) {
    throw new HttpError({
      status: 422,
      code: "INVALID_WORKSPACE_ID",
      message: "workspaceId must be a valid uuid",
    });
  }
  return trimmed;
}

function normalizeKnowledgeBaseId(raw) {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  return trimmed || "";
}

function pickOutcomeAssetsKnowledgeBaseId(list) {
  if (!Array.isArray(list)) return "";

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (name !== OUTCOME_ASSETS_KB_NAME) continue;

    const id = normalizeKnowledgeBaseId(item.id);
    if (id) return id;
  }
  return "";
}

async function withClient(client, handler) {
  if (client) return handler(client);
  const pooled = await pool.connect();
  try {
    return await handler(pooled);
  } finally {
    pooled.release();
  }
}

export async function ensureOutcomeAssetsKnowledgeBase({ pg, res, workspaceId }) {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);

  return withClient(pg, async (db) => {
    const { rows } = await db.query(
      `SELECT outcome_kb_id
         FROM workspaces
        WHERE id = $1
        LIMIT 1`,
      [normalizedWorkspaceId]
    );

    const workspace = rows[0];
    if (!workspace) {
      throw new HttpError({
        status: 404,
        code: "WORKSPACE_NOT_FOUND",
        message: "workspace not found",
      });
    }

    const existingKbId = normalizeKnowledgeBaseId(workspace.outcome_kb_id);
    if (existingKbId) {
      return { knowledgeBaseId: existingKbId, created: false };
    }

    const bases = await requestWeKnoraJson({
      method: "GET",
      path: "/knowledge-bases",
      res,
    });
    const reusedKbId = pickOutcomeAssetsKnowledgeBaseId(bases);

    if (reusedKbId) {
      await db.query(
        `UPDATE workspaces
            SET outcome_kb_id = $1,
                updated_at = NOW()
          WHERE id = $2`,
        [reusedKbId, normalizedWorkspaceId]
      );
      return { knowledgeBaseId: reusedKbId, created: false };
    }

    const created = await requestWeKnoraJson({
      method: "POST",
      path: "/knowledge-bases",
      body: {
        name: OUTCOME_ASSETS_KB_NAME,
        description: OUTCOME_ASSETS_KB_DESCRIPTION,
      },
      res,
    });

    const createdKbId = normalizeKnowledgeBaseId(created?.id);
    if (!createdKbId) {
      throw new HttpError({
        status: 502,
        code: "WEKNORA_KB_CREATE_INVALID_RESPONSE",
        message: "invalid WeKnora response while creating outcome assets knowledge base",
      });
    }

    await db.query(
      `UPDATE workspaces
          SET outcome_kb_id = $1,
              updated_at = NOW()
        WHERE id = $2`,
      [createdKbId, normalizedWorkspaceId]
    );

    return { knowledgeBaseId: createdKbId, created: true };
  });
}

export default {
  ensureOutcomeAssetsKnowledgeBase,
  OUTCOME_ASSETS_KB_NAME,
  OUTCOME_ASSETS_KB_DESCRIPTION,
};

