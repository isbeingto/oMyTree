/**
 * Step Builder for Thinking Trail
 * 
 * Builds structured JSON step input from keyframes with:
 * - Strict chronological ordering (created_at ASC)
 * - Intelligent truncation with ellipsis
 * - Proper handling of both user and AI node keyframes
 * 
 * @module api/lib/trail/step_builder
 */

/**
 * Truncation and limit constants
 */
export const TRAIL_LIMITS = {
  MAX_STEPS: 60,
  MAX_CHARS_USER: 800,
  MAX_CHARS_AI: 1200,
  MAX_CHARS_ANNOTATION: 400,
  TRUNCATION_SUFFIX: "…[truncated]",
};

/**
 * Truncate text with ellipsis indicator
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum allowed length
 * @returns {string} Truncated text or original if within limit
 */
function truncateWithEllipsis(text, maxLength) {
  if (!text || text.length <= maxLength) {
    return text || "";
  }
  const suffix = TRAIL_LIMITS.TRUNCATION_SUFFIX;
  return text.slice(0, maxLength - suffix.length) + suffix;
}

function normalizeAnnotationForTrail(annotationValue) {
  if (!annotationValue || typeof annotationValue !== "string") {
    return null;
  }
  const trimmed = annotationValue.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        const lines = parsed
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const quote = typeof item.quote === "string" ? item.quote.trim() : "";
            const note = typeof item.note === "string" ? item.note.trim() : "";
            if (quote && note) return `引用：“${quote}” 批注：${note}`;
            if (note) return `批注：${note}`;
            if (quote) return `引用：“${quote}”`;
            return null;
          })
          .filter(Boolean);
        const combined = lines.join("\n");
        return combined || null;
      }
    } catch {
      // fall through to treat as plain string
    }
  }

  return trimmed;
}

/**
 * Build the SQL query for fetching keyframes with full turn context
 * 
 * Join strategy:
 * - Keyframes can point to either user or AI nodes
 * - Turns only exist for user nodes (containing both user_text and ai_text)
 * - For AI node keyframes, we use parent_id to find the corresponding user node's turn
 * 
 * @returns {string} SQL query string with $1=userId, $2=treeId placeholders
 */
export function getKeyframesQuery() {
  return `
    SELECT
      k.id AS keyframe_id,
      k.tree_id,
      k.node_id,
      k.annotation,
      k.created_at AS keyframe_created_at,
      k.is_pinned,
      n.role AS node_role,
      n.text AS node_text,
      n.level AS node_level,
      n.reasoning_content,
      n.thought_signature,
      t.id AS turn_id,
      t.user_text,
      t.ai_text,
      t.intent
    FROM keyframes k
    JOIN nodes n ON n.id = k.node_id
    LEFT JOIN turns t ON t.node_id = (
      CASE WHEN n.role = 'user' THEN n.id ELSE n.parent_id END
    )
    WHERE k.user_id = $1
      AND k.tree_id = $2
      AND n.soft_deleted_at IS NULL
    ORDER BY k.created_at ASC, k.id ASC
  `;
}

/**
 * Build structured step input array from keyframes query result
 * 
 * Each step contains:
 * - step_index: 1-based index
 * - node_id: for jump link generation
 * - keyframe_role: "user" or "ai" (which node was pinned)
 * - user_text: the user's question/input (truncated)
 * - ai_text: the AI's response (truncated)
 * - annotation: user's annotation on this keyframe (truncated)
 * - has_reasoning: whether DeepSeek reasoning content exists
 * 
 * @param {Array} keyframeRows - Rows from getKeyframesQuery()
 * @returns {Array<Object>} Structured step objects
 */
export function buildStepInput(keyframeRows) {
  if (!keyframeRows || keyframeRows.length === 0) {
    return [];
  }

  // Limit to MAX_STEPS
  const limitedRows = keyframeRows.slice(0, TRAIL_LIMITS.MAX_STEPS);

  return limitedRows.map((row, index) => {
    // Determine text sources based on node role
    // For user nodes: turn has both user_text and ai_text
    // For AI nodes: we joined via parent, so turn still has the full Q&A pair
    const userText = truncateWithEllipsis(
      row.user_text || "",
      TRAIL_LIMITS.MAX_CHARS_USER
    );

    // AI text: prefer turn.ai_text, fallback to node.text for AI nodes
    const aiText = truncateWithEllipsis(
      row.ai_text || (row.node_role === "ai" ? row.node_text : ""),
      TRAIL_LIMITS.MAX_CHARS_AI
    );

    const annotation = truncateWithEllipsis(
      normalizeAnnotationForTrail(row.annotation) || "",
      TRAIL_LIMITS.MAX_CHARS_ANNOTATION
    );

    return {
      step_index: index + 1,
      tree_id: row.tree_id,
      created_at: row.keyframe_created_at,
      node_id: row.node_id,
      keyframe_role: row.node_role,
      user_text: userText,
      ai_text: aiText,
      annotation: annotation || null,
      has_reasoning: Boolean(row.reasoning_content || row.thought_signature),
      intent: row.intent || null,
    };
  });
}

/**
 * Format step input as JSON string for LLM prompt
 * 
 * @param {Array<Object>} steps - Step objects from buildStepInput()
 * @returns {string} Formatted JSON string
 */
export function formatStepsAsJson(steps) {
  if (!steps || steps.length === 0) {
    return "[]";
  }

  // Create a clean version without internal fields
  const cleanSteps = steps.map((step) => ({
    step_index: step.step_index,
    created_at: step.created_at || null,
    tree_id: step.tree_id || null,
    node_id: step.node_id,
    user_text: step.user_text,
    ai_text: step.ai_text,
    annotation: step.annotation ?? null,
  }));

  return JSON.stringify(cleanSteps, null, 2);
}
