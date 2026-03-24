import { validate as uuidValidate } from "uuid";
import { HttpError } from "./errors.js";

function buildNotFound(code = "TREE_NOT_FOUND", message = "tree not found") {
  return new HttpError({
    status: 404,
    code,
    message,
  });
}

function buildInvalid(code = "INVALID_TREE_ID", message = "invalid tree id") {
  return new HttpError({
    status: 422,
    code,
    message,
  });
}

export async function assertTreeOwnership(db, treeId, userId, { selectColumns = ["id"] } = {}) {
  if (!treeId || typeof treeId !== "string") {
    throw buildInvalid();
  }
  const normalizedId = treeId.trim();
  if (!uuidValidate(normalizedId)) {
    throw buildInvalid();
  }

  const columns = Array.isArray(selectColumns) && selectColumns.length > 0
    ? selectColumns.join(", ")
    : "id";

  const { rows } = await db.query(
    `SELECT ${columns}
       FROM trees
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [normalizedId, userId]
  );
  const row = rows[0];
  if (!row) {
    throw buildNotFound();
  }
  return row;
}

export async function assertNodeOwnership(db, nodeId, userId, { selectColumns = ["n.id", "n.tree_id"] } = {}) {
  if (!nodeId || typeof nodeId !== "string") {
    throw buildInvalid("INVALID_NODE_ID", "invalid node id");
  }
  const normalizedId = nodeId.trim();
  if (!uuidValidate(normalizedId)) {
    throw buildInvalid("INVALID_NODE_ID", "invalid node id");
  }

  const selection = Array.isArray(selectColumns) && selectColumns.length > 0
    ? selectColumns.join(", ")
    : "n.id, n.tree_id";

  const { rows } = await db.query(
    `SELECT ${selection}
       FROM nodes n
       JOIN trees t ON t.id = n.tree_id
      WHERE n.id = $1
        AND t.user_id = $2
      LIMIT 1`,
    [normalizedId, userId]
  );
  const row = rows[0];
  if (!row) {
    throw new HttpError({
      status: 404,
      code: "NODE_NOT_FOUND",
      message: "node not found",
    });
  }
  return row;
}
