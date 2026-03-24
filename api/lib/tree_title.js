/**
 * Tree title generation and normalization utilities
 * T15-9: Consistent tree naming rules
 */

/**
 * Build display title for a tree
 * Priority: displayTitle > rootText > topic > "Untitled tree"
 * 
 * @param {Object} options
 * @param {string|null} options.displayTitle - User's custom title (from trees.display_title)
 * @param {string|null} options.rootText - Text from root node
 * @param {string|null} options.topic - Tree topic
 * @returns {string} Final display title
 */
export function buildDefaultTitle({ displayTitle, rootText, topic }) {
  // If user has set a custom title, use it directly
  if (displayTitle && displayTitle.trim()) {
    return normalizeTitle(displayTitle);
  }

  // T20-7: If topic is shorter than rootText, it's likely an LLM-generated concise title
  // Prefer it over the full root text
  const trimmedTopic = (topic || "").trim();
  const trimmedRoot = (rootText || "").trim();
  
  if (trimmedTopic && trimmedTopic.length < trimmedRoot.length && trimmedTopic.length <= 50) {
    // LLM-generated topic is more concise, use it
    return normalizeTitle(trimmedTopic);
  }

  // Otherwise generate from root text or topic
  const source = trimmedRoot || trimmedTopic || "";
  if (!source) {
    return "Untitled tree";
  }

  // Apply generation rules
  return generateTitleFromText(source);
}

/**
 * Normalize a title string (trim and limit length)
 * 
 * @param {string} title - Raw title string
 * @param {number} maxLength - Maximum character length (default: 100)
 * @returns {string} Normalized title
 */
export function normalizeTitle(title, maxLength = 100) {
  if (!title || typeof title !== "string") {
    return "Untitled tree";
  }

  // Trim and collapse multiple spaces
  let normalized = title.trim().replace(/\s+/g, " ");

  // Truncate if too long
  if (normalized.length > maxLength) {
    normalized = normalized.substring(0, maxLength).trim();
    // Try to avoid breaking in the middle of a word
    const lastSpace = normalized.lastIndexOf(" ");
    if (lastSpace > maxLength * 0.7) {
      normalized = normalized.substring(0, lastSpace);
    }
    normalized += "...";
  }

  return normalized || "Untitled tree";
}

/**
 * Generate a display title from raw text (root node or topic)
 * Rules:
 * - Trim and collapse spaces
 * - Remove trailing question marks
 * - Truncate to readable length
 * 
 * @param {string} text - Source text
 * @returns {string} Generated title
 */
function generateTitleFromText(text) {
  if (!text || typeof text !== "string") {
    return "Untitled tree";
  }

  // Trim and collapse multiple spaces
  let cleaned = text.trim().replace(/\s+/g, " ");

  // Remove trailing question marks (only at the end)
  cleaned = cleaned.replace(/[?？]+$/, "").trim();

  // Truncate to reasonable length (60 chars for generated titles)
  const maxLength = 60;
  if (cleaned.length > maxLength) {
    cleaned = cleaned.substring(0, maxLength).trim();
    
    // Try to break at a sentence boundary
    const lastPeriod = cleaned.lastIndexOf(".");
    const lastComma = cleaned.lastIndexOf(",");
    const lastSpace = cleaned.lastIndexOf(" ");
    
    // Prefer breaking at period, then comma, then space
    let breakPoint = -1;
    if (lastPeriod > maxLength * 0.5) {
      breakPoint = lastPeriod + 1;
    } else if (lastComma > maxLength * 0.6) {
      breakPoint = lastComma;
    } else if (lastSpace > maxLength * 0.7) {
      breakPoint = lastSpace;
    }

    if (breakPoint > 0) {
      cleaned = cleaned.substring(0, breakPoint).trim();
    }
    
    // Remove trailing punctuation after truncation (escape dash properly)
    cleaned = cleaned.replace(/[,，;；:：—\-]+$/, "").trim();
  }

  return cleaned || "Untitled tree";
}

/**
 * Validate a title string for user input
 * 
 * @param {string} title - Title to validate
 * @param {number} maxLength - Maximum allowed length (default: 100)
 * @returns {{valid: boolean, error?: string}} Validation result
 */
export function validateTitle(title, maxLength = 100) {
  if (!title || typeof title !== "string") {
    return { valid: false, error: "Title is required" };
  }

  const trimmed = title.trim();
  if (!trimmed) {
    return { valid: false, error: "Title cannot be empty" };
  }

  if (trimmed.length > maxLength) {
    return { valid: false, error: `Title cannot exceed ${maxLength} characters` };
  }

  return { valid: true };
}
