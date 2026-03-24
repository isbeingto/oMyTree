/**
 * Trail Output Validator
 * 
 * Validates and diagnoses the generated Trail report:
 * - Checks for expected jump link format
 * - Logs diagnostics for debugging
 * - Extracts jump links for verification
 * 
 * @module api/lib/trail/validator
 */

/**
 * Jump link pattern: [[Jump to Context]](jump:{uuid})
 * Captures the node_id UUID
 */
const JUMP_LINK_REGEX = /\[\[Jump to Context\]\]\(jump:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;

/**
 * Step header pattern: ### Step X
 */
const STEP_HEADER_REGEX = /^### Step \d+/gm;

/**
 * Extract all jump links from the generated Trail report
 * 
 * @param {string} content - Generated markdown content
 * @returns {Array<{match: string, nodeId: string}>} Array of jump link matches
 */
export function extractJumpLinks(content) {
  if (!content) return [];

  const links = [];
  let match;

  // Reset regex state
  JUMP_LINK_REGEX.lastIndex = 0;

  while ((match = JUMP_LINK_REGEX.exec(content)) !== null) {
    links.push({
      match: match[0],
      nodeId: match[1],
    });
  }

  return links;
}

/**
 * Count step headers in the generated content
 * 
 * @param {string} content - Generated markdown content
 * @returns {number} Number of step headers found
 */
export function countStepHeaders(content) {
  if (!content) return 0;
  const matches = content.match(STEP_HEADER_REGEX);
  return matches ? matches.length : 0;
}

/**
 * Validate the generated Trail output
 * 
 * Checks:
 * 1. Content is non-empty
 * 2. Has expected number of step headers (soft check)
 * 3. Has jump links matching input node_ids (soft check)
 * 4. Has Key Takeaways section (soft check)
 * 
 * @param {string} content - Generated markdown content
 * @param {Array<Object>} inputSteps - Original step input array
 * @returns {{valid: boolean, warnings: string[], metrics: Object}}
 */
export function validateTrailOutput(content, inputSteps) {
  const warnings = [];
  const metrics = {
    contentLength: content?.length || 0,
    stepHeadersFound: 0,
    jumpLinksFound: 0,
    matchedNodeIds: 0,
    hasKeyTakeaways: false,
  };

  if (!content || content.trim().length === 0) {
    return {
      valid: false,
      warnings: ["Generated content is empty"],
      metrics,
    };
  }

  // Count step headers
  metrics.stepHeadersFound = countStepHeaders(content);

  // Extract and validate jump links
  const jumpLinks = extractJumpLinks(content);
  metrics.jumpLinksFound = jumpLinks.length;

  // Check if jump links match input node_ids
  if (inputSteps && inputSteps.length > 0) {
    const inputNodeIds = new Set(inputSteps.map((s) => s.node_id));
    const matchedLinks = jumpLinks.filter((link) => inputNodeIds.has(link.nodeId));
    metrics.matchedNodeIds = matchedLinks.length;

    if (metrics.jumpLinksFound === 0) {
      warnings.push("No jump links found in output - navigation will not work");
    } else if (metrics.matchedNodeIds < metrics.jumpLinksFound) {
      warnings.push(
        `Some jump links reference unknown node_ids: ${jumpLinks
          .filter((link) => !inputNodeIds.has(link.nodeId))
          .map((l) => l.nodeId)
          .join(", ")}`
      );
    }
  }

  // Check for Key Takeaways section
  metrics.hasKeyTakeaways = /## Key Takeaways/i.test(content);
  if (!metrics.hasKeyTakeaways) {
    warnings.push("Missing 'Key Takeaways' summary section");
  }

  // Soft validation: we don't fail on warnings, but log them
  return {
    valid: true, // Soft validation - always valid if non-empty
    warnings,
    metrics,
  };
}

/**
 * Log Trail generation diagnostics
 * 
 * @param {string} treeId - Tree ID
 * @param {Object} params - Diagnostic parameters
 * @param {number} params.inputSteps - Number of input steps
 * @param {number} params.durationMs - Generation duration
 * @param {Object} params.validation - Validation result
 * @param {string} [params.promptVersion] - Prompt version used
 */
export function logTrailDiagnostics(treeId, params) {
  const {
    inputSteps,
    durationMs,
    validation,
    promptVersion = "unknown",
  } = params;

  const logPrefix = `[trail:generate]`;
  
  console.log(
    `${logPrefix} tree=${treeId} steps=${inputSteps} duration=${durationMs}ms ` +
    `headers=${validation.metrics.stepHeadersFound} jumps=${validation.metrics.jumpLinksFound} ` +
    `matched=${validation.metrics.matchedNodeIds} takeaways=${validation.metrics.hasKeyTakeaways} ` +
    `version=${promptVersion}`
  );

  if (validation.warnings.length > 0) {
    console.warn(`${logPrefix} tree=${treeId} warnings:`, validation.warnings);
  }
}
