/**
 * T72: Keyframe Picker V2 - Deterministic + Explainable
 * 
 * Selects K keyframes (default 8) with frozen weights and coverage slots.
 * Guarantees: same input → same output (deterministic selection).
 */
import crypto from 'crypto';

/**
 * FROZEN WEIGHTS V2 - Do not modify without incrementing version
 * Changes to weights break reproducibility for existing memos
 */
export const WEIGHTS_V2 = {
    // Topology signals
    fork: 5,        // >1 children = decision point
    leaf: 3,        // No children in branch = endpoint
    retry: 4,       // Same parent, multiple siblings = user retried
    deep_dive: 3,   // subchain_length ≥ 4 consecutive depth

    // Behavior signals (from existing DB tables)
    attachment: 6,  // node_evidence_links table
    model_switch: 4, // node.meta.model differs from previous

    // Text hints (user text only, lang-aware)
    error_kw: 4,    // 报错/错误/error/fail
    decide_kw: 4,   // 决定/选择/decide/chosen
    why_kw: 2,      // 为什么/why/how
    summary_kw: 3,  // 总结/结论/summary

    // Position signals
    first: 2,
    last: 2,
    deepest: 2,
};

export const KEYFRAME_PICKER_VERSION = 'v2';

/**
 * Compute stable hash of weights for reproducibility tracking
 */
export function computeWeightsHash() {
    const json = JSON.stringify(WEIGHTS_V2);
    return crypto.createHash('sha1').update(json).digest('hex').slice(0, 8);
}

// Language-aware keyword sets (user text only)
const KEYWORD_SETS = {
    error: {
        zh: ['报错', '错误', '失败', '问题', '异常', '不对', '不work', '不行'],
        en: ['error', 'fail', 'bug', 'issue', 'wrong', 'broken', 'crash'],
    },
    decide: {
        zh: ['决定', '决策', '选择', '确定', '放弃', '改为', '换成', '不行', '排除'],
        en: ['decide', 'chosen', 'reject', 'abandon', 'switch', 'instead', 'go with'],
    },
    why: {
        zh: ['为什么', '怎么', '如何', '什么', '哪个', '能不能'],
        en: ['why', 'how', 'what', 'which', 'can we'],
    },
    summary: {
        zh: ['总结', '报告', '方案', '计划', '结论', '汇总', '整理'],
        en: ['summary', 'plan', 'report', 'conclusion', 'overview'],
    },
};

/**
 * Check if text contains keywords for given type
 * @param {string} text - User text to scan
 * @param {string} type - 'error' | 'decide' | 'why' | 'summary'
 * @param {string} lang - 'en' | 'zh'
 * @returns {boolean}
 */
function hasKeyword(text, type, lang) {
    if (!text || !KEYWORD_SETS[type]) return false;
    const lowerText = text.toLowerCase();
    const keywords = [...(KEYWORD_SETS[type].zh || []), ...(KEYWORD_SETS[type].en || [])];
    return keywords.some(kw => lowerText.includes(kw.toLowerCase()));
}

/**
 * Configuration for keyframe selection
 */
const DEFAULT_K = 8;
const MAX_K = 20;
const DEEP_DIVE_MIN_CHAIN = 4;

/**
 * Select keyframes with deterministic, explainable logic
 * 
 * @param {Array} nodes - Branch nodes, will be sorted by (node_seq ASC) or (created_at ASC, id ASC)
 * @param {Object} options
 * @param {Set<string>} options.evidenceNodeIds - Nodes with evidence attached
 * @param {string} options.lang - 'en' | 'zh' for keyword matching
 * @param {number} options.k - Target keyframe count (default 8)
 * @returns {{keyframes: Array, keyframe_picker_version: string, weights_hash: string}}
 */
