import { validate as uuidValidate } from "uuid";

import { HttpError } from "../../lib/errors.js";

function coerceBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
  }
  if (typeof value === "number") {
    return value === 1;
  }
  return false;
}

function buildChildrenMap(nodes) {
  const map = new Map();
  for (const node of nodes) {
    if (!node.parent_id) {
      continue;
    }
    if (!map.has(node.parent_id)) {
      map.set(node.parent_id, []);
    }
    map.get(node.parent_id).push(node.id);
  }
  return map;
}

function markExcludedDescendants(nodeId, childrenMap, excluded) {
  const stack = [nodeId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (excluded.has(current)) {
      continue;
    }
    excluded.add(current);
    const children = childrenMap.get(current);
    if (children && children.length > 0) {
      for (const childId of children) {
        stack.push(childId);
      }
    }
  }
}

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function normalizeTreeRow(row) {
  if (!row) {
    return null;
  }

  const summary = row.tree_summary || null;
  const summaryText =
    typeof summary === "string"
      ? summary
      : summary && typeof summary === "object"
        ? summary.text || summary.summary || summary.content || null
        : null;
  const summaryUpdatedAt =
    summary && typeof summary === "object" && summary.updated_at
      ? toIso(summary.updated_at)
      : null;
  const summaryError = row.tree_summary_last_error || null;
  const summaryErrorAt = toIso(row.tree_summary_last_error_at || null);

  return {
    id: row.id,
    topic: row.topic,
    created_by: row.created_by,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
    context_profile: row.context_profile || "lite",
    memory_scope: row.memory_scope || "branch",
    tree_summary: summary,
    tree_summary_text: summaryText,
    tree_summary_updated_at: summaryUpdatedAt,
    tree_summary_last_error: summaryError,
    tree_summary_last_error_at: summaryErrorAt,
  };
}

function shapeNode(row, { includeSoftDeleted, attachmentsMap = new Map() }) {
  const attachments = attachmentsMap.get(row.id) || [];
  const shaped = {
    id: row.id,
    parent_id: row.parent_id,
    level: row.level,
    role: row.role,
    text: row.text,
    reasoning_content: typeof row.reasoning_content === "string" ? row.reasoning_content : row.reasoning_content ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
    provider: row.provider ?? null,
    model: row.model ?? null,
    is_byok: typeof row.is_byok === 'boolean' ? row.is_byok : row.is_byok ?? null,
    attachments: attachments.length > 0 ? attachments : undefined, // T85-fix
  };
  if (includeSoftDeleted) {
    shaped.soft_deleted_at = row.soft_deleted_at ?? null;
  }
  return shaped;
}

function shapeTurn(row, { includeSoftDeleted }) {
  const shaped = {
    id: row.id,
    node_id: row.node_id,
    user_text: row.user_text,
    ai_text: row.ai_text,
    usage_json: row.usage_json ?? null,
    status: row.status,
    routed: row.routed,
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
    provider: row.provider ?? null,
    model: row.model ?? null,
    is_byok: typeof row.is_byok === 'boolean' ? row.is_byok : row.is_byok ?? null,
  };
  if (includeSoftDeleted) {
    shaped.soft_deleted_at = row.soft_deleted_at ?? null;
  }
  return shaped;
}

function shapeSummary(row) {
  return {
    node_id: row.node_id,
    path_summary: row.path_summary ?? null,
    parent_summary: row.parent_summary ?? null,
    provider: row.updated_by ?? null,
    updated_at: row.updated_at,
  };
}

function normalizeUsageJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
}

function extractKnowledgeFromTurn(turn) {
  const usage = normalizeUsageJson(turn?.usage_json);
  const knowledge = usage?.knowledge;
  if (!knowledge || typeof knowledge !== 'object') return null;

  const baseId = knowledge.baseId || knowledge.base_id || knowledge.kbId || knowledge.kb_id || null;
  if (!baseId || typeof baseId !== 'string') return null;

  const baseName = typeof knowledge.baseName === 'string' ? knowledge.baseName : undefined;
  const documentIdsRaw = knowledge.documentIds || knowledge.document_ids;
  const documentIds = Array.isArray(documentIdsRaw)
    ? documentIdsRaw.filter((v) => typeof v === 'string')
    : [];
  const documentCount =
    typeof knowledge.documentCount === 'number'
      ? knowledge.documentCount
      : documentIds.length > 0
        ? documentIds.length
        : undefined;

  return {
    baseId,
    baseName,
    documentIds,
    documentCount,
  };
}

