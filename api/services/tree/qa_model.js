import { pool } from '../../db/pool.js';
import { assertTreeOwnership } from '../../lib/tree_access.js';
import { HttpError } from '../../lib/errors.js';

function getTimestamp(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : null;
}

function toIsoString(value) {
  const time = getTimestamp(value);
  return time === null ? null : new Date(time).toISOString();
}

function compareNodesByTime(a, b) {
  const ta = getTimestamp(a?.created_at) ?? 0;
  const tb = getTimestamp(b?.created_at) ?? 0;
  if (ta !== tb) return ta - tb;

  const la = typeof a?.level === 'number' ? a.level : 0;
  const lb = typeof b?.level === 'number' ? b.level : 0;
  if (la !== lb) return la - lb;

  return String(a?.id || '').localeCompare(String(b?.id || ''));
}

function normalizeLegacyRoot(nodes) {
  const cloned = Array.isArray(nodes) ? nodes.map((n) => ({ ...n })) : [];
  const systemRoot = cloned.find(
    (n) => !n.parent_id && (n.role === 'system' || n.role === 'topic'),
  );
  if (!systemRoot) {
    return cloned;
  }

  const levelOffset = typeof systemRoot.level === 'number' ? 1 : 0;
  return cloned
    .filter((n) => n.id !== systemRoot.id)
    .map((n) => {
      const normalized = { ...n };
      if (normalized.parent_id === systemRoot.id) {
        normalized.parent_id = null;
      }
      if (typeof normalized.level === 'number' && levelOffset > 0) {
        normalized.level = Math.max(0, normalized.level - levelOffset);
      }
      return normalized;
    });
}

function findUserParentId(node, nodeMap) {
  let current = nodeMap.get(node?.parent_id);
  while (current) {
    if (current.role === 'user') {
      return current.id;
    }
    current = nodeMap.get(current.parent_id);
  }
  return null;
}

function sortChildrenIds(ids, orderIndex) {
  return [...ids].sort((a, b) => {
    const ia = orderIndex.get(a);
    const ib = orderIndex.get(b);
    if (typeof ia === 'number' && typeof ib === 'number') {
      return ia - ib;
    }
    return String(a || '').localeCompare(String(b || ''));
  });
}

function pickFirstAiNode(aiCandidates = []) {
  if (!Array.isArray(aiCandidates) || aiCandidates.length === 0) {
    return null;
  }
  const sorted = [...aiCandidates].sort(compareNodesByTime);
  return sorted[0] || null;
}

/**
 * 构建 QA 节点数组
 * 
 * @param {string} treeId - 树 ID
 * @param {Array} rawNodes - 节点数组
 * @param {Array} rawTurns - turns 数组（T28-0: 用于获取 ai_text）
 * @returns {Array} QA 节点数组
 * 
 * T28-0 修复说明：
 *   当 user 节点没有独立的 AI 子节点时，AI 回复存储在 turns 表中。
 *   此函数现在会先尝试从 AI 节点获取 ai_text，如果没有则从 turns 表获取。
 */
