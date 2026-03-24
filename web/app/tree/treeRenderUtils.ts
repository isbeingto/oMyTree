import { QANode } from './qaClient';
import { TreeEdge } from './treeLayout';

export type NodeState = 'selected' | 'path' | 'normal';

/**
 * Extended node tier for visual hierarchy:
 * - selected: currently selected node
 * - trunk: on the main path from root to selected
 * - nearby: siblings of selected (same parent) or direct children of selected
 * - distant: everything else (background branches)
 */
export type NodeTier = 'selected' | 'trunk' | 'nearby' | 'distant';

export function normalizeText(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function stripThinkingTagsForAnswer(rawText: string | null | undefined): string {
  const text = typeof rawText === 'string' ? rawText : '';
  if (!text) return '';

  // Support multiple thinking tag formats: <思考>...</思考> / <think>...</think> / <analysis>...</analysis> / <thought>...</thought>
  const closedBlockRegexes = [
    /<思考[\s\S]*?<\/思考>/gi,
    /<think[\s\S]*?<\/think>/gi,
    /<analysis[\s\S]*?<\/analysis>/gi,
    /<thought[\s\S]*?<\/thought>/gi,
  ];
  
  let answer = text;
  for (const regex of closedBlockRegexes) {
    answer = answer.replace(regex, '');
  }

  // Unclosed opening tags: if any exist, remove them
  const openTagRegexes = [
    /<思考[^>]*>(?![\s\S]*<\/思考)/gi,
    /<think[^>]*>(?![\s\S]*<\/think)/gi,
    /<analysis[^>]*>(?![\s\S]*<\/analysis)/gi,
    /<thought[^>]*>(?![\s\S]*<\/thought)/gi,
  ];
  
  for (const openTagRegex of openTagRegexes) {
    answer = answer.replace(openTagRegex, '');
  }

  return answer;
}

export function getNodeState(
  nodeId: string,
  selectedId?: string | null,
  activePath?: Set<string>
): NodeState {
  if (selectedId && nodeId === selectedId) return 'selected';
  if (activePath && activePath.has(nodeId)) return 'path';
  return 'normal';
}

/**
 * Compute the visual tier for a node (4-tier hierarchy)
 * - selected: the node itself
 * - trunk: on the path from root to selected (but not selected)
 * - nearby: siblings (same parent) or direct children of selected
 * - distant: all other nodes
 */
export function getNodeTier(
  nodeId: string,
  selectedId: string | null | undefined,
  activePath: Set<string>,
  nearbyIds: Set<string>
): NodeTier {
  if (selectedId && nodeId === selectedId) return 'selected';
  if (activePath.has(nodeId)) return 'trunk';
  if (nearbyIds.has(nodeId)) return 'nearby';
  return 'distant';
}

/**
 * Compute the set of node IDs that are "nearby" the selected node:
 * - Siblings: other children of the selected node's parent
 * - Direct children: children of the selected node
 */
export function computeNearbyNodes(
  nodes: QANode[],
  selectedId: string | null | undefined
): Set<string> {
  const nearbyIds = new Set<string>();
  if (!selectedId) return nearbyIds;

  const nodeById = new Map<string, QANode>();
  nodes.forEach(n => nodeById.set(n.id, n));

  const selectedNode = nodeById.get(selectedId);
  if (!selectedNode) return nearbyIds;

  // Add direct children of selected node
  const selectedChildren = selectedNode.children_ids || [];
  selectedChildren.forEach(id => nearbyIds.add(id));

  // Add siblings (other children of the same parent)
  if (selectedNode.parent_id) {
    const parent = nodeById.get(selectedNode.parent_id);
    if (parent) {
      const siblings = parent.children_ids || [];
      siblings.forEach(id => {
        if (id !== selectedId) {
          nearbyIds.add(id);
        }
      });
    }
  }

  return nearbyIds;
}

/**
 * Classify an edge into three tiers for visual styling:
 * - trunk: both endpoints are on the active path
 * - nearby: at least one endpoint is nearby (sibling/child) but not trunk
 * - distant: neither endpoint is on path or nearby
 */
export type EdgeTier = 'trunk' | 'nearby' | 'distant';

export function getEdgeTier(
  edge: TreeEdge,
  activePath: Set<string>,
  nearbyIds: Set<string>
): EdgeTier {
  const fromOnPath = activePath.has(edge.from.id);
  const toOnPath = activePath.has(edge.to.id);

  // Trunk: both ends on path
  if (fromOnPath && toOnPath) return 'trunk';

  // Nearby: one end on path/selected, or both ends nearby
  const fromNear = nearbyIds.has(edge.from.id);
  const toNear = nearbyIds.has(edge.to.id);
  if (fromNear || toNear || fromOnPath || toOnPath) return 'nearby';

  return 'distant';
}

export function formatPathLabel(text: string, maxLength = 16): string {
  const normalized = normalizeText(text);
  if (!normalized) return 'Q: …';
  if (normalized.length <= maxLength) return `Q: ${normalized}`;
  return `Q: ${normalized.slice(0, maxLength - 1)}…`;
}

/**
 * Estimate the visual width of a string based on character types.
 * CJK characters are approximately 13px wide at fontSize 13.
 * Latin/ASCII characters are approximately 7px wide at fontSize 13.
 * This provides a rough estimate without measuring actual rendered text.
 */
function estimateTextWidth(text: string, fontSize = 13): number {
  // CJK Unicode ranges (Chinese, Japanese, Korean)
  const cjkRegex = /[\u4E00-\u9FFF\u3400-\u4DBF\u3000-\u303F\uFF00-\uFFEF]/;
  let width = 0;
  for (const char of text) {
    if (cjkRegex.test(char)) {
      // CJK characters are roughly fontSize width (monospace-like)
      width += fontSize;
    } else {
      // Latin/ASCII characters are roughly 0.55x fontSize
      width += fontSize * 0.55;
    }
  }
  return width;
}

/**
 * Truncate text to fit within a maximum pixel width.
 * Uses character width estimation to determine truncation point.
 */
function truncateToWidth(text: string, maxWidthPx: number, fontSize = 13): string {
  if (!text) return '';
  const ellipsisWidth = fontSize * 0.55; // "…" is a narrow character
  const cjkRegex = /[\u4E00-\u9FFF\u3400-\u4DBF\u3000-\u303F\uFF00-\uFFEF]/;

  let width = 0;
  let truncateIndex = text.length;

  for (let i = 0; i < text.length; i++) {
    const charWidth = cjkRegex.test(text[i]) ? fontSize : fontSize * 0.55;
    if (width + charWidth + ellipsisWidth > maxWidthPx) {
      truncateIndex = i;
      break;
    }
    width += charWidth;
  }

  if (truncateIndex >= text.length) {
    return text;
  }

  return `${text.slice(0, truncateIndex)}…`;
}

/**
 * Format card title with pixel-based truncation.
 * Card width: 200px, padding: 16px * 2 = 32px, available: 168px
 * Q: prefix takes ~21px, leaving ~147px for the title text.
 */
export function formatCardTitle(text: string, maxWidthPx = 147): string {
  const normalized = normalizeText(text);
  if (!normalized) return '…';
  return truncateToWidth(normalized, maxWidthPx, 13);
}

export function formatTooltip(text: string): string {
  const normalized = normalizeText(text);
  if (!normalized) return 'Q: (empty)';
  return `Q: ${normalized}`;
}

export function answerStatusText(node: QANode): string {
  return normalizeText(node.ai_text)
    ? 'Answered'
    : 'Awaiting answer';
}

/**
 * Format answer preview with pixel-based truncation.
 * Same card width constraints, but uses A: prefix.
 */
export function formatAnswerPreview(node: QANode, maxWidthPx = 147): string {
  const normalized = normalizeText(stripThinkingTagsForAnswer(node.ai_text));
  if (!normalized) return 'Awaiting answer';
  return truncateToWidth(normalized, maxWidthPx, 12); // Slightly smaller font for preview
}

export function buildBranchPath(edge: TreeEdge, cornerRadius = 10): string {
  const { from, to } = edge;
  const midX = to.x;
  const radius = Math.max(
    0,
    Math.min(
      cornerRadius,
      Math.abs(to.y - from.y) / 2,
      Math.abs(midX - from.x) / 2
    )
  );
  const goingUp = to.y < from.y;
  const ySign = goingUp ? -1 : 1;

  return [
    `M ${from.x} ${from.y}`,
    `L ${midX - radius} ${from.y}`,
    `Q ${midX} ${from.y} ${midX} ${from.y + ySign * radius}`,
    `L ${midX} ${to.y}`,
  ].join(' ');
}