function extractCitationsFromTurn(turn) {
  const usage = normalizeUsageJson(turn?.usage_json);
  const citations = usage?.citations;
  if (!Array.isArray(citations) || citations.length === 0) return null;
  return citations;
}

/**
 * 计算「最新活跃分支」信息
 * 
 * 规则（T28-0）：
 *   1. 找出所有叶子节点（没有子节点的节点）
 *   2. 在这些叶子节点中，取 created_at 最新的那个作为 activeNodeId
 *   3. 从该叶子节点回溯到 root，构建完整路径 pathNodeIds
 * 
 * @param {Array} nodes - 节点数组，每个节点包含 id, parent_id, created_at
 * @returns {{ activeNodeId: string|null, pathNodeIds: string[] }}
 */
function computeActivePathInfo(nodes) {
  if (!nodes || nodes.length === 0) {
    return { activeNodeId: null, pathNodeIds: [] };
  }

  // 构建 parent_id -> children 映射
  const childrenMap = buildChildrenMap(nodes);
  
  // 构建 id -> node 映射，用于回溯路径
  const nodeMap = new Map();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  // 找出所有叶子节点（没有子节点）
  const leafNodes = nodes.filter(node => {
    const children = childrenMap.get(node.id);
    return !children || children.length === 0;
  });

  if (leafNodes.length === 0) {
    // 如果没有叶子节点，返回第一个节点（root）
    const rootNode = nodes.find(n => !n.parent_id) || nodes[0];
    return {
      activeNodeId: rootNode?.id ?? null,
      pathNodeIds: rootNode ? [rootNode.id] : [],
    };
  }

  // 在叶子节点中，找 created_at 最新的
  let latestLeaf = leafNodes[0];
  for (const leaf of leafNodes) {
    const leafTime = new Date(leaf.created_at).getTime();
    const latestTime = new Date(latestLeaf.created_at).getTime();
    if (leafTime > latestTime) {
      latestLeaf = leaf;
    }
  }

  // 从最新叶子节点回溯到 root，构建路径
  const pathNodeIds = [];
  let current = latestLeaf;
  while (current) {
    pathNodeIds.unshift(current.id); // 从头部插入，保持 root -> leaf 顺序
    if (!current.parent_id) {
      break;
    }
    current = nodeMap.get(current.parent_id);
  }

  return {
    activeNodeId: latestLeaf.id,
    pathNodeIds,
  };
}

/**
 * T28-0: 为没有对应 AI 节点的 user 节点，从 turns 创建虚拟 AI 节点
 * 
 * 背景：
 *   某些对话树只有 user 节点，AI 回复存储在 turns 表中，没有独立的 ai role 节点。
 *   前端期望 user → ai → user → ai 的结构，所以需要在这里补齐 AI 节点。
 * 
 * 规则：
 *   1. 遍历所有 user 节点
 *   2. 检查该 user 节点是否有 role='ai' 的子节点
 *   3. 如果没有，检查 turns 中是否有该节点的 ai_text
 *   4. 如果有 ai_text，创建一个虚拟 AI 节点
 * 
 * @param {Array} nodes - 原始节点数组
 * @param {Array} turns - turns 数组
 * @returns {Array} 补齐 AI 节点后的节点数组
 */