export function selectKeyframesV2(nodes, options = {}) {
    const {
        evidenceNodeIds = new Set(),
        lang = 'zh',
        k = DEFAULT_K,
    } = options;

    const targetK = Math.min(Math.max(1, k), MAX_K);

    if (nodes.length === 0) {
        return {
            keyframes: [],
            keyframe_picker_version: KEYFRAME_PICKER_VERSION,
            weights_hash: computeWeightsHash(),
        };
    }

    // Step 1: Sort nodes deterministically
    // Prefer node_seq if available, else created_at ASC, id ASC
    const sortedNodes = [...nodes].sort((a, b) => {
        if (a.node_seq !== undefined && b.node_seq !== undefined) {
            return a.node_seq - b.node_seq;
        }
        const timeA = new Date(a.created_at).getTime();
        const timeB = new Date(b.created_at).getTime();
        if (timeA !== timeB) return timeA - timeB;
        return (a.id || '').localeCompare(b.id || '');
    });

    // Filter to user nodes only for keyframe selection
    const userNodes = sortedNodes.filter(n => n.role === 'user');
    if (userNodes.length === 0) {
        return {
            keyframes: [],
            keyframe_picker_version: KEYFRAME_PICKER_VERSION,
            weights_hash: computeWeightsHash(),
        };
    }

    // Build analysis structures
    const nodeById = new Map(sortedNodes.map(n => [n.id, n]));
    const childCount = new Map();
    const siblingCount = new Map();

    for (const node of sortedNodes) {
        if (node.parent_id) {
            childCount.set(node.parent_id, (childCount.get(node.parent_id) || 0) + 1);
            // Track siblings for retry detection
            if (!siblingCount.has(node.parent_id)) {
                siblingCount.set(node.parent_id, []);
            }
            siblingCount.get(node.parent_id).push(node.id);
        }
    }

    // Find leaf nodes (no children in this branch)
    const leafNodeIds = new Set(
        sortedNodes
            .filter(n => !sortedNodes.some(other => other.parent_id === n.id))
            .map(n => n.id)
    );

    // Find deepest node
    const maxDepth = Math.max(...userNodes.map(n => n.depth || 0));
    const deepestNode = userNodes.find(n => (n.depth || 0) === maxDepth);

    // Detect deep_dive chains (consecutive depth increases)
    const deepDiveNodeIds = new Set();
    let chainLength = 1;
    for (let i = 1; i < sortedNodes.length; i++) {
        const prev = sortedNodes[i - 1];
        const curr = sortedNodes[i];
        if ((curr.depth || 0) > (prev.depth || 0)) {
            chainLength++;
            if (chainLength >= DEEP_DIVE_MIN_CHAIN && curr.role === 'user') {
                deepDiveNodeIds.add(curr.id);
            }
        } else {
            chainLength = 1;
        }
    }

    // Detect model switches
    const modelSwitchNodeIds = new Set();
    let prevModel = null;
    for (const node of sortedNodes) {
        const model = node.meta?.model || node.model || null;
        if (model && prevModel && model !== prevModel && node.role === 'user') {
            modelSwitchNodeIds.add(node.id);
        }
        if (model) prevModel = model;
    }

    // Score each user node
    const scoredNodes = userNodes.map((node, index) => {
        const reasons = [];
        let weight = 0;

        // Position signals
        if (index === 0) {
            weight += WEIGHTS_V2.first;
            reasons.push('first');
        }
        if (index === userNodes.length - 1) {
            weight += WEIGHTS_V2.last;
            reasons.push('last');
        }
        if (deepestNode && node.id === deepestNode.id) {
            weight += WEIGHTS_V2.deepest;
            reasons.push('deepest');
        }

        // Topology signals
        const children = childCount.get(node.id) || 0;
        if (children > 1) {
            weight += WEIGHTS_V2.fork;
            reasons.push('fork');
        }
        if (leafNodeIds.has(node.id)) {
            weight += WEIGHTS_V2.leaf;
            reasons.push('leaf');
        }

        // Retry: node's parent has multiple children (siblings)
        if (node.parent_id) {
            const siblings = siblingCount.get(node.parent_id) || [];
            if (siblings.length > 1) {
                weight += WEIGHTS_V2.retry;
                reasons.push('retry');
            }
        }

        // Deep dive
        if (deepDiveNodeIds.has(node.id)) {
            weight += WEIGHTS_V2.deep_dive;
            reasons.push('deep_dive');
        }

        // Behavior signals
        if (evidenceNodeIds.has(node.id)) {
            weight += WEIGHTS_V2.attachment;
            reasons.push('attachment');
        }
        if (modelSwitchNodeIds.has(node.id)) {
            weight += WEIGHTS_V2.model_switch;
            reasons.push('model_switch');
        }

        // Text hint signals (user text only)
        const text = node.text || '';
        if (hasKeyword(text, 'error', lang)) {
            weight += WEIGHTS_V2.error_kw;
            reasons.push('error_kw');
        }
        if (hasKeyword(text, 'decide', lang)) {
            weight += WEIGHTS_V2.decide_kw;
            reasons.push('decide_kw');
        }
        if (hasKeyword(text, 'why', lang)) {
            weight += WEIGHTS_V2.why_kw;
            reasons.push('why_kw');
        }
        if (hasKeyword(text, 'summary', lang)) {
            weight += WEIGHTS_V2.summary_kw;
            reasons.push('summary_kw');
        }

        return {
            node,
            weight,
            reasons,
            index, // For stable tie-breaking
        };
    });

    // Step 2: Coverage slot selection
    const selectedIds = new Set();
    const keyframes = [];

    const addKeyframe = (scored) => {
        if (!scored || selectedIds.has(scored.node.id)) return false;
        selectedIds.add(scored.node.id);
        keyframes.push({
            node_id: scored.node.id,
            reason_codes: scored.reasons.slice(0, 5), // Max 5 reason codes
            weight: scored.weight,
            title_preview: (scored.node.text || '').slice(0, 40).trim() || null,
        });
        return true;
    };

    // Slot 1: First user node
    if (scoredNodes.length > 0) {
        addKeyframe(scoredNodes[0]);
    }

    // Slot 2: Last user node
    if (scoredNodes.length > 1) {
        addKeyframe(scoredNodes[scoredNodes.length - 1]);
    }

    // Slot 3: Deepest user node (if not already selected)
    if (deepestNode) {
        const deepestScored = scoredNodes.find(s => s.node.id === deepestNode.id);
        if (deepestScored) addKeyframe(deepestScored);
    }

    // Slot 4: Latest error_kw match
    const errorNodes = scoredNodes.filter(s => s.reasons.includes('error_kw'));
    if (errorNodes.length > 0) {
        addKeyframe(errorNodes[errorNodes.length - 1]);
    }

    // Slot 5: Latest decide_kw match
    const decideNodes = scoredNodes.filter(s => s.reasons.includes('decide_kw'));
    if (decideNodes.length > 0) {
        addKeyframe(decideNodes[decideNodes.length - 1]);
    }

    // Slot 6: Top fork (highest scoring fork node)
    const forkNodes = scoredNodes.filter(s => s.reasons.includes('fork'));
    if (forkNodes.length > 0) {
        const topFork = forkNodes.reduce((best, curr) =>
            curr.weight > best.weight ? curr : best
        );
        addKeyframe(topFork);
    }

    // Remaining slots: by score DESC, stable tie-break by index ASC
    const remaining = scoredNodes
        .filter(s => !selectedIds.has(s.node.id))
        .sort((a, b) => {
            if (b.weight !== a.weight) return b.weight - a.weight;
            return a.index - b.index;
        });

    for (const scored of remaining) {
        if (keyframes.length >= targetK) break;
        addKeyframe(scored);
    }

    // Sort keyframes by original node order for output
    keyframes.sort((a, b) => {
        const idxA = userNodes.findIndex(n => n.id === a.node_id);
        const idxB = userNodes.findIndex(n => n.id === b.node_id);
        return idxA - idxB;
    });

    return {
        keyframes,
        keyframe_picker_version: KEYFRAME_PICKER_VERSION,
        weights_hash: computeWeightsHash(),
    };
}

