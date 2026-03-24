/**
 * Context Serializer (T50-1, T51-3)
 * 
 * Converts structured context data into a clean text format for LLM consumption.
 * No behavioral instructions - only structural context.
 * T51-3: Added minimal system anchor (role + task, no style/behavior constraints).
 */

// Environment config for legacy prompt compatibility
const ENABLE_PROMPT_GUIDE_FLAG = (process.env.ENABLE_PROMPT_GUIDE || 'false').toLowerCase();
export const ENABLE_PROMPT_GUIDE = ['1', 'true', 'yes', 'on'].includes(ENABLE_PROMPT_GUIDE_FLAG);

// T51-3: Context anchor toggle (default: enabled)
const ENABLE_CONTEXT_ANCHOR_FLAG = (process.env.ENABLE_CONTEXT_ANCHOR || 'true').toLowerCase();
export const ENABLE_CONTEXT_ANCHOR = ['1', 'true', 'yes', 'on'].includes(ENABLE_CONTEXT_ANCHOR_FLAG);

// T51-3: Minimal system anchor - role + task only, no style/behavior constraints
const CONTEXT_ANCHOR_EN = `You are continuing a structured conversation inside the user's knowledge tree.
Use the context below to understand what has been discussed and answer the user's next question naturally.`;

const CONTEXT_ANCHOR_ZH = `你正在用户的知识树中继续对话。
以下内容是相关上下文，请基于它直接回答用户的问题，不必重复提问。`;

/**
 * Build context data object from normalized payload and layered sections.
 * @param {object} params
 * @param {string} [params.pathSummary] - Path/breadcrumb summary
 * @param {string} [params.nodeSummary] - Current node/parent summary
 * @param {string} [params.rollingSummary] - Rolling summary (compressed history)
 * @param {Array} [params.recentDialogue] - Recent conversation turns
 * @param {Array} [params.coreFacts] - Core facts extracted
 * @param {string} [params.treeStory] - Full tree summary
 * @param {string} [params.topic] - Root topic
 * @param {string} [params.topicTag] - Sub-topic tag
 * @returns {object} Structured context data
 */
export function buildContextData({
    pathSummary = '',
    nodeSummary = '',
    rollingSummary = '',
    recentDialogue = [],
    coreFacts = [],
    treeStory = '',
    topic = '',
    topicTag = '',
    crossBranch = null,
} = {}) {
    return {
        path_summary: pathSummary,
        node_summary: nodeSummary,
        rolling_summary: rollingSummary,
        recent_dialogue: Array.isArray(recentDialogue) ? recentDialogue : [],
        core_facts: Array.isArray(coreFacts) ? coreFacts : [],
        tree_story: treeStory,
        topic: topic,
        topic_tag: topicTag,
        cross_branch: crossBranch,
    };
}

/**
 * Serialize context data to a clean text block.
 * Format:
 * ```
 * # Context
 * - Path: ...
 * - Node: ...
 * - Recent: ...
 * - Facts: ...
 * - Tree: ...
 * ```
 * 
 * @param {object} contextData - Structured context data from buildContextData
 * @param {object} [options]
 * @param {string} [options.lang='en'] - Language for labels (en/zh)
 * @returns {string} Serialized context text
 */