function injectVirtualAiNodes(nodes, turns) {
  if (!nodes || nodes.length === 0) {
    return nodes;
  }

  // 构建 node_id -> turn 映射
  const turnByNodeId = new Map();
  for (const turn of turns) {
    // 取该 node 最新的 turn（假设 turns 已按 created_at 排序）
    turnByNodeId.set(turn.node_id, turn);
  }

  // 构建 parent_id -> children 映射
  const childrenMap = buildChildrenMap(nodes);

  // 检查每个 user 节点是否有 AI 子节点
  const virtualAiNodes = [];
  for (const node of nodes) {
    if (node.role !== 'user') {
      continue;
    }

    // 检查是否已有 ai 子节点
    const children = childrenMap.get(node.id) || [];
    const hasAiChild = nodes.some(n => children.includes(n.id) && n.role === 'ai');
    
    if (hasAiChild) {
      continue;
    }

    // 没有 ai 子节点，检查 turns 中是否有 ai_text
    const turn = turnByNodeId.get(node.id);
    if (!turn || !turn.ai_text) {
      continue;
    }

    // 创建虚拟 AI 节点
    const virtualAiNode = {
      id: `virtual-ai-${node.id}`,
      parent_id: node.id,
      level: (node.level ?? 0) + 1,
      role: 'ai',
      text: turn.ai_text,
      created_at: turn.created_at,
      updated_at: turn.updated_at ?? turn.created_at,
      // 标记这是虚拟节点（可选，用于调试）
      _virtual: true,
      provider: turn?.provider ?? null,
      model: turn?.model ?? null,
      is_byok: typeof turn?.is_byok === 'boolean' ? turn.is_byok : turn?.is_byok ?? null,
    };
    virtualAiNodes.push(virtualAiNode);
  }

  // 返回原始节点 + 虚拟 AI 节点
  return [...nodes, ...virtualAiNodes];
}

async function fetchTree(pg, treeId) {
  const result = await pg.query(
    `SELECT id, topic, created_by, status, created_at, updated_at, context_profile, memory_scope, tree_summary, tree_summary_last_error, tree_summary_last_error_at
     FROM trees
     WHERE id = $1
     LIMIT 1`,
    [treeId],
  );
  return result.rows[0] ?? null;
}

function filterNodes(nodes, { includeSoftDeleted }) {
  if (includeSoftDeleted) {
    return nodes;
  }

  const childrenMap = buildChildrenMap(nodes);
  const excluded = new Set();
  for (const node of nodes) {
    if (node.soft_deleted_at) {
      markExcludedDescendants(node.id, childrenMap, excluded);
    }
  }
  return nodes.filter((node) => !excluded.has(node.id));
}

