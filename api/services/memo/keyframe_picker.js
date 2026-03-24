/**
 * T63: Heuristic Keyframe Picker for Session Memo
 * 
 * Selects 6-12 important keyframes from branch nodes based on:
 * 1. Topology signals: fork nodes, leaf nodes, depth bursts
 * 2. Behavior signals: evidence attachments
 * 3. Semantic weak signals: user prompt keywords
 */

// Scoring weights for each signal
const SIGNAL_WEIGHTS = {
    // Topology signals
    isLeaf: 3,           // Leaf nodes = conversation endpoints, often conclusions
    isFork: 5,           // Fork nodes = decision points with multiple paths
    depthBurst: 4,       // Sudden depth increase = deep dive into topic

    // Behavior signals
    hasEvidence: 6,      // Evidence attached = important validated point

    // Semantic weak signals (keywords in user text)
    hasDecisionKeyword: 4,  // "决定/决策/选择/不行/排除/确定"
    hasQuestionKeyword: 2,  // "为什么/怎么/如何/什么"
    hasSummaryKeyword: 3,   // "总结/报告/方案/计划"
    hasErrorKeyword: 3,     // "报错/错误/失败/问题"
    hasInsightKeyword: 3,   // "发现/原来/其实/关键"

    // Position signals
    isFirst: 2,          // First node = topic introduction
    isRecent: 2,         // Recent nodes = current focus
};

// Decision/transition keywords (Chinese + English)
const DECISION_KEYWORDS = [
    '决定', '决策', '选择', '不行', '排除', '确定', '放弃', '改为', '换成',
    'decide', 'chosen', 'reject', 'abandon', 'switch', 'instead'
];

const QUESTION_KEYWORDS = [
    '为什么', '怎么', '如何', '什么', '哪个', '能不能', '可以吗',
    'why', 'how', 'what', 'which', 'can'
];

const SUMMARY_KEYWORDS = [
    '总结', '报告', '方案', '计划', '结论', '汇总', '整理',
    'summary', 'plan', 'report', 'conclusion'
];

const ERROR_KEYWORDS = [
    '报错', '错误', '失败', '问题', '异常', '不对', '不work', '不行',
    'error', 'fail', 'bug', 'issue', 'wrong', 'broken'
];

const INSIGHT_KEYWORDS = [
    '发现', '原来', '其实', '关键', '重点', '核心', '本质', '原因',
    'found', 'realize', 'key', 'core', 'root cause', 'actually'
];

/**
 * Pick 6-12 keyframes from branch nodes based on heuristic signals
 * 
 * @param {Array} nodes - Branch nodes ordered from root to focus
 * @param {Object} options - Additional context
 * @param {Set<string>} options.evidenceNodeIds - Set of nodes with evidence
 * @returns {Array} Selected keyframes with scores
 */
