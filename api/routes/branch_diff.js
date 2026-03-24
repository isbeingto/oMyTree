/**
 * P1-2: BranchDiff API - 对比两条路径的关键差异
 *
 * Compares two paths (by node_id_a/node_id_b or path_snapshot_id_a/b)
 * and returns structured diff points that can jump back to context nodes.
 *
 * Route:
 * - POST /api/tree/:treeId/branch-diff
 *
 * @version P1-2
 */

import express from "express";
import { validate as uuidValidate } from "uuid";
import crypto from "crypto";

import { HttpError, wrapAsync } from "../lib/errors.js";
import { getAuthUserIdForRequest } from "../lib/auth_user.js";
import { assertTreeOwnership } from "../lib/tree_access.js";
import { withTraceId } from "../lib/trace.js";
import { logProcessEvent } from "../lib/process_event.js";

const PROMPT_VERSION = "branch_diff_v1_structured";
const MAX_PATH_DEPTH = 2000;
const MAX_PREVIEW_CHARS = 160;

function assertUuid(value, { code, message } = {}) {
  if (!value || typeof value !== "string" || !uuidValidate(value)) {
    throw new HttpError({
      status: 422,
      code: code || "INVALID_UUID",
      message: message || "invalid uuid",
    });
  }
}

function computeChecksum(content) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

function normalizePreview(text) {
  if (!text) return "";
  const compact = text.toString().replace(/\s+/g, " ").trim();
  if (compact.length <= MAX_PREVIEW_CHARS) return compact;
  return `${compact.slice(0, MAX_PREVIEW_CHARS)}...`;
}

async function fetchPathFromNode(pg, { treeId, nodeId }) {
  const { rows } = await pg.query(
    `WITH RECURSIVE path AS (
       SELECT id, parent_id, role, text, created_at, 1 as depth
       FROM nodes
       WHERE id = $1 AND tree_id = $2
       UNION ALL
       SELECT n.id, n.parent_id, n.role, n.text, n.created_at, p.depth + 1
       FROM nodes n
       INNER JOIN path p ON n.id = p.parent_id
       WHERE n.tree_id = $2 AND p.depth < $3
     )
     SELECT id, parent_id, role, text, created_at, depth
     FROM path
     ORDER BY depth DESC`,
    [nodeId, treeId, MAX_PATH_DEPTH]
  );

  return rows;
}

async function fetchPathSnapshot(pg, { treeId, snapshotId }) {
  const { rows } = await pg.query(
    `SELECT id, created_at, prompt_version, input
     FROM artifact_versions
     WHERE id = $1 AND tree_id = $2 AND artifact_type = 'path_snapshot'`,
    [snapshotId, treeId]
  );

  if (rows.length === 0) {
    throw new HttpError({
      status: 404,
      code: "SNAPSHOT_NOT_FOUND",
      message: "PathSnapshot not found",
    });
  }

  const snapshot = rows[0];
  const nodeIds = Array.isArray(snapshot?.input?.node_ids)
    ? snapshot.input.node_ids
    : [];

  if (nodeIds.length === 0) {
    throw new HttpError({
      status: 400,
      code: "SNAPSHOT_EMPTY",
      message: "PathSnapshot has no node_ids",
      hint: "Ensure the snapshot includes node_ids in input metadata.",
    });
  }

  for (const nodeId of nodeIds) {
    assertUuid(nodeId, { code: "INVALID_NODE_ID", message: "invalid node id" });
  }

  return { snapshot, nodeIds };
}

function findCommonPrefixLength(listA, listB) {
  const max = Math.min(listA.length, listB.length);
  let idx = 0;
  while (idx < max && listA[idx] === listB[idx]) idx += 1;
  return idx;
}

function buildDiffMarkdown({
  diffPoints,
  sharedNodeId,
  totalA,
  totalB,
  sharedCount,
}) {
  const lines = [];
  lines.push("# Branch Diff");
  lines.push("");
  lines.push(`> Generated at ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Overview");
  lines.push("");
  lines.push(`- Path A nodes: ${totalA}`);
  lines.push(`- Path B nodes: ${totalB}`);
  lines.push(`- Shared prefix: ${sharedCount}`);
  if (sharedNodeId) {
    lines.push(`- Divergence after: ${sharedNodeId}`);
  }
  lines.push("");

  diffPoints.forEach((point, index) => {
    lines.push(`## Diff Point ${index + 1}`);
    lines.push("");
    lines.push(`- **Summary**: ${point.summary}`);
    lines.push(`- **Rationale**: ${point.rationale}`);

    const jumpA = point.node_ids_a?.[0];
    const jumpB = point.node_ids_b?.[0];
    if (jumpA) {
      lines.push(`- **Jump A**: [[Jump to Context]](jump:${jumpA})`);
    }
    if (jumpB) {
      lines.push(`- **Jump B**: [[Jump to Context]](jump:${jumpB})`);
    }
    lines.push("");
  });

  return lines.join("\n");
}