export function serializeContext(contextData = {}, options = {}) {
    const lang = (options.lang || 'en').toLowerCase();
    const isZh = lang.startsWith('zh');

    // Clean labels - no behavioral instructions
    const labels = isZh ? {
        header: '# 上下文',
        path: '路径',
        node: '节点',
        history: '历史摘要',
        recent: '近期对话',
        facts: '核心要点',
        tree: '树概况',
        crossBranch: '跨分支引用',
        topic: '主题',
        topicTag: '子话题',
    } : {
        header: '# Context',
        path: 'Path',
        node: 'Node',
        history: 'History',
        recent: 'Recent',
        facts: 'Facts',
        tree: 'Tree',
        crossBranch: 'Cross-branch',
        topic: 'Topic',
        topicTag: 'Sub-topic',
    };

    const lines = [labels.header];

    // Topic line
    if (contextData.topic) {
        const topicLine = contextData.topic_tag
            ? `- ${labels.topic}: ${contextData.topic} (${labels.topicTag}: ${contextData.topic_tag})`
            : `- ${labels.topic}: ${contextData.topic}`;
        lines.push(topicLine);
    }

    // Path summary
    if (contextData.path_summary) {
        lines.push(`- ${labels.path}: ${contextData.path_summary}`);
    }

    // Node summary
    if (contextData.node_summary) {
        lines.push(`- ${labels.node}: ${contextData.node_summary}`);
    }

    // Rolling summary (P0)
    if (contextData.rolling_summary) {
        lines.push(`- ${labels.history}: ${contextData.rolling_summary}`);
    }

    // Recent dialogue
    if (contextData.recent_dialogue && contextData.recent_dialogue.length > 0) {
        lines.push(`- ${labels.recent}:`);
        for (const turn of contextData.recent_dialogue) {
            const role = turn.role || 'user';
            const text = turn.text || '';
            if (text) {
                lines.push(`  - ${role}: ${text}`);
            }
        }
    }

    // Core facts
    if (contextData.core_facts && contextData.core_facts.length > 0) {
        lines.push(`- ${labels.facts}:`);
        for (const fact of contextData.core_facts) {
            if (fact) {
                lines.push(`  - ${fact}`);
            }
        }
    }

    // Cross-branch references (P2)
    if (contextData.cross_branch?.branches?.length) {
        lines.push(`- ${labels.crossBranch}:`);
        for (const [idx, branch] of contextData.cross_branch.branches.entries()) {
            const score = Number.isFinite(branch?.relevanceScore) ? `${Math.round(branch.relevanceScore * 100)}%` : 'n/a';
            const branchId = typeof branch?.branchId === 'string' ? branch.branchId : '';
            lines.push(`  - #${idx + 1} (${score}) ${branchId}`.trim());
            const summary = branch?.summary || {};
            if (summary?.overview) {
                lines.push(`    - 主题: ${summary.overview}`);
            }
            if (Array.isArray(summary?.key_points) && summary.key_points.length > 0) {
                lines.push('    - 要点:');
                for (const p of summary.key_points) {
                    if (p) lines.push(`      - ${p}`);
                }
            }
            if (summary?.conclusions) {
                lines.push(`    - 结论: ${summary.conclusions}`);
            }
            if (Array.isArray(summary?.open_questions) && summary.open_questions.length > 0) {
                lines.push(`    - 未解决问题: ${summary.open_questions.join('; ')}`);
            }
        }
    }

    // Tree story
    if (contextData.tree_story) {
        lines.push(`- ${labels.tree}: ${contextData.tree_story}`);
    }

    // Only return content if there's something beyond the header
    if (lines.length <= 1) {
        return '';
    }

    const contextBlock = lines.join('\n');

    // T51-3: Prepend minimal system anchor if enabled
    if (ENABLE_CONTEXT_ANCHOR) {
        const anchor = isZh ? CONTEXT_ANCHOR_ZH : CONTEXT_ANCHOR_EN;
        return `${anchor}\n\n${contextBlock}`;
    }

    return contextBlock;
}

/**
 * Legacy prompt guide (deprecated - for compatibility only)
 * Only used when ENABLE_PROMPT_GUIDE=true
 * @deprecated Use serializeContext instead
 */
export function getLegacyPromptGuide(lang = 'en') {
    if (!ENABLE_PROMPT_GUIDE) {
        return '';
    }
    const isZh = lang.startsWith('zh');
    return isZh
        ? '以下是从用户知识树中提取的相关上下文和之前对话。请基于此自然地回应用户。'
        : 'Below is the relevant context and previous conversation extracted from the user\'s knowledge tree. You should use it to answer the user\'s next message naturally.';
}

export default {
    serializeContext,
    buildContextData,
    getLegacyPromptGuide,
    ENABLE_PROMPT_GUIDE,
    ENABLE_CONTEXT_ANCHOR,
};