/**
 * Build keyframe pairs (user + assistant) for LLM prompt
 * @param {Array} keyframesMeta - Output from selectKeyframesV2
 * @param {Array} allNodes - All branch nodes
 * @returns {Array} Keyframe pairs with text
 */
export function buildKeyframesFromV2(keyframesMeta, allNodes) {
    const nodeMap = new Map(allNodes.map(n => [n.id, n]));
    const keyframes = [];

    for (const kf of keyframesMeta) {
        const userNode = nodeMap.get(kf.node_id);
        if (!userNode || userNode.role !== 'user') continue;

        // Find assistant response (next node after user)
        const nodeIndex = allNodes.findIndex(n => n.id === kf.node_id);
        const assistantNode = nodeIndex >= 0 && nodeIndex + 1 < allNodes.length
            ? allNodes[nodeIndex + 1]
            : null;

        keyframes.push({
            node_id: kf.node_id,
            user_text: userNode.text || '',
            ai_text: assistantNode?.role === 'assistant' ? (assistantNode.text || '') : '',
            ts: userNode.created_at,
            weight: kf.weight,
            reason_codes: kf.reason_codes,
        });
    }

    return keyframes;
}

/**
 * Check drift guardrail: anchor must be in keyframes or 1-hop relative
 * @param {string} anchorNodeId - Bullet anchor node ID
 * @param {Array} keyframesMeta - Keyframes from selectKeyframesV2
 * @param {Map<string, object>} nodeById - Map of all nodes by ID
 * @returns {{valid: boolean, relation?: 'keyframe' | 'parent' | 'child'}}
 */
export function checkAnchorDrift(anchorNodeId, keyframesMeta, nodeById) {
    const keyframeIds = new Set(keyframesMeta.map(kf => kf.node_id));

    // Direct keyframe match
    if (keyframeIds.has(anchorNodeId)) {
        return { valid: true, relation: 'keyframe' };
    }

    const anchorNode = nodeById.get(anchorNodeId);
    if (!anchorNode) {
        return { valid: false };
    }

    // Check if parent is a keyframe
    if (anchorNode.parent_id && keyframeIds.has(anchorNode.parent_id)) {
        return { valid: true, relation: 'child' };
    }

    // Check if any child is a keyframe
    for (const kfId of keyframeIds) {
        const kfNode = nodeById.get(kfId);
        if (kfNode && kfNode.parent_id === anchorNodeId) {
            return { valid: true, relation: 'parent' };
        }
    }

    return { valid: false };
}
