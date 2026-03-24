/**
 * T58-3: Semantic Ledger Service
 * 
 * Records evidence-related atoms in semantic_ledger_atoms table.
 */

import { pool } from '../../db/pool.js';

/**
 * Record an evidence mention in the semantic ledger
 * 
 * @param {Object} params
 * @param {string} params.treeId - Tree ID
 * @param {string} params.evidenceId - Evidence ID
 * @param {string} params.evidenceType - Evidence type (url/file/text)
 * @param {string} params.title - Evidence title
 * @param {string} params.action - Action performed (created/attached/detached)
 * @param {string} [params.nodeId] - Optional node ID (for attach/detach)
 */
export async function recordEvidenceMention({
  treeId,
  evidenceId,
  evidenceType,
  title,
  action,
  nodeId = null,
}) {
  // Build text description
  const actionText = {
    created: 'Created evidence',
    attached: 'Attached evidence to node',
    detached: 'Detached evidence from node',
  }[action] || 'Referenced evidence';

  const text = `${actionText}: ${title}`;

  // Build sources array
  const sources = [
    {
      type: 'evidence',
      evidence_id: evidenceId,
      evidence_type: evidenceType,
      title,
    },
  ];

  // Build payload
  const payload = {
    evidence_id: evidenceId,
    action,
  };

  if (nodeId) {
    payload.node_id = nodeId;
  }

  await pool.query(
    `INSERT INTO semantic_ledger_atoms (
      tree_id, kind, text, sources, payload
    ) VALUES ($1, $2, $3, $4, $5)`,
    [treeId, 'evidence_mention', text, JSON.stringify(sources), JSON.stringify(payload)]
  );
}
