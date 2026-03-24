import { exportTreeJson } from './export_json.js';

function escapeValue(value) {
  if (value === null || value === undefined) return '—';
  return String(value);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toISOString().split('T')[0];
  } catch {
    return dateStr;
  }
}

function indentLine(depth, line) {
  return `${'  '.repeat(depth)}${line}`;
}

function summarize(text) {
  const normalized = (text || '').trim();
  if (!normalized) return '(empty)';
  return normalized.length > 80 ? `${normalized.slice(0, 80)}…` : normalized;
}

export async function exportTreeMarkdown({ treeId, userId }) {
  const json = await exportTreeJson({ treeId, userId });
  const lines = [];
  const title = json.tree?.name || json.tree?.topic || 'Untitled tree';
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`- Topic: ${escapeValue(json.tree?.topic || json.tree?.name || 'Untitled')}`);
  lines.push(`- Created at: ${formatDate(json.tree?.created_at)}`);
  lines.push(`- Last updated: ${formatDate(json.tree?.updated_at)}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  const nodes = Array.isArray(json.nodes) ? json.nodes : [];
  const byParent = new Map();
  nodes.forEach((n) => {
    const key = n.parent_id || 'ROOT';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(n);
  });
  // sort children by created_at asc for deterministic structure
  for (const arr of byParent.values()) {
    arr.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  }

  const rootNode = nodes.find((n) => !n.parent_id) || nodes[0];

  // Root Q: In new semantics (and soft-corrected legacy), rootNode IS the first user question.
  const rootQuestion = rootNode?.role === 'user' ? rootNode : nodes.find((n) => n.role === 'user');
  
  const rootAnswer =
    rootQuestion &&
    (byParent.get(rootQuestion.id) || []).find((n) => n.role === 'ai' || n.role === 'assistant');

  if (rootQuestion) {
    lines.push('## Root');
    lines.push(`Q (user): ${escapeValue(rootQuestion.text)}`);
    const rootAi = rootAnswer;
    if (rootAi) {
      lines.push(`A (ai): ${escapeValue(rootAi.text)}`);
    }
    lines.push('');
  }

  const seen = new Set([rootNode?.id, rootQuestion?.id, rootAnswer?.id].filter(Boolean));

  // Branch roots: children of the root question (excluding its root answer)
  const branchRoots = rootQuestion
    ? (byParent.get(rootQuestion.id) || []).filter((n) => n.id !== rootAnswer?.id)
    : [];
  
  // If rootNode is different from rootQuestion (should not happen with soft correction), handle children
  if (rootNode && rootNode.id !== rootQuestion?.id) {
     const otherChildren = (byParent.get(rootNode.id) || []).filter(n => n.id !== rootQuestion?.id);
     branchRoots.push(...otherChildren);
  }

  const renderSubtree = (node, depth = 0) => {
    if (!node || seen.has(node.id)) return;
    const roleLabel = node.role === 'ai' || node.role === 'assistant' ? 'A (ai)' : 'Q (user)';
    lines.push(indentLine(depth, `- ${roleLabel}: ${escapeValue(node.text)}`));
    seen.add(node.id);
    (byParent.get(node.id) || []).forEach((child) => renderSubtree(child, depth + 1));
  };

  branchRoots.forEach((branch) => {
    const titleSnippet = summarize(branch.text);
    const levelLabel = typeof branch.level === 'number' ? branch.level : '?';
    lines.push(`## Branch from node #${levelLabel}: ${titleSnippet}`);
    renderSubtree(branch, 1);
    lines.push('');
  });

  return lines.join('\n');
}
