import { pool } from '../../db/pool.js';
import { fetchAncestorOutcomeSummary } from './ancestor_outcome.js';
import { getForkPointsOnPath } from './path_builder.js';
import { resolveProviderForRequest } from '../../services/llm/providers/index.js';

const PROMPT_VERSION = 'outcome_report_v4_thought_snapshot';
const MAX_CONTEXT_NODES_PER_KEYFRAME = 2; // Give LLM a bit more context
const MAX_TEXT_LENGTH_PER_SECTION = 2000;

function buildSources({ nodeId, turnId, keyframeId }) {
  const sources = [];
  if (keyframeId) sources.push(`keyframe:${keyframeId}`);
  if (nodeId) sources.push(`node:${nodeId}`);
  if (turnId) sources.push(`turn:${turnId}`);
  return sources;
}

function truncateText(text, maxLen = MAX_TEXT_LENGTH_PER_SECTION) {
  if (!text || text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '…';
}

function parseAnnotation(annotationStr) {
  if (!annotationStr) return null;
  try {
    const parsed = JSON.parse(annotationStr);
    if (Array.isArray(parsed)) {
      return parsed.map(a => `> ${a.quote || ''}\n*笔记: ${a.note || ''}*`).join('\n\n');
    }
    return annotationStr;
  } catch (e) {
    return annotationStr;
  }
}

function buildSkeleton(keyframes, anchorNodeId) {
  const skeleton = new Set();
  for (const kf of keyframes) {
    if (kf.nodeId) skeleton.add(kf.nodeId);
  }
  if (anchorNodeId) skeleton.add(anchorNodeId);
  return skeleton;
}

function expandWithContext(skeleton, keyframes, mainPathNodeIds, nodeMap, { minIndex = 0 } = {}) {
  const pathIndexMap = new Map();
  mainPathNodeIds.forEach((id, idx) => pathIndexMap.set(id, idx));

  const includeIndices = new Set();

  for (const nodeId of skeleton) {
    const idx = pathIndexMap.get(nodeId);
    if (idx !== undefined && idx >= minIndex) includeIndices.add(idx);
  }

  for (const kf of keyframes) {
    const idx = pathIndexMap.get(kf.nodeId);
    if (idx === undefined || idx < minIndex) continue;

    for (let i = 1; i <= MAX_CONTEXT_NODES_PER_KEYFRAME; i++) {
      const beforeIdx = idx - i;
      if (beforeIdx >= minIndex) includeIndices.add(beforeIdx);
    }

    for (let i = 1; i <= MAX_CONTEXT_NODES_PER_KEYFRAME; i++) {
      const afterIdx = idx + i;
      if (afterIdx < mainPathNodeIds.length) includeIndices.add(afterIdx);
    }
  }

  const sortedIndices = Array.from(includeIndices).sort((a, b) => a - b);
  const expandedNodeIds = sortedIndices.map((idx) => mainPathNodeIds[idx]);

  const nodeIndexMap = new Map();
  expandedNodeIds.forEach((id, idx) => nodeIndexMap.set(id, idx));

  return { expandedNodeIds, nodeIndexMap };
}

async function fetchNodesWithTurns(treeId, nodeIds, options = {}) {
  if (!nodeIds || nodeIds.length === 0) return new Map();
  const { client } = options;
  const db = client || pool;

  const sql = `
    SELECT
      n.id AS node_id,
      n.tree_id,
      n.parent_id,
      n.level,
      n.role,
      n.text AS node_text,
      n.created_at AS node_created_at,
      t.id AS turn_id,
      t.user_text,
      t.ai_text,
      t.intent
    FROM nodes n
    LEFT JOIN turns t ON t.node_id = (
      CASE WHEN n.role = 'user' THEN n.id ELSE n.parent_id END
    )
    WHERE n.tree_id = $1
      AND n.id = ANY($2::uuid[])
      AND n.soft_deleted_at IS NULL
    ORDER BY n.level ASC, n.created_at ASC;
  `;

  const { rows } = await db.query(sql, [treeId, nodeIds]);

  const nodeMap = new Map();
  for (const row of rows) {
    nodeMap.set(row.node_id, {
      nodeId: row.node_id,
      treeId: row.tree_id,
      parentId: row.parent_id,
      level: row.level,
      nodeRole: row.role,
      nodeText: row.node_text,
      nodeCreatedAt: row.node_created_at,
      turnId: row.turn_id,
      userText: row.user_text,
      aiText: row.ai_text,
      intent: row.intent,
    });
  }
  return nodeMap;
}

function buildAncestorSummarySection(ancestor) {
  const title = typeof ancestor?.title === 'string' ? ancestor.title.trim() : '';
  const conclusion = typeof ancestor?.conclusion === 'string' ? ancestor.conclusion.trim() : '';

  const header = title ? `继承自：${title}` : '继承自：祖先成果';
  const body = conclusion ? truncateText(conclusion, 600) : '（祖先成果未提供结论）';

  return {
    type: 'ancestor_summary',
    text: `${header}\n\n${body}`,
    sources: ancestor?.id ? [`outcome:${ancestor.id}`] : ['outcome:unknown'],
    is_collapsed: true,
    ancestor_outcome_id: ancestor?.id || null,
  };
}

function buildForkSummarySection(forkPoints, { minIndex = 0, pathIndexByNodeId = new Map() } = {}) {
  if (!Array.isArray(forkPoints) || forkPoints.length === 0) return null;

  const filtered = forkPoints
    .map((fp) => {
      const pathIndex = pathIndexByNodeId.get(fp.nodeId);
      return { ...fp, pathIndex: Number.isFinite(pathIndex) ? pathIndex : null };
    })
    .filter((fp) => fp.pathIndex === null || fp.pathIndex >= minIndex);

  if (filtered.length === 0) return null;

  const lines = [];
  lines.push('**分叉点提示**：主路径上存在其他分支（当前报告沿主路径继续）。');
  lines.push('');
  for (const fp of filtered) {
    const level = Number.isFinite(fp.level) ? fp.level : '?';
    const short = typeof fp.nodeId === 'string' ? fp.nodeId.slice(0, 8) : 'unknown';
    const childCount = Number.isFinite(fp.childCount) ? fp.childCount : '?';
    lines.push(`- L${level} · 节点 ${short}… 有 **${childCount}** 条子分支`);
  }

  const sources = Array.from(
    new Set(
      filtered
        .map((fp) => (fp?.nodeId ? `node:${fp.nodeId}` : null))
        .filter(Boolean)
    )
  );

  return {
    type: 'fork_summary',
    text: lines.join('\n'),
    sources: sources.length > 0 ? sources : ['node:unknown'],
    is_collapsed: true,
    fork_points_count: filtered.length,
  };
}

async function generateReportWithLLM({
  userId,
  expandedNodeIds,
  nodeDataMap,
  keyframes,
  conclusion,
  anchorNodeId
}) {
  const keyframeByNodeId = new Map();
  for (const kf of keyframes) {
    if (kf.nodeId) keyframeByNodeId.set(kf.nodeId, kf);
  }

  let contextStr = '';
  for (const nodeId of expandedNodeIds) {
    const node = nodeDataMap.get(nodeId);
    if (!node) continue;

    const kf = keyframeByNodeId.get(nodeId);
    const isKeyframe = !!kf;

    contextStr += `\n\n--- [Node ID: ${nodeId}] ---\n`;
    if (node.userText) {
      contextStr += `User: ${truncateText(node.userText, 1000)}\n`;
    }
    if (node.aiText) {
      contextStr += `AI: ${truncateText(node.aiText, 1500)}\n`;
    }
    if (!node.userText && !node.aiText && node.nodeText) {
      contextStr += `${node.nodeRole === 'user' ? 'User' : 'AI'}: ${truncateText(node.nodeText, 1000)}\n`;
    }

    if (isKeyframe && kf.annotation) {
      const parsed = parseAnnotation(kf.annotation);
      contextStr += `\n[User Annotation / Keyframe ID: ${kf.keyframeId}]\n${parsed}\n`;
    }
  }

  const prompt = `You are an expert knowledge curator and cognitive mapper. Your task is to generate a "Thought Snapshot" (思维快照) based on a user's exploration path and their annotations (keyframes).
The goal is to allow the user to instantly recall *how* they arrived at the current conclusion and *what* their thought process was, without reading the raw chat history.

Here is the exploration context:
${contextStr}

User's requested conclusion/guidance (if any):
${conclusion || 'None'}

Please generate a JSON report with the following structure. Use rich Markdown formatting (headers, bold, blockquotes, lists) in the "text" fields to make it beautiful and highly readable.

{
  "sections": [
    {
      "type": "step",
      "text": "### 🎯 核心洞察 (Core Insight)\\n\\nA highly synthesized executive summary of the final takeaway. If the user provided guidance, incorporate it here.",
      "sources": ["node:${anchorNodeId}"]
    },
    {
      "type": "step",
      "text": "### 🚀 探索起点 (Origin)\\n\\nWhy did this exploration start? What was the initial question or problem?",
      "sources": ["node:<nodeId>"]
    },
    {
      "type": "step",
      "text": "### 💡 关键转折 (Key Milestone): [Short Title]\\n\\n**发现**: What was learned here?\\n> **思考**: [Include the user's annotation/note if available, to show their thought process]\\n\\n**影响**: How did this shift the direction of the exploration?",
      "sources": ["node:<nodeId>", "keyframe:<keyframeId>"]
    },
    {
      "type": "evidence",
      "text": "Raw quotes, code snippets, or detailed context that supports the milestone above.",
      "sources": ["node:<nodeId>"]
    },
    {
      "type": "step",
      "text": "### 🔭 遗留问题与下一步 (Next Steps)\\n\\nWhat remains unanswered? Where should the user continue next time?",
      "sources": ["node:${anchorNodeId}"]
    }
  ]
}

Constraints:
1. Output MUST be valid JSON.
2. Every section MUST have a "sources" array containing at least one valid ID from the context (e.g., "node:1234...", "keyframe:5678...").
3. Do not hallucinate information outside the context.
4. Write the report in the same language as the context (usually Chinese).
5. The report MUST read like a "Journey Map" of the user's mind. Emphasize the *evolution* of ideas.
6. Generate as many "step" and "evidence" sections as needed to cover the keyframes. Use the "Key Milestone" format for each major discovery.
7. Use the "evidence" type specifically for raw quotes, code snippets, or detailed context that supports a milestone. It will be rendered as a collapsible box.
`;

  try {
    const { provider, defaultModel } = await resolveProviderForRequest({ userId });
    const result = await provider.callChat({
      prompt,
      options: {
        model: defaultModel || undefined,
        temperature: 0.3,
      },
    });

    const raw = typeof result?.ai_text === "string" ? result.ai_text.trim() : "";
    
    // Extract JSON from markdown fences if present
    let jsonStr = raw;
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) {
      jsonStr = match[1];
    }

    const parsed = JSON.parse(jsonStr);
    if (parsed && Array.isArray(parsed.sections)) {
      return parsed.sections;
    }
  } catch (err) {
    console.warn("[outcome_report] LLM generation failed, falling back to mechanical generation:", err?.message);
  }

  // Fallback to mechanical generation if LLM fails
  const fallbackSections = [];
  fallbackSections.push({
    type: 'step',
    text: `### 🎯 核心洞察\n\n${conclusion || '（无结论）'}`,
    sources: anchorNodeId ? [`node:${anchorNodeId}`] : ['node:unknown'],
  });

  let stepIndex = 0;
  for (const nodeId of expandedNodeIds) {
    const node = nodeDataMap.get(nodeId);
    if (!node) continue;
    const kf = keyframeByNodeId.get(nodeId);
    
    stepIndex++;
    const parts = [];
    if (node.userText) parts.push(`**用户**：${truncateText(String(node.userText).trim(), 800)}`);
    if (node.aiText) parts.push(`**AI**：${truncateText(String(node.aiText).trim(), 1200)}`);
    
    if (kf && kf.annotation) {
      fallbackSections.push({
        type: 'step',
        step_index: stepIndex,
        text: `### 💡 关键转折：节点 ${nodeId.slice(0, 8)}\n\n> **思考**：\n${parseAnnotation(kf.annotation)}`,
        sources: buildSources({ nodeId: node.nodeId, turnId: node.turnId, keyframeId: kf?.keyframeId }),
        is_keyframe: true,
        node_level: node.level,
      });
      
      fallbackSections.push({
        type: 'evidence',
        step_index: stepIndex,
        text: parts.join('\n\n') || '（无内容）',
        sources: buildSources({ nodeId: node.nodeId, turnId: node.turnId, keyframeId: kf?.keyframeId }),
      });
    } else {
      fallbackSections.push({
        type: 'step',
        step_index: stepIndex,
        text: parts.join('\n\n') || '（无内容）',
        sources: buildSources({ nodeId: node.nodeId, turnId: node.turnId, keyframeId: kf?.keyframeId }),
        is_keyframe: false,
        node_level: node.level,
      });
    }
  }
  return fallbackSections;
}