export function buildQANodesFromNodes(treeId, rawNodes = [], rawTurns = []) {
  const normalizedNodes = normalizeLegacyRoot(rawNodes);
  const nodeMap = new Map(normalizedNodes.map((n) => [n.id, n]));

  // T28-0: 构建 node_id -> turn 的映射，用于获取 ai_text
  const turnByNodeId = new Map();
  for (const turn of rawTurns) {
    // 每个 node 可能有多个 turns，取最新的（按 created_at 排序后最后一个）
    // rawTurns 已经按 created_at ASC 排序，所以后面的会覆盖前面的
    turnByNodeId.set(turn.node_id, turn);
  }

  const aiByParent = new Map();
  for (const node of normalizedNodes) {
    if (node.role !== 'ai') {
      continue;
    }
    if (!aiByParent.has(node.parent_id)) {
      aiByParent.set(node.parent_id, []);
    }
    aiByParent.get(node.parent_id).push(node);
  }

  const userNodes = normalizedNodes.filter((n) => n.role === 'user');
  const sortedUsers = [...userNodes].sort(compareNodesByTime);
  const userOrder = new Map(sortedUsers.map((n, idx) => [n.id, idx]));

  const childrenMap = new Map();
  const parentCache = new Map();
  for (const userNode of sortedUsers) {
    const parentId =
      parentCache.get(userNode.id) ?? findUserParentId(userNode, nodeMap);
    parentCache.set(userNode.id, parentId);
    if (!parentId) {
      continue;
    }
    if (!childrenMap.has(parentId)) {
      childrenMap.set(parentId, []);
    }
    childrenMap.get(parentId).push(userNode.id);
  }

  for (const [parentId, list] of childrenMap.entries()) {
    childrenMap.set(parentId, sortChildrenIds(list, userOrder));
  }

  return sortedUsers.map((userNode) => {
    const aiNode = pickFirstAiNode(aiByParent.get(userNode.id));
    const parentId = parentCache.get(userNode.id);
    const updatedAtCandidates = [
      getTimestamp(userNode.created_at),
      aiNode ? getTimestamp(aiNode.created_at) : null,
    ].filter((t) => t !== null);
    const updatedAt =
      updatedAtCandidates.length > 0
        ? new Date(Math.max(...updatedAtCandidates)).toISOString()
        : null;

    // T28-0: 如果没有独立的 AI 节点，从 turns 表获取 ai_text
    const turn = turnByNodeId.get(userNode.id);
    const aiText = aiNode?.text ?? turn?.ai_text ?? null;
    const aiNodeId = aiNode?.id ?? null;

    // KB-3.x: Extract knowledge selection metadata for UI display
    let knowledge = null;
    const usage = turn?.usage_json;
    if (usage && typeof usage === 'object') {
      knowledge = usage.knowledge || null;
    }

    return {
      id: userNode.id,
      tree_id: userNode.tree_id ?? treeId ?? null,
      user_node_id: userNode.id,
      user_text: typeof userNode.text === 'string' ? userNode.text : '',
      ai_node_id: aiNodeId,
      ai_text: aiText,
      parent_id: parentId ?? null,
      children_ids: childrenMap.get(userNode.id) ?? [],
      created_at: toIsoString(userNode.created_at),
      updated_at: updatedAt,
      // T28-0: 添加 provider/model/is_byok 字段（从 turn 获取）
      provider: turn?.provider ?? null,
      model: turn?.model ?? null,
      is_byok: turn?.is_byok ?? null,
      knowledge: knowledge,
    };
  });
}

async function loadNodesForTree(treeId, db) {
  const executor = db || pool;
  const { rows } = await executor.query(
    `SELECT id, tree_id, parent_id, level, role, text, created_at
       FROM nodes
      WHERE tree_id = $1
        AND soft_deleted_at IS NULL
      ORDER BY created_at ASC, level ASC, id ASC`,
    [treeId],
  );
  return rows;
}

/**
 * T28-0: 加载树的 turns 数据，用于获取 ai_text
 * 当节点没有独立的 AI 子节点时，AI 回复存储在 turns 表中
 */
async function loadTurnsForTree(treeId, db) {
  const executor = db || pool;
  const { rows } = await executor.query(
    `SELECT t.id, t.node_id, t.user_text, t.ai_text, t.status, t.created_at, 
            t.provider, t.model, t.is_byok, t.usage_json
       FROM turns t
       JOIN nodes n ON t.node_id = n.id
      WHERE n.tree_id = $1
        AND t.soft_deleted_at IS NULL
        AND n.soft_deleted_at IS NULL
      ORDER BY t.created_at ASC`,
    [treeId],
  );
  return rows;
}

export async function buildQANodesForTree(treeId, { userId, db = pool } = {}) {
  const normalizedTreeId = typeof treeId === 'string' ? treeId.trim() : '';
  const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';

  if (!normalizedTreeId || !normalizedUserId) {
    throw new HttpError({
      status: 422,
      code: 'INVALID_QA_INPUT',
      message: 'treeId and userId are required',
    });
  }

  const executor = db || pool;
  await assertTreeOwnership(executor, normalizedTreeId, normalizedUserId);
  const nodes = await loadNodesForTree(normalizedTreeId, executor);
  // T28-0: 加载 turns 数据以获取 ai_text
  const turns = await loadTurnsForTree(normalizedTreeId, executor);
  return buildQANodesFromNodes(normalizedTreeId, nodes, turns);
}

export default {
  buildQANodesForTree,
  buildQANodesFromNodes,
};
