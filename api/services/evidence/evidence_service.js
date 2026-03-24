/**
 * T58-3: Evidence Service
 * 
 * Handles CRUD operations for evidence items and node-evidence links.
 * Evidence can be URL, file, or text type.
 */

import { pool } from '../../db/pool.js';
import { HttpError } from '../../lib/errors.js';

/**
 * Create a new evidence item
 */
export async function createEvidence({
  treeId,
  type,
  title,
  summary = null,
  sourceUrl = null,
  storedPath = null,
  textContent = null,
  fileName = null,
  fileSize = null,
  mimeType = null,
  tags = [],
}) {
  // Validate type
  if (!['url', 'file', 'text'].includes(type)) {
    throw new HttpError({
      status: 400,
      code: 'invalid_evidence_type',
      message: 'Evidence type must be url, file, or text',
    });
  }

  // Validate type-specific requirements
  if (type === 'url' && !sourceUrl) {
    throw new HttpError({
      status: 400,
      code: 'missing_source_url',
      message: 'source_url is required for URL evidence',
    });
  }

  if (type === 'file' && !storedPath) {
    throw new HttpError({
      status: 400,
      code: 'missing_stored_path',
      message: 'stored_path is required for file evidence',
    });
  }

  if (type === 'text' && !textContent) {
    throw new HttpError({
      status: 400,
      code: 'missing_text_content',
      message: 'text_content is required for text evidence',
    });
  }

  const { rows } = await pool.query(
    `INSERT INTO evidence_items (
      tree_id, type, title, summary,
      source_url, stored_path, text_content,
      file_name, file_size, mime_type, tags
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *`,
    [
      treeId, type, title, summary,
      sourceUrl, storedPath, textContent,
      fileName, fileSize, mimeType, tags
    ]
  );

  return rows[0];
}

/**
 * Get evidence by ID
 */
export async function getEvidenceById(evidenceId) {
  const { rows } = await pool.query(
    `SELECT * FROM evidence_items WHERE id = $1`,
    [evidenceId]
  );

  if (rows.length === 0) {
    throw new HttpError({
      status: 404,
      code: 'evidence_not_found',
      message: 'Evidence not found',
    });
  }

  return rows[0];
}

/**
 * List evidence for a tree
 */
export async function listEvidenceForTree(
  treeId,
  { limit = 100, offset = 0, type = null } = {}
) {
  const params = [treeId];
  const conditions = ['e.tree_id = $1'];

  if (type) {
    conditions.push(`e.type = $${params.length + 1}`);
    params.push(type);
  }

  params.push(limit, offset);

  const { rows } = await pool.query(
    `
      SELECT 
        e.*,
        COALESCE(COUNT(nel.node_id), 0) AS attached_node_count
      FROM evidence_items e
      LEFT JOIN node_evidence_links nel ON e.id = nel.evidence_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY e.id
      ORDER BY e.created_at DESC
      LIMIT $${params.length - 1}
      OFFSET $${params.length}
    `,
    params
  );
  return rows;
}

/**
 * Attach evidence to a node
 */
export async function attachEvidenceToNode(nodeId, evidenceId) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO node_evidence_links (node_id, evidence_id)
       VALUES ($1, $2)
       ON CONFLICT (node_id, evidence_id) DO NOTHING
       RETURNING *`,
      [nodeId, evidenceId]
    );

    // Return true if new link was created, false if already existed
    return { created: rows.length > 0, link: rows[0] || null };
  } catch (err) {
    if (err.code === '23503') { // Foreign key violation
      if (err.constraint === 'node_evidence_links_node_id_fkey') {
        throw new HttpError({
          status: 404,
          code: 'node_not_found',
          message: 'Node not found',
        });
      }
      if (err.constraint === 'node_evidence_links_evidence_id_fkey') {
        throw new HttpError({
          status: 404,
          code: 'evidence_not_found',
          message: 'Evidence not found',
        });
      }
    }
    throw err;
  }
}

/**
 * List evidence attached to a node
 */
export async function listEvidenceForNode(nodeId) {
  const { rows } = await pool.query(
    `SELECT e.*, nel.created_at as attached_at
     FROM evidence_items e
     JOIN node_evidence_links nel ON e.id = nel.evidence_id
     WHERE nel.node_id = $1
     ORDER BY nel.created_at DESC`,
    [nodeId]
  );

  return rows;
}

/**
 * Delete evidence item
 */
export async function deleteEvidence(evidenceId) {
  const { rows } = await pool.query(
    `DELETE FROM evidence_items WHERE id = $1 RETURNING *`,
    [evidenceId]
  );

  if (rows.length === 0) {
    throw new HttpError({
      status: 404,
      code: 'evidence_not_found',
      message: 'Evidence not found',
    });
  }

  return rows[0];
}

/**
 * Detach evidence from a node
 */
export async function detachEvidenceFromNode(nodeId, evidenceId) {
  const { rows } = await pool.query(
    `DELETE FROM node_evidence_links
     WHERE node_id = $1 AND evidence_id = $2
     RETURNING *`,
    [nodeId, evidenceId]
  );

  if (rows.length === 0) {
    throw new HttpError({
      status: 404,
      code: 'link_not_found',
      message: 'Evidence is not attached to this node',
    });
  }

  return rows[0];
}

/**
 * List nodes attached to an evidence item
 */
export async function listNodesForEvidence(evidenceId) {
  const { rows } = await pool.query(
    `SELECT n.id, n.text, n.role, n.created_at, nel.created_at AS attached_at
     FROM node_evidence_links nel
     JOIN nodes n ON n.id = nel.node_id
     WHERE nel.evidence_id = $1
     ORDER BY nel.created_at DESC`,
    [evidenceId]
  );
  return rows;
}
