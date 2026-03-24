/**
 * T58-2: Trail Narrative Generator
 * 
 * Converts raw trail events into human-readable "pivot point" narratives.
 * Deterministic rule-based version (no LLM required).
 * 
 * Event Types → Narrative Templates:
 * - BRANCH_BURST → "Explored N alternative directions from [node]"
 * - NODE_CREATED (user) → "Asked about [topic_tag or truncated text]"
 * - NODE_CREATED (ai) → "Received answer on [topic]"
 * - BRANCH_SWITCH → "Switched focus to a different branch"
 * - EVIDENCE_ATTACHED → "Attached evidence: [label]"
 * - OUTCOME_SAVED → "Saved outcome: [type]"
 * - SNAPSHOT_CREATED → "Created progress snapshot"
 * - NODE_FOCUSED → "Focused on [node summary]"
 */

const EVENT_TEMPLATES = {
  BRANCH_BURST: {
    priority: 1, // High priority - key pivot point
    template: (payload, context) => {
      const childCount = payload?.children?.length || 0;
      if (childCount > 1) {
        return `Explored ${childCount} alternative directions`;
      }
      return 'Started a new branch of exploration';
    },
    icon: '🌿',
  },
  NODE_CREATED: {
    priority: 3, // Lower priority - collapse multiple
    template: (payload, context) => {
      const role = payload?.role || 'unknown';
      const topicTag = payload?.topic_tag;
      
      if (role === 'user') {
        if (topicTag) {
          return `Asked about "${truncate(topicTag, 40)}"`;
        }
        return 'Asked a follow-up question';
      }
      
      if (role === 'ai' || role === 'assistant') {
        if (topicTag) {
          return `Received insight on "${truncate(topicTag, 40)}"`;
        }
        return 'Received an answer';
      }
      
      return 'Added a new node';
    },
    icon: '💬',
  },
  TURN_ADDED: {
    priority: 4, // Low priority - usually accompanies NODE_CREATED
    template: (payload) => {
      const routed = payload?.routed;
      if (routed === 'branch') {
        return 'Started a branching conversation';
      }
      return 'Continued the conversation';
    },
    icon: '↩️',
    collapse: true, // Collapse with adjacent NODE_CREATED
  },
  BRANCH_SWITCH: {
    priority: 2, // Medium-high priority
    template: () => 'Switched focus to a different branch',
    icon: '🔀',
  },
  EVIDENCE_ATTACHED: {
    priority: 1, // High priority - key action
    template: (payload) => {
      const label = payload?.label || payload?.filename || 'document';
      return `Attached evidence: "${truncate(label, 30)}"`;
    },
    icon: '📎',
  },
  OUTCOME_SAVED: {
    priority: 1, // High priority - key action
    template: (payload) => {
      const outType = payload?.outcome_type || 'result';
      return `Saved ${outType} as outcome`;
    },
    icon: '✅',
  },
  SNAPSHOT_CREATED: {
    priority: 2, // Medium priority
    template: (payload) => {
      const mode = payload?.mode || 'incremental';
      if (payload?.pinned) {
        return 'Pinned a progress checkpoint';
      }
      return 'Created a progress snapshot';
    },
    icon: '📸',
  },
  NODE_FOCUSED: {
    priority: 4, // Low priority
    template: () => 'Focused on a specific node',
    icon: '🎯',
    collapse: true,
  },
};

// Default template for unknown event types
const DEFAULT_TEMPLATE = {
  priority: 5,
  template: (payload, context, type) => `${formatEventType(type)}`,
  icon: '•',
};

/**
 * Truncate text to max length with ellipsis
 */
function truncate(text, maxLen = 50) {
  if (!text || typeof text !== 'string') return '';
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen - 1).trim() + '…';
}

/**
 * Format event type for display
 */
function formatEventType(type) {
  if (!type || typeof type !== 'string') return 'Event';
  return type.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());
}

/**
 * Build narrative entry from a single event
 */