export function pickKeyframes(nodes, options = {}) {
    const { evidenceNodeIds = new Set() } = options;

    if (nodes.length === 0) return [];
    if (nodes.length <= 6) {
        // Too few nodes, use all
        return nodes.map(n => ({ ...n, score: 1, signals: ['all'] }));
    }

    // Build parent-child relationships for topology analysis
    const childCount = new Map();
    for (const node of nodes) {
        if (node.parent_id) {
            childCount.set(node.parent_id, (childCount.get(node.parent_id) || 0) + 1);
        }
    }

    // Find leaf nodes (nodes that have no children in this branch)
    const nodeIds = new Set(nodes.map(n => n.id));
    const leafNodeIds = new Set(
        nodes.filter(n => !nodes.some(other => other.parent_id === n.id)).map(n => n.id)
    );

    // Score each node
    const scoredNodes = nodes.map((node, index) => {
        const signals = [];
        let score = 0;

        // Position signals
        if (index === 0) {
            score += SIGNAL_WEIGHTS.isFirst;
            signals.push('first');
        }
        if (index >= nodes.length - 3) {
            score += SIGNAL_WEIGHTS.isRecent;
            signals.push('recent');
        }

        // Topology signals
        if (leafNodeIds.has(node.id) && node.role === 'user') {
            score += SIGNAL_WEIGHTS.isLeaf;
            signals.push('leaf');
        }

        const children = childCount.get(node.id) || 0;
        if (children > 1) {
            score += SIGNAL_WEIGHTS.isFork;
            signals.push('fork');
        }

        // Depth burst detection (significant depth increase)
        if (index > 0 && node.depth && nodes[index - 1].depth) {
            const depthDelta = node.depth - nodes[index - 1].depth;
            if (depthDelta >= 2) {
                score += SIGNAL_WEIGHTS.depthBurst;
                signals.push('depth_burst');
            }
        }

        // Behavior signals
        if (evidenceNodeIds.has(node.id)) {
            score += SIGNAL_WEIGHTS.hasEvidence;
            signals.push('evidence');
        }

        // Semantic signals (only for user nodes)
        if (node.role === 'user' && node.text) {
            const text = node.text.toLowerCase();

            if (DECISION_KEYWORDS.some(kw => text.includes(kw.toLowerCase()))) {
                score += SIGNAL_WEIGHTS.hasDecisionKeyword;
                signals.push('decision_kw');
            }

            if (QUESTION_KEYWORDS.some(kw => text.includes(kw.toLowerCase()))) {
                score += SIGNAL_WEIGHTS.hasQuestionKeyword;
                signals.push('question_kw');
            }

            if (SUMMARY_KEYWORDS.some(kw => text.includes(kw.toLowerCase()))) {
                score += SIGNAL_WEIGHTS.hasSummaryKeyword;
                signals.push('summary_kw');
            }

            if (ERROR_KEYWORDS.some(kw => text.includes(kw.toLowerCase()))) {
                score += SIGNAL_WEIGHTS.hasErrorKeyword;
                signals.push('error_kw');
            }

            if (INSIGHT_KEYWORDS.some(kw => text.includes(kw.toLowerCase()))) {
                score += SIGNAL_WEIGHTS.hasInsightKeyword;
                signals.push('insight_kw');
            }
        }

        return { ...node, score, signals };
    });

    // Sort by score descending
    const sorted = [...scoredNodes].sort((a, b) => b.score - a.score);

    // Pick top 6-12 nodes, ensuring minimum coverage
    const MIN_KEYFRAMES = 6;
    const MAX_KEYFRAMES = 12;

    // Always include first and last user nodes
    const mustInclude = new Set();
    const firstUser = nodes.find(n => n.role === 'user');
    const lastUser = [...nodes].reverse().find(n => n.role === 'user');
    if (firstUser) mustInclude.add(firstUser.id);
    if (lastUser) mustInclude.add(lastUser.id);

    // Select top scorers + must includes
    const selectedIds = new Set(mustInclude);
    for (const node of sorted) {
        if (selectedIds.size >= MAX_KEYFRAMES) break;
        if (node.role === 'user') {
            selectedIds.add(node.id);
        }
    }

    // Ensure minimum
    while (selectedIds.size < MIN_KEYFRAMES) {
        for (const node of nodes) {
            if (!selectedIds.has(node.id) && node.role === 'user') {
                selectedIds.add(node.id);
                break;
            }
        }
        // Safety break
        if (selectedIds.size >= nodes.filter(n => n.role === 'user').length) break;
    }

    // Return in original order (preserving conversation flow)
    const selected = nodes.filter(n => selectedIds.has(n.id));

    // Add scores back
    const scoreMap = new Map(scoredNodes.map(n => [n.id, { score: n.score, signals: n.signals }]));

    return selected.map(n => ({
        ...n,
        score: scoreMap.get(n.id)?.score || 0,
        signals: scoreMap.get(n.id)?.signals || [],
    }));
}

/**
 * Build keyframes from picked nodes (pairs user+assistant)
 */
export function buildKeyframesFromPicked(pickedNodes, allNodes) {
    const keyframes = [];
    const allNodeMap = new Map(allNodes.map(n => [n.id, n]));

    for (const node of pickedNodes) {
        if (node.role !== 'user') continue;

        // Find the assistant response (next node after this user node)
        const nodeIndex = allNodes.findIndex(n => n.id === node.id);
        const assistantNode = nodeIndex >= 0 && nodeIndex + 1 < allNodes.length
            ? allNodes[nodeIndex + 1]
            : null;

        keyframes.push({
            node_id: node.id,
            user_text: node.text || '',
            ai_text: assistantNode?.role === 'assistant' ? (assistantNode.text || '') : '',
            ts: node.created_at,
            score: node.score,
            signals: node.signals,
        });
    }

    return keyframes;
}

export { SIGNAL_WEIGHTS, DECISION_KEYWORDS };
