import type { Node } from '../types';
import type { TreeMetricsV1 } from '../metrics/useTreeMetrics';

export type TreeInfo = {
  name?: string | null;
  topic?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  context_profile?: 'lite' | 'standard' | 'max';
  memory_scope?: 'branch' | 'tree';
  tree_summary?: Record<string, unknown> | null;
};

type ReportPieces = {
  mainPathLength: number;
  branchNodes: Array<{ id: string; level: number | null; label: string }>;
  summaryLine: string;
  markdown: string;
};

function formatDate(value?: string | null) {
  if (!value) return '—';
  try {
    return new Date(value).toISOString().split('T')[0];
  } catch {
    return value;
  }
}

function summarizeNode(text: string | null | undefined, fallback = 'Branch') {
  const normalized = (text || '').trim();
  if (!normalized) return fallback;
  return normalized.length > 60 ? `${normalized.slice(0, 60)}…` : normalized;
}

export function buildLearningReport({
  tree,
  metrics,
  nodes,
}: {
  tree: TreeInfo;
  metrics: TreeMetricsV1 | null | undefined;
  nodes: Node[];
}): ReportPieces {
  const mainPathLength = metrics ? Math.max(1, (metrics.depth_max ?? 0) + 1) : 0;
  const childrenCounts = new Map<string, number>();
  nodes.forEach((n) => {
    if (n.parent_id) {
      childrenCounts.set(n.parent_id, (childrenCounts.get(n.parent_id) || 0) + 1);
    }
  });
  const branchNodes = nodes
    .filter((n) => (childrenCounts.get(n.id) || 0) >= 2)
    .sort((a, b) => (a.level || 0) - (b.level || 0))
    .slice(0, 3)
    .map((n) => ({
      id: n.id,
      level: typeof n.level === 'number' ? n.level : null,
      label: summarizeNode(n.text, 'Branch'),
    }));

  const topic = tree.topic || tree.name || 'this topic';
  const summaryLine = `This tree explores ${topic} in about ${mainPathLength} steps with ${metrics?.branch_node_count ?? 0} branching point${(metrics?.branch_node_count ?? 0) === 1 ? '' : 's'}.`;

  const branchList = branchNodes.map((b) => `- Node #${b.level ?? '?'}: ${b.label}`).join('\n') || '- (no major branching points detected)';

  const markdown = [
    `# Learning report for ${tree.name || tree.topic || 'Untitled tree'}`,
    '',
    '## Basic info',
    `- Topic: ${tree.topic || tree.name || 'Untitled'}`,
    `- Created at: ${formatDate(tree.created_at)}`,
    `- Last updated: ${formatDate(metrics?.updated_at || tree.updated_at)}`,
    '',
    '## Metrics',
    `- Total nodes: ${metrics?.node_count ?? '—'}`,
    `- Max depth: ${metrics?.depth_max ?? '—'}`,
    `- Branch nodes: ${metrics?.branch_node_count ?? '—'}`,
    `- Questions / Answers: ${metrics?.user_question_count ?? '—'} / ${metrics?.ai_answer_count ?? '—'}`,
    '',
    '## Structure',
    `- Main path length: ${mainPathLength} steps`,
    '- Major branching points:',
    branchList,
    '',
    '## Summary',
    summaryLine,
  ].join('\n');

  return { mainPathLength, branchNodes, summaryLine, markdown };
}