export async function exportTree(pg, treeId, options = {}) {
  const includeSoftDeleted = coerceBoolean(options.includeSoftDeleted);

  if (!uuidValidate(treeId || "")) {
    throw new HttpError({
      status: 422,
      code: "INVALID_TREE_ID",
      message: "tree id must be a valid uuid",
    });
  }

  const treeRow = await fetchTree(pg, treeId);
  if (!treeRow) {
    throw new HttpError({
      status: 404,
      code: "TREE_NOT_FOUND",
      message: "tree not found",
    });
  }

  const { rows: nodeRows } = await pg.query(
    `SELECT id, parent_id, level, role, text, reasoning_content, provider, model, is_byok, soft_deleted_at, created_at, updated_at
     FROM nodes
     WHERE tree_id = $1
     ORDER BY level ASC, created_at ASC`,
    [treeId],
  );

  let filteredNodes = filterNodes(nodeRows, { includeSoftDeleted });

  // Soft correction: Remove system root if present and reparent children
  const systemRoot = filteredNodes.find(n => !n.parent_id && (n.role === 'system' || n.role === 'topic'));
  if (systemRoot) {
    filteredNodes = filteredNodes.filter(n => n.id !== systemRoot.id);
    filteredNodes.forEach(n => {
      if (n.parent_id === systemRoot.id) {
        n.parent_id = null;
      }
    });
  }

  const includedNodeIds = filteredNodes.map((node) => node.id);
  const includedSet = new Set(includedNodeIds);

  let turnRows = [];
  let summaryRows = [];
  if (includedNodeIds.length > 0) {
    const turnsResult = await pg.query(
      `SELECT id, node_id, user_text, ai_text, usage_json, status, routed, created_at, updated_at, soft_deleted_at, provider, model, is_byok
       FROM turns
       WHERE node_id = ANY($1::uuid[])
       ORDER BY created_at ASC`,
      [includedNodeIds],
    );
    turnRows = turnsResult.rows;

    const summariesResult = await pg.query(
      `SELECT node_id, path_summary, parent_summary, updated_by, updated_at
       FROM node_summaries
       WHERE node_id = ANY($1::uuid[])
       ORDER BY updated_at ASC`,
      [includedNodeIds],
    );
    summaryRows = summariesResult.rows;
  }

  // T85-fix: Query attachments for all nodes (via turn_uploads)
  let attachmentsMap = new Map();
  if (includedNodeIds.length > 0) {
    try {
      const attachmentsResult = await pg.query(
        `SELECT t.node_id, u.id, u.file_name, u.ext, u.size_bytes
         FROM turns t
         JOIN turn_uploads tu ON tu.turn_id = t.id
         JOIN uploads u ON u.id = tu.upload_id
         WHERE t.node_id = ANY($1::uuid[])
           AND ($2::boolean OR t.soft_deleted_at IS NULL)
         ORDER BY t.created_at ASC, tu.created_at ASC`,
        [includedNodeIds, includeSoftDeleted],
      );
      for (const row of attachmentsResult.rows) {
        if (!attachmentsMap.has(row.node_id)) {
          attachmentsMap.set(row.node_id, []);
        }
        attachmentsMap.get(row.node_id).push({
          id: row.id,
          fileName: row.file_name,
          ext: row.ext,
          sizeBytes: row.size_bytes,
        });
      }
    } catch (attachErr) {
      console.warn('[exportTree] Failed to query attachments:', attachErr?.message);
    }
  }

  const shapedNodes = filteredNodes.map((node) => shapeNode(node, { includeSoftDeleted, attachmentsMap }));
  const shapedTurns = turnRows
    .filter((row) => includedSet.has(row.node_id))
    .filter((row) => includeSoftDeleted || !row.soft_deleted_at)
    .map((row) => shapeTurn(row, { includeSoftDeleted }));
  const shapedSummaries = summaryRows
    .filter((row) => includedSet.has(row.node_id))
    .map((row) => shapeSummary(row));

  // ============================================================
  // T28-0: 为没有对应 AI 节点的 user 节点，从 turns 创建虚拟 AI 节点
  // 
  // 背景：某些对话树只有 user 节点，AI 回复存储在 turns 表中，
  //       没有独立的 ai role 节点。前端期望 user → ai → user → ai 的结构，
  //       所以需要在这里补齐 AI 节点。
  // ============================================================
  const nodesWithVirtualAi = injectVirtualAiNodes(shapedNodes, shapedTurns);

  // Enrich nodes with persisted KB selection and citations.
  // Frontend relies on these after reloadTree (which uses /api/tree/:id/export).
  const turnByUserNodeId = new Map();
  for (const turn of shapedTurns) {
    if (turn?.node_id) turnByUserNodeId.set(turn.node_id, turn);
  }
  const enrichedNodes = nodesWithVirtualAi.map((node) => {
    if (!node || typeof node !== 'object') return node;
    if (node.role === 'user') {
      const turn = turnByUserNodeId.get(node.id);
      const knowledge = extractKnowledgeFromTurn(turn);
      return knowledge ? { ...node, knowledge } : node;
    }
    if (node.role === 'ai') {
      const parentId = node.parent_id;
      const turn = typeof parentId === 'string' ? turnByUserNodeId.get(parentId) : null;
      const knowledge = extractKnowledgeFromTurn(turn);
      const citations = extractCitationsFromTurn(turn);
      if (!knowledge && !citations) return node;
      return {
        ...node,
        ...(knowledge ? { knowledge } : {}),
        ...(citations ? { citations } : {}),
      };
    }
    return node;
  });

  // ============================================================
  // 计算「最新活跃分支」（T28-0 Current Path Fix）
  // 规则：
  //   1. 找出所有叶子节点（没有子节点的节点）
  //   2. 在这些叶子节点中，取 created_at 最新的那个
  //   3. 以这条叶子节点所在的路径（从 root 到该节点）作为「当前 path」
  // ============================================================
  const activePathInfo = computeActivePathInfo(enrichedNodes);

  return {
    tree: normalizeTreeRow(treeRow),
    nodes: enrichedNodes,
    turns: shapedTurns,
    summaries: shapedSummaries,
    // 最新活跃分支信息
    active_node_id: activePathInfo.activeNodeId,
    active_path_node_ids: activePathInfo.pathNodeIds,
    meta: {
      exported_at: new Date().toISOString(),
      version: "t9.2",
      include_soft_deleted: includeSoftDeleted,
      nodes_total: nodesWithVirtualAi.length,
      turns_total: shapedTurns.length,
      summaries_total: shapedSummaries.length,
    },
  };
}

export default {
  exportTree,
};