export default function createBranchDiffRouter(pg) {
  const router = express.Router();

  /**
   * POST /api/tree/:treeId/branch-diff
   * Compare two paths and return structured diff points
   */
  router.post(
    "/:treeId/branch-diff",
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pg);
      const treeId = (req.params.treeId || "").trim();
      const nodeIdA = req.body?.node_id_a ? String(req.body.node_id_a).trim() : null;
      const nodeIdB = req.body?.node_id_b ? String(req.body.node_id_b).trim() : null;
      const snapshotIdA = req.body?.path_snapshot_id_a
        ? String(req.body.path_snapshot_id_a).trim()
        : null;
      const snapshotIdB = req.body?.path_snapshot_id_b
        ? String(req.body.path_snapshot_id_b).trim()
        : null;

      assertUuid(treeId, { code: "INVALID_TREE_ID", message: "invalid tree id" });
      await assertTreeOwnership(pg, treeId, userId);

      const hasNodePair = nodeIdA && nodeIdB;
      const hasSnapshotPair = snapshotIdA && snapshotIdB;

      if (!hasNodePair && !hasSnapshotPair) {
        throw new HttpError({
          status: 400,
          code: "INVALID_INPUT",
          message: "node_id_a/node_id_b or path_snapshot_id_a/path_snapshot_id_b is required",
        });
      }

      if (hasNodePair && hasSnapshotPair) {
        throw new HttpError({
          status: 400,
          code: "INVALID_INPUT",
          message: "Provide either node ids or path snapshot ids, not both",
        });
      }

      let pathA = [];
      let pathB = [];
      let pathNodeIdsA = [];
      let pathNodeIdsB = [];
      let snapshotMetaA = null;
      let snapshotMetaB = null;

      if (hasSnapshotPair) {
        assertUuid(snapshotIdA, { code: "INVALID_SNAPSHOT_ID", message: "invalid snapshot id" });
        assertUuid(snapshotIdB, { code: "INVALID_SNAPSHOT_ID", message: "invalid snapshot id" });

        const snapshotA = await fetchPathSnapshot(pg, { treeId, snapshotId: snapshotIdA });
        const snapshotB = await fetchPathSnapshot(pg, { treeId, snapshotId: snapshotIdB });

        pathNodeIdsA = snapshotA.nodeIds;
        pathNodeIdsB = snapshotB.nodeIds;
        snapshotMetaA = snapshotA.snapshot;
        snapshotMetaB = snapshotB.snapshot;
      } else {
        assertUuid(nodeIdA, { code: "INVALID_NODE_ID", message: "invalid node id" });
        assertUuid(nodeIdB, { code: "INVALID_NODE_ID", message: "invalid node id" });

        pathA = await fetchPathFromNode(pg, { treeId, nodeId: nodeIdA });
        if (pathA.length === 0) {
          throw new HttpError({
            status: 404,
            code: "NODE_NOT_FOUND",
            message: "node_id_a not found",
          });
        }

        pathB = await fetchPathFromNode(pg, { treeId, nodeId: nodeIdB });
        if (pathB.length === 0) {
          throw new HttpError({
            status: 404,
            code: "NODE_NOT_FOUND",
            message: "node_id_b not found",
          });
        }

        pathNodeIdsA = pathA.map((node) => node.id);
        pathNodeIdsB = pathB.map((node) => node.id);
      }

      const sharedPrefixLen = findCommonPrefixLength(pathNodeIdsA, pathNodeIdsB);
      const sharedNodeId = sharedPrefixLen > 0 ? pathNodeIdsA[sharedPrefixLen - 1] : null;
      const diffNodesA = pathNodeIdsA.slice(sharedPrefixLen);
      const diffNodesB = pathNodeIdsB.slice(sharedPrefixLen);

      const fetchNodeIds = Array.from(new Set([sharedNodeId, ...diffNodesA, ...diffNodesB].filter(Boolean)));
      const nodeMap = new Map();
      const warnings = [];

      if (fetchNodeIds.length > 0) {
        const { rows: nodes } = await pg.query(
          `SELECT id, parent_id, role, text, created_at
           FROM nodes
           WHERE tree_id = $1 AND id = ANY($2::uuid[])`,
          [treeId, fetchNodeIds]
        );

        nodes.forEach((row) => {
          nodeMap.set(row.id, row);
        });

        const missing = fetchNodeIds.filter((id) => !nodeMap.has(id));
        if (missing.length > 0) {
          warnings.push({
            code: "MISSING_NODES",
            message: "Some nodes are missing from the tree",
            node_ids: missing,
          });
        }
      }

      const lastNodeA = diffNodesA.length ? nodeMap.get(diffNodesA[diffNodesA.length - 1]) : null;
      const lastNodeB = diffNodesB.length ? nodeMap.get(diffNodesB[diffNodesB.length - 1]) : null;

      let summary = "";
      let rationale = "";

      if (diffNodesA.length === 0 && diffNodesB.length === 0) {
        summary = `Paths are identical (${pathNodeIdsA.length} shared step(s))`;
        rationale = "No divergence detected between the two paths.";
      } else if (diffNodesA.length === 0) {
        summary = `Path B continues beyond Path A after ${sharedPrefixLen} shared step(s)`;
        rationale = `Path A stops at ${sharedNodeId || "the start"}; Path B adds ${diffNodesB.length} step(s) ending at ${lastNodeB?.id || "unknown"}.`;
      } else if (diffNodesB.length === 0) {
        summary = `Path A continues beyond Path B after ${sharedPrefixLen} shared step(s)`;
        rationale = `Path B stops at ${sharedNodeId || "the start"}; Path A adds ${diffNodesA.length} step(s) ending at ${lastNodeA?.id || "unknown"}.`;
      } else {
        summary = `Paths diverge after ${sharedPrefixLen} shared step(s)`;
        rationale = `Path A proceeds to ${lastNodeA?.id || "unknown"} (${normalizePreview(lastNodeA?.text)}); `
          + `Path B proceeds to ${lastNodeB?.id || "unknown"} (${normalizePreview(lastNodeB?.text)}).`;
      }

      const diffPoints = [
        {
          summary,
          node_ids_a: diffNodesA,
          node_ids_b: diffNodesB,
          rationale,
        },
      ];

      const inputMeta = {
        node_id_a: nodeIdA,
        node_id_b: nodeIdB,
        path_snapshot_id_a: snapshotIdA,
        path_snapshot_id_b: snapshotIdB,
        snapshot_prompt_a: snapshotMetaA?.prompt_version || null,
        snapshot_prompt_b: snapshotMetaB?.prompt_version || null,
        node_ids_a: pathNodeIdsA,
        node_ids_b: pathNodeIdsB,
        shared_prefix_len: sharedPrefixLen,
        shared_node_id: sharedNodeId,
        diff_points_count: diffPoints.length,
        algorithm_version: "branch_diff_v1_prefix_compare",
      };

      const contentMarkdown = buildDiffMarkdown({
        diffPoints,
        sharedNodeId,
        totalA: pathNodeIdsA.length,
        totalB: pathNodeIdsB.length,
        sharedCount: sharedPrefixLen,
      });

      const checksum = computeChecksum(contentMarkdown);
      const { rows: insertedRows } = await pg.query(
        `INSERT INTO artifact_versions (
          artifact_type,
          tree_id,
          created_by,
          provider,
          model,
          prompt_version,
          input,
          content_markdown,
          checksum
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, created_at`,
        [
          "branch_diff",
          treeId,
          userId,
          null,
          null,
          PROMPT_VERSION,
          JSON.stringify(inputMeta),
          contentMarkdown,
          checksum,
        ]
      );

      const artifactId = insertedRows[0].id;
      const createdAt = insertedRows[0].created_at;

      try {
        await logProcessEvent(pg, {
          tree_id: treeId,
          scope_node_id: sharedNodeId || null,
          event_type: "branch.diff_generated",
          meta: {
            artifact_id: artifactId,
            node_id_a: nodeIdA,
            node_id_b: nodeIdB,
            path_snapshot_id_a: snapshotIdA,
            path_snapshot_id_b: snapshotIdB,
            shared_prefix_len: sharedPrefixLen,
            diff_points_count: diffPoints.length,
          },
        });
      } catch (evtErr) {
        console.warn("[branch-diff] process_event write failed:", evtErr.message);
      }

      res.status(200).json(
        withTraceId(res, {
          ok: true,
          diff: {
            id: artifactId,
            created_at: createdAt,
            prompt_version: PROMPT_VERSION,
            input: inputMeta,
          },
          diff_points: diffPoints,
          warnings,
          content_markdown: contentMarkdown,
        })
      );
    })
  );

  return router;
}