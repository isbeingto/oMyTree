/**
 * P1-3: Unified Artifact Audit Service
 * 
 * Writes auditable versions of Memo/Trail/Outcome to artifact_versions table.
 * Provides traceability via based_on and evidence_links fields in input JSONB.
 * 
 * Key Features:
 * - Unified interface for all artifact types
 * - Reference chain tracking (based_on)
 * - Evidence links for Outcome traceability
 * - Fail-open design (audit failure doesn't block main operation)
 */

import crypto from 'crypto';

/**
 * Compute SHA-256 checksum for content
 * @param {string} content - Content to hash
 * @returns {string} - SHA-256 hex string
 */
function computeChecksum(content) {
  if (!content) return null;
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Write an auditable artifact version to artifact_versions table
 * 
 * @param {import('pg').Pool} pool - Database connection pool
 * @param {Object} params - Artifact parameters
 * @param {string} params.artifact_type - Type: 'memo' | 'outcome' | 'trail'
 * @param {string} params.tree_id - Tree UUID
 * @param {string} [params.created_by] - User UUID (optional)
 * @param {string} [params.provider] - LLM provider (optional)
 * @param {string} [params.model] - LLM model (optional)
 * @param {string} params.prompt_version - Prompt version identifier
 * @param {Object} params.input - Input context JSONB
 * @param {Object} [params.input.based_on] - Reference chain
 * @param {string} [params.input.based_on.path_snapshot_id] - Path snapshot reference
 * @param {string} [params.input.based_on.trail_version_id] - Trail version reference
 * @param {string} [params.input.based_on.memo_id] - Previous memo reference
 * @param {Array} [params.input.evidence_links] - Evidence links array
 * @param {string} params.content_markdown - Generated content
 * @param {Object} [params.validation_metrics] - Validation results
 * @returns {Promise<{id: string, checksum: string} | null>} - Created artifact or null on failure
 */
export async function writeAuditableArtifact(pool, params) {
  const {
    artifact_type,
    tree_id,
    created_by = null,
    provider = null,
    model = null,
    prompt_version,
    input = {},
    content_markdown,
    validation_metrics = {},
  } = params;

  // Validate required fields
  if (!artifact_type || !['memo', 'outcome', 'trail'].includes(artifact_type)) {
    console.warn('[artifact_audit] Invalid artifact_type:', artifact_type);
    return null;
  }

  if (!tree_id) {
    console.warn('[artifact_audit] Missing tree_id');
    return null;
  }

  if (!prompt_version) {
    console.warn('[artifact_audit] Missing prompt_version');
    return null;
  }

  if (typeof content_markdown !== 'string') {
    console.warn('[artifact_audit] content_markdown must be a string');
    return null;
  }

  const checksum = computeChecksum(content_markdown);

  // Ensure input has proper structure for reference chain
  const inputWithRefs = {
    ...input,
    based_on: input.based_on || {},
    evidence_links: Array.isArray(input.evidence_links) ? input.evidence_links : [],
  };

  try {
    const { rows } = await pool.query(
      `INSERT INTO artifact_versions 
       (artifact_type, tree_id, created_by, provider, model, prompt_version, input, content_markdown, checksum, validation_metrics)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10::jsonb)
       RETURNING id, checksum`,
      [
        artifact_type,
        tree_id,
        created_by,
        provider,
        model,
        prompt_version,
        JSON.stringify(inputWithRefs),
        content_markdown,
        checksum,
        JSON.stringify(validation_metrics),
      ]
    );

    console.log(`[artifact_audit] Created ${artifact_type} artifact: ${rows[0].id}`);
    return rows[0];
  } catch (err) {
    // Fail-open: log error but don't throw
    console.error(`[artifact_audit] Failed to write ${artifact_type} artifact:`, err.message);
    return null;
  }
}

/**
 * Write Memo artifact version
 * 
 * @param {import('pg').Pool} pool - Database connection pool
 * @param {Object} params - Memo parameters
 * @param {string} params.tree_id - Tree UUID
 * @param {string} params.memo_id - Business memo ID (e.g., M_xxxx)
 * @param {string} [params.created_by] - User UUID
 * @param {string} [params.provider] - LLM provider
 * @param {string} [params.model] - LLM model
 * @param {string} params.prompt_version - Prompt version
 * @param {Object} params.memo_json - Memo JSON data
 * @param {Array} [params.keyframe_ids] - Keyframe IDs used
 * @param {Array} [params.node_ids] - Node IDs covered
 * @param {string} [params.based_on_memo_id] - Previous memo ID (relay)
 * @param {string} [params.scope_node_id] - Scope root node ID
 * @param {string} [params.lang] - Language
 * @returns {Promise<{id: string, checksum: string} | null>}
 */
export async function writeMemoArtifact(pool, params) {
  const {
    tree_id,
    memo_id,
    created_by,
    provider,
    model,
    prompt_version,
    memo_json,
    keyframe_ids = [],
    node_ids = [],
    based_on_memo_id = null,
    scope_node_id = null,
    lang = 'zh',
  } = params;

  // Build content_markdown from memo_json
  const bullets = memo_json?.bullets || [];
  const contentLines = bullets.map((b, i) => {
    const idx = i + 1;
    const text = typeof b === 'string' ? b : (b.text || '');
    return `${idx}. ${text}`;
  });
  const content_markdown = contentLines.join('\n\n');

  // Build input with reference chain
  const input = {
    memo_id,
    scope_node_id,
    keyframe_ids,
    node_ids,
    lang,
    based_on: {
      memo_id: based_on_memo_id,
    },
    // No evidence_links for memo (it IS the evidence summary)
  };

  // Validation metrics from memo_json integrity
  const validation_metrics = {
    bullet_count: bullets.length,
    coverage: memo_json?.coverage || {},
    integrity: memo_json?.integrity || {},
    keyframe_picker_version: memo_json?.keyframe_picker_version || null,
  };

  return writeAuditableArtifact(pool, {
    artifact_type: 'memo',
    tree_id,
    created_by,
    provider,
    model,
    prompt_version,
    input,
    content_markdown,
    validation_metrics,
  });
}

/**
 * Write Outcome artifact version
 * 
 * @param {import('pg').Pool} pool - Database connection pool
 * @param {Object} params - Outcome parameters
 * @param {string} params.tree_id - Tree UUID
 * @param {string} params.outcome_draft_id - Business outcome draft ID
 * @param {string} params.outcome_type - 'decision' | 'brief' | 'report'
 * @param {string} [params.created_by] - User UUID
 * @param {string} [params.provider] - LLM provider
 * @param {string} [params.model] - LLM model
 * @param {string} params.prompt_version - Prompt version
 * @param {string} params.content_markdown - Generated outcome markdown
 * @param {string} [params.snapshot_id] - Resume snapshot ID
 * @param {Array} [params.keyframe_ids] - Keyframe IDs used
 * @param {Array} [params.node_ids] - Node IDs referenced
 * @param {string} [params.trail_version_id] - Trail version used
 * @param {string} [params.path_snapshot_id] - Path snapshot used
 * @param {Array} [params.evidence_links] - Evidence links array
 * @returns {Promise<{id: string, checksum: string} | null>}
 */
export async function writeOutcomeArtifact(pool, params) {
  const {
    tree_id,
    outcome_draft_id,
    outcome_type,
    created_by,
    provider,
    model,
    prompt_version,
    content_markdown,
    snapshot_id = null,
    keyframe_ids = [],
    node_ids = [],
    trail_version_id = null,
    path_snapshot_id = null,
    evidence_links = [],
    validation_metrics = {},
  } = params;

  // Build input with reference chain
  const input = {
    outcome_draft_id,
    outcome_type,
    snapshot_id,
    keyframe_ids,
    node_ids,
    based_on: {
      path_snapshot_id,
      trail_version_id,
    },
    evidence_links,
  };

  return writeAuditableArtifact(pool, {
    artifact_type: 'outcome',
    tree_id,
    created_by,
    provider,
    model,
    prompt_version,
    input,
    content_markdown,
    validation_metrics,
  });
}

/**
 * Get artifact lineage (what was this outcome based on)
 * 
 * @param {import('pg').Pool} pool - Database connection pool
 * @param {string} artifactId - Artifact UUID
 * @returns {Promise<Object | null>} - Lineage info
 */
export async function getArtifactLineage(pool, artifactId) {
  if (!artifactId) return null;

  try {
    const { rows } = await pool.query(
      `SELECT 
         id,
         artifact_type,
         tree_id,
         created_at,
         input,
         input->'based_on' AS based_on,
         input->'evidence_links' AS evidence_links,
         input->'keyframe_ids' AS keyframe_ids,
         input->'node_ids' AS node_ids
       FROM artifact_versions
       WHERE id = $1`,
      [artifactId]
    );

    if (rows.length === 0) return null;

    const artifact = rows[0];
    const basedOn = artifact.based_on || {};
    
    // Fetch referenced artifacts if they exist
    const lineage = {
      artifact_id: artifact.id,
      artifact_type: artifact.artifact_type,
      tree_id: artifact.tree_id,
      created_at: artifact.created_at,
      based_on: basedOn,
      evidence_links: artifact.evidence_links || [],
      keyframe_ids: artifact.keyframe_ids || [],
      node_ids: artifact.node_ids || [],
      references: {},
    };

    // Fetch path_snapshot if referenced
    if (basedOn.path_snapshot_id) {
      const { rows: psRows } = await pool.query(
        `SELECT id, created_at, input->'keyframe_ids' AS keyframe_ids
         FROM artifact_versions
         WHERE id = $1 AND artifact_type = 'path_snapshot'`,
        [basedOn.path_snapshot_id]
      );
      if (psRows.length > 0) {
        lineage.references.path_snapshot = {
          id: psRows[0].id,
          created_at: psRows[0].created_at,
          keyframe_ids: psRows[0].keyframe_ids || [],
        };
      }
    }

    // Fetch trail_version if referenced
    if (basedOn.trail_version_id) {
      const { rows: tRows } = await pool.query(
        `SELECT id, created_at, input->'keyframe_ids' AS keyframe_ids
         FROM artifact_versions
         WHERE id = $1 AND artifact_type = 'trail'`,
        [basedOn.trail_version_id]
      );
      if (tRows.length > 0) {
        lineage.references.trail_version = {
          id: tRows[0].id,
          created_at: tRows[0].created_at,
          keyframe_ids: tRows[0].keyframe_ids || [],
        };
      }
    }

    return lineage;
  } catch (err) {
    console.error('[artifact_audit] Failed to get lineage:', err.message);
    return null;
  }
}

/**
 * Query: What was this outcome based on?
 * Returns structured answer for "基于哪些节点/哪些 keyframes/哪个 trail 版本生成"
 * 
 * @param {import('pg').Pool} pool - Database connection pool
 * @param {string} outcomeArtifactId - Outcome artifact UUID
 * @returns {Promise<Object | null>} - Traceability answer
 */
export async function explainOutcomeLineage(pool, outcomeArtifactId) {
  if (!outcomeArtifactId) return null;

  try {
    const { rows } = await pool.query(
      `SELECT 
         id,
         artifact_type,
         tree_id,
         created_at,
         input,
         prompt_version
       FROM artifact_versions
       WHERE id = $1 AND artifact_type = 'outcome'`,
      [outcomeArtifactId]
    );

    if (rows.length === 0) return null;

    const artifact = rows[0];
    const input = artifact.input || {};
    const basedOn = input.based_on || {};

    const explanation = {
      outcome_artifact_id: artifact.id,
      tree_id: artifact.tree_id,
      created_at: artifact.created_at,
      outcome_type: input.outcome_type,
      prompt_version: artifact.prompt_version,
      
      // Direct references
      snapshot_id: input.snapshot_id,
      keyframe_ids: input.keyframe_ids || [],
      node_ids: input.node_ids || [],
      
      // Based on (reference chain)
      based_on_path_snapshot_id: basedOn.path_snapshot_id || null,
      based_on_trail_version_id: basedOn.trail_version_id || null,
      
      // Evidence links
      evidence_links: input.evidence_links || [],
      
      // Human-readable summary
      summary: null,
    };

    // Build human-readable summary
    const parts = [];
    if (explanation.keyframe_ids.length > 0) {
      parts.push(`${explanation.keyframe_ids.length} keyframes`);
    }
    if (explanation.node_ids.length > 0) {
      parts.push(`${explanation.node_ids.length} nodes`);
    }
    if (explanation.based_on_trail_version_id) {
      parts.push(`trail version ${explanation.based_on_trail_version_id.slice(0, 8)}...`);
    }
    if (explanation.based_on_path_snapshot_id) {
      parts.push(`path snapshot ${explanation.based_on_path_snapshot_id.slice(0, 8)}...`);
    }
    if (explanation.snapshot_id) {
      parts.push(`resume snapshot ${explanation.snapshot_id.slice(0, 8)}...`);
    }
    if (explanation.evidence_links.length > 0) {
      parts.push(`${explanation.evidence_links.length} evidence items`);
    }

    explanation.summary = parts.length > 0 
      ? `Based on: ${parts.join(', ')}`
      : 'No reference chain recorded';

    return explanation;
  } catch (err) {
    console.error('[artifact_audit] Failed to explain outcome lineage:', err.message);
    return null;
  }
}