function buildNarrativeEntry(event, context = {}) {
  const type = event.type?.toUpperCase() || 'UNKNOWN';
  const config = EVENT_TEMPLATES[type] || DEFAULT_TEMPLATE;
  const payload = event.payload || {};
  
  const text = config.template(payload, context, type);
  const nodeId = event.node_id || payload?.node_id || null;
  const turnId = event.turn_id || payload?.turn_id || null;
  
  const sources = [];
  if (nodeId) sources.push(`node:${nodeId}`);
  if (turnId) sources.push(`turn:${turnId}`);
  if (context.treeId) sources.push(`tree:${context.treeId}`);
  
  return {
    text,
    icon: config.icon,
    priority: config.priority,
    type,
    ts: event.ts,
    sources,
    nodeId,
    turnId,
    collapse: config.collapse || false,
  };
}

/**
 * Collapse adjacent low-priority events of the same type
 */
function collapseEvents(entries) {
  if (entries.length <= 1) return entries;
  
  const result = [];
  let currentGroup = null;
  
  for (const entry of entries) {
    if (entry.collapse && currentGroup?.type === entry.type) {
      // Merge into current group
      currentGroup.count = (currentGroup.count || 1) + 1;
      currentGroup.sources = [...new Set([...currentGroup.sources, ...entry.sources])];
    } else {
      if (currentGroup) {
        // Finalize previous group
        if (currentGroup.count > 1) {
          currentGroup.text = `${currentGroup.text} (×${currentGroup.count})`;
        }
        result.push(currentGroup);
      }
      currentGroup = { ...entry, count: 1 };
    }
  }
  
  // Push last group
  if (currentGroup) {
    if (currentGroup.count > 1) {
      currentGroup.text = `${currentGroup.text} (×${currentGroup.count})`;
    }
    result.push(currentGroup);
  }
  
  return result;
}

/**
 * Filter to keep only high-priority "pivot point" events
 */
function filterToPivotPoints(entries, maxEntries = 7) {
  // Sort by priority (lower number = higher priority), then by timestamp (newer first)
  const sorted = [...entries].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return new Date(b.ts) - new Date(a.ts);
  });
  
  // Take top N entries, then re-sort by timestamp for narrative flow
  const top = sorted.slice(0, maxEntries);
  return top.sort((a, b) => new Date(b.ts) - new Date(a.ts));
}

/**
 * Main entry point: Convert trail events to narrative diary entries
 * 
 * @param {Array} events - Raw trail events from tree_trail_events
 * @param {Object} context - { treeId, nodeMap }
 * @returns {Array} Narrative diary entries (3-7 items)
 */
export function trailNarrativeFromEvents(events = [], context = {}) {
  if (!Array.isArray(events) || events.length === 0) {
    return [{
      text: 'No exploration activity yet',
      icon: '📭',
      priority: 5,
      type: 'EMPTY',
      ts: new Date().toISOString(),
      sources: context.treeId ? [`tree:${context.treeId}`] : [],
      nodeId: null,
      turnId: null,
    }];
  }
  
  // Build narrative entries from all events
  const entries = events.map(ev => buildNarrativeEntry(ev, context));
  
  // Collapse adjacent similar events
  const collapsed = collapseEvents(entries);
  
  // Filter to pivot points (3-7 entries)
  const pivotPoints = filterToPivotPoints(collapsed, 7);
  
  // Ensure minimum 3 entries if possible
  if (pivotPoints.length < 3 && collapsed.length > pivotPoints.length) {
    const more = collapsed
      .filter(e => !pivotPoints.includes(e))
      .slice(0, 3 - pivotPoints.length);
    pivotPoints.push(...more);
    pivotPoints.sort((a, b) => new Date(b.ts) - new Date(a.ts));
  }
  
  return pivotPoints;
}

/**
 * Format narrative entries to legacy diary format for snapshot storage
 */
export function formatDiaryForSnapshot(narrativeEntries, treeId) {
  return narrativeEntries.map(entry => ({
    title: entry.text,
    text: `${entry.icon} ${entry.text}`,
    ts: entry.ts,
    sources: entry.sources,
    // Extended fields for UI navigation
    nodeId: entry.nodeId,
    turnId: entry.turnId,
    eventType: entry.type,
  }));
}

/**
 * Generate plain text diary for the `diary` column
 */
export function formatDiaryText(narrativeEntries) {
  return narrativeEntries
    .map(e => `- ${e.icon} ${e.text} (${(e.sources || []).slice(0, 2).join(', ')})`)
    .join('\n');
}

export default {
  trailNarrativeFromEvents,
  formatDiaryForSnapshot,
  formatDiaryText,
};
