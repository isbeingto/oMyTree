/**
 * Trail Service - Thinking Trail Generation for P0-1
 * 
 * Generates "metacognitive analyst" style narrative reports from keyframes.
 * Uses structured JSON step input with strict chronological ordering.
 * 
 * @module api/lib/trail
 */

export { buildStepInput, TRAIL_LIMITS } from "./step_builder.js";
export { TRAIL_SYSTEM_PROMPT, TRAIL_USER_PROMPT_TEMPLATE, PROMPT_VERSION } from "./prompts.js";
export { validateTrailOutput, extractJumpLinks, logTrailDiagnostics } from "./validator.js";
