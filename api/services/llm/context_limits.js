/**
 * Centralized limits for context construction (tunable)
 * - tokensBudget: recommended prompt budget (<= max_tokens * 0.8)
 * - includeTreeStory: whether this profile can include tree summary
 * - layer caps are char-based to stay within the budget
 * - T51-1: recentTurns increased to ensure recent AI responses are included
 * - T51-2: Rebalanced to prioritize recent dialogue over summaries
 *          - Increased recentTurnChars for code blocks
 *          - Added minRecentTurnPairs as hard minimum
 *          - Reduced summary limits to make room for dialogue
 */
export const CONTEXT_MESSAGE_LIMITS = {
  lite: {
    tokensBudget: 800,              // T51-2: was 600, slightly increased for dialogue
    includeTreeStory: false,
    pathSummary: 60,                // T51-2: was 80, reduced to prioritize dialogue
    parentSummary: 120,             // T51-2: was 160, reduced
    rollingSummary: 300,            // P0: rolling summary char limit
    parentFull: 0,
    recentTurns: 2,                 // T51-1: minimum 2 turns
    recentTurnPairs: 2,             // T51-1: 2 pairs = 4 nodes max
    minRecentTurnPairs: 2,          // T51-2: hard minimum, never go below this
    recentTurnChars: 300,           // T51-2: was 200, increased for code blocks
    treeStoryLimit: 0,
    prioritizeDialogue: true,       // T51-2: flag for layer builder
  },
  standard: {
    tokensBudget: 2000,             // T51-2: was 1600, increased for more dialogue
    includeTreeStory: true,
    pathSummary: 100,               // T51-2: was 140, reduced
    parentSummary: 160,             // T51-2: was 220, reduced
    rollingSummary: 450,            // P0: rolling summary char limit
    parentFull: 0,
    recentTurns: 4,                 // T51-1: 4 turns
    recentTurnPairs: 4,             // T51-1: 4 pairs = 8 nodes max
    minRecentTurnPairs: 4,          // T51-2: hard minimum
    recentTurnChars: 400,           // T51-2: was 240, increased for code blocks
    treeStoryLimit: 200,            // T51-2: was 280, reduced
    prioritizeDialogue: true,
  },
  max: {
    tokensBudget: 8000,             // T51-2: was 6400, increased for full context
    includeTreeStory: true,
    pathSummary: 160,               // T51-2: was 200, slightly reduced
    parentSummary: 200,             // T51-2: was 260, reduced
    rollingSummary: 600,            // P0: rolling summary char limit
    parentFull: 600,                // T51-2: was 900, reduced
    recentTurns: 6,                 // T51-1: 6 turns
    recentTurnPairs: 6,             // T51-1: 6 pairs = 12 nodes max
    minRecentTurnPairs: 6,          // T51-2: hard minimum
    recentTurnChars: 600,           // T51-2: was 280, significantly increased
    treeStoryLimit: 400,            // T51-2: was 700, reduced
    prioritizeDialogue: true,
  },
};


export const TREE_SUMMARY_LIMIT = 800;
// T43-1: Lowered thresholds for better coverage
export const TREE_SUMMARY_INITIAL_THRESHOLD = 6; // Generate first summary after N nodes
export const TREE_SUMMARY_REFRESH_INTERVAL = 8; // Refresh every N nodes after initial generation
export const TREE_SUMMARY_MIN_REFRESH_MINUTES = 10; // Don't refresh more than once per N minutes

export function clampText(value, limit) {
  if (!limit || limit <= 0) return value || '';
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit)}…`;
}