export async function generateReport({
  outcome,
  mainPathNodeIds,
  keyframes,
  nodeMap,
  deltaStartIndex,
  options = {},
}) {
  const { client } = options;
  const nowIso = new Date().toISOString();

  const anchorNodeId = outcome?.anchor_node_id;
  const conclusion = outcome?.conclusion || '';
  const treeId = outcome?.tree_id;
  const userId = outcome?.user_id;
  const ancestorOutcomeId = outcome?.derived_from_outcome_id || null;

  const safeMainPath = Array.isArray(mainPathNodeIds) ? mainPathNodeIds : [];
  const safeKeyframes = Array.isArray(keyframes) ? keyframes : [];

  let ancestorSummary = null;
  if (ancestorOutcomeId && userId && treeId) {
    try {
      ancestorSummary = await fetchAncestorOutcomeSummary({
        userId,
        treeId,
        ancestorOutcomeId,
        options: { client },
      });
    } catch (err) {
      console.warn('[outcome_report] ancestor summary fetch failed:', err?.message);
      ancestorSummary = null;
    }
  }

  const pathIndexMap = new Map();
  safeMainPath.forEach((id, idx) => pathIndexMap.set(id, idx));

  let effectiveDeltaStartIndex = Number.isFinite(deltaStartIndex) ? Math.max(0, deltaStartIndex) : null;
  if (effectiveDeltaStartIndex === null && ancestorSummary?.anchor_node_id) {
    const ancestorIdx = pathIndexMap.get(ancestorSummary.anchor_node_id);
    if (Number.isFinite(ancestorIdx)) {
      const next = ancestorIdx + 1;
      if (next >= 0 && next < safeMainPath.length) {
        effectiveDeltaStartIndex = next;
      }
    }
  }

  if (effectiveDeltaStartIndex !== null && effectiveDeltaStartIndex >= safeMainPath.length) {
    effectiveDeltaStartIndex = null;
  }

  const deltaStartNodeId = effectiveDeltaStartIndex !== null ? safeMainPath[effectiveDeltaStartIndex] : null;

  const filteredKeyframes = effectiveDeltaStartIndex === null
    ? safeKeyframes
    : safeKeyframes.filter((kf) => {
        const idx = pathIndexMap.get(kf?.nodeId);
        return Number.isFinite(idx) && idx >= effectiveDeltaStartIndex;
      });

  const skeleton = buildSkeleton(filteredKeyframes, anchorNodeId);

  const { expandedNodeIds } = expandWithContext(
    skeleton,
    filteredKeyframes,
    safeMainPath,
    nodeMap || new Map(),
    { minIndex: effectiveDeltaStartIndex ?? 0 }
  );

  let nodeDataMap = nodeMap;
  if (!nodeDataMap || nodeDataMap.size === 0) {
    nodeDataMap = await fetchNodesWithTurns(treeId, expandedNodeIds, { client });
  }

  const sections = [];

  if (ancestorSummary) {
    sections.push(buildAncestorSummarySection(ancestorSummary));
  }

  let forkPoints = [];
  try {
    if (treeId && safeMainPath.length > 0) {
      forkPoints = await getForkPointsOnPath(treeId, safeMainPath, { client });
    }
  } catch (err) {
    console.warn('[outcome_report] fork points fetch failed:', err?.message);
    forkPoints = [];
  }

  const forkSummarySection = buildForkSummarySection(forkPoints, {
    minIndex: effectiveDeltaStartIndex ?? 0,
    pathIndexByNodeId: pathIndexMap,
  });
  if (forkSummarySection) {
    sections.push(forkSummarySection);
  }

  // Generate the main body using LLM
  const llmSections = await generateReportWithLLM({
    userId,
    expandedNodeIds,
    nodeDataMap,
    keyframes: filteredKeyframes,
    conclusion,
    anchorNodeId
  });

  sections.push(...llmSections);

  const normalizedForkPoints = Array.isArray(forkPoints)
    ? forkPoints
        .map((fp) => {
          const pathIndex = pathIndexMap.get(fp.nodeId);
          return {
            node_id: fp.nodeId,
            child_count: fp.childCount,
            level: fp.level,
            path_index: Number.isFinite(pathIndex) ? pathIndex : null,
          };
        })
        .filter((fp) => fp.node_id)
    : [];

  return {
    ancestor_outcome_id: ancestorSummary?.id || null,
    delta_start_index: effectiveDeltaStartIndex,
    delta_start_node_id: deltaStartNodeId,
    sections,
    skeleton_keyframe_ids: filteredKeyframes.map((k) => k.keyframeId).filter(Boolean),
    main_path_node_ids: safeMainPath,
    expanded_node_ids: expandedNodeIds,
    fork_points: normalizedForkPoints,
    generation_meta: {
      prompt_version: PROMPT_VERSION,
      model: 'llm',
      generated_at: nowIso,
      skeleton_size: skeleton.size,
      expanded_size: expandedNodeIds.length,
      keyframe_count: filteredKeyframes.length,
      delta_start_index: effectiveDeltaStartIndex,
    },
  };
}

export function validateReportSources(reportJson) {
  const errors = [];
  if (!reportJson?.sections || !Array.isArray(reportJson.sections)) {
    errors.push('report_json.sections is missing or not an array');
    return { valid: false, errors };
  }
  reportJson.sections.forEach((section, index) => {
    if (!section.sources || !Array.isArray(section.sources) || section.sources.length === 0) {
      errors.push(`Section ${index} (type=${section.type}) has no sources`);
    }
  });
  return { valid: errors.length === 0, errors };
}

export function isValidReport(reportJson) {
  return validateReportSources(reportJson).valid;
}

export default {
  generateReport,
  validateReportSources,
  isValidReport,
  PROMPT_VERSION,
};
