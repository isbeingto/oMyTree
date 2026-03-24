/**
 * T61/T67: Memo prompt templates for Session Memo generation
 * 
 * Generates 3-7 bullet points from recent conversation nodes
 * with anchors for jump-back navigation.
 * 
 * T67: Language-aware prompts (en/zh) with auto-detection.
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// T67: Load language-specific prompts
let MEMO_SYSTEM_PROMPT_EN = '';
let MEMO_SYSTEM_PROMPT_ZH = '';

try {
    MEMO_SYSTEM_PROMPT_EN = readFileSync(join(__dirname, 'memo_prompt.en.md'), 'utf-8');
    MEMO_SYSTEM_PROMPT_ZH = readFileSync(join(__dirname, 'memo_prompt.zh.md'), 'utf-8');
} catch (e) {
    console.warn('[memo_prompt] Failed to load prompt templates:', e.message);
    // Fallback inline prompts
    MEMO_SYSTEM_PROMPT_EN = 'You are a project secretary. Output JSON with bullets array. Output must be in English only.';
    MEMO_SYSTEM_PROMPT_ZH = '你是一个项目秘书。输出 JSON 格式的 bullets 数组。输出必须全部使用中文。';
}

// Legacy default (Chinese) - kept for backward compat
const MEMO_SYSTEM_PROMPT = MEMO_SYSTEM_PROMPT_ZH;

/**
 * T67: Detect language from keyframes using CJK vs Latin character ratio
 * @param {Array<{user_text: string}>} keyframes - Conversation keyframes
 * @param {string} uiLang - Fallback UI language ('en' | 'zh')
 * @returns {'en' | 'zh'}
 */
export function detectLanguage(keyframes, uiLang = 'zh') {
    if (!keyframes || keyframes.length === 0) {
        return uiLang;
    }

    // Sample last N user texts (most recent are more relevant)
    const sampleSize = Math.min(5, keyframes.length);
    const recentKeyframes = keyframes.slice(-sampleSize);
    const combinedText = recentKeyframes.map(kf => kf.user_text || '').join(' ');

    if (combinedText.length < 10) {
        // Too short to determine, use UI language
        return uiLang;
    }

    // Count CJK characters (Chinese, Japanese, Korean)
    const cjkRegex = /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef]/g;
    const cjkMatches = combinedText.match(cjkRegex) || [];
    const cjkCount = cjkMatches.length;

    // Count Latin letters (a-z, A-Z)
    const latinRegex = /[a-zA-Z]/g;
    const latinMatches = combinedText.match(latinRegex) || [];
    const latinCount = latinMatches.length;

    const totalSignificant = cjkCount + latinCount;

    if (totalSignificant < 10) {
        // Mostly code/symbols, use UI language
        return uiLang;
    }

    const cjkRatio = cjkCount / totalSignificant;
    const latinRatio = latinCount / totalSignificant;

    // Decision thresholds
    if (cjkRatio > 0.6) {
        return 'zh';
    }
    if (latinRatio > 0.6) {
        return 'en';
    }

    // Ambiguous (mixed), fallback to UI language
    return uiLang;
}

/**
 * T67: Get system prompt for specified language
 * @param {'en' | 'zh'} lang
 * @returns {string}
 */
export function getMemoSystemPrompt(lang) {
    return lang === 'en' ? MEMO_SYSTEM_PROMPT_EN : MEMO_SYSTEM_PROMPT_ZH;
}

/**
 * Build USER prompt with node keyframes
 * @param {Array<{node_id: string, user_text: string, ai_text: string, ts: string}>} keyframes
 * @param {'en' | 'zh'} lang - Target language
 * @returns {string}
 */
export function buildMemoUserPrompt(keyframes, lang = 'zh') {
    const keyframeLines = keyframes.map((kf, idx) => {
        const userSnippet = truncateText(kf.user_text || '', 100);
        const aiSnippet = truncateText(kf.ai_text || '', 200);
        return `${idx + 1}) node_id=${kf.node_id}
   user: ${userSnippet}
   assistant: ${aiSnippet}`;
    }).join('\n\n');

    if (lang === 'en') {
        return `Here are the recent conversation keyframes (sorted by time). Generate 3-7 bullets.

Requirements:
- Write only "progress/pivots/decisions/key findings/uncertain points", no chronological log
- Each bullet should not exceed 50 English characters (keep it short)
- Each must have anchors: select 1-3 node_ids from below
- Output strict JSON only, no other content

Input keyframes:
${keyframeLines}`;
    }

    return `给你最近的对话节点关键帧（按时间排序）。请生成 3-7 条 bullets。

要求：
- 只写"推进/转折/决定/关键发现/仍未确定的点"，不要流水账
- 每条不超过 28 个中文字符（尽量短）
- 每条必须给出 anchors：从下面的节点里选 1-3 个 node_id
- 输出严格 JSON，不要输出其他内容

输入关键帧：
${keyframeLines}`;
}

/**
 * Build full messages array for LLM call
 * @param {Array<{node_id: string, user_text: string, ai_text: string, ts: string}>} keyframes
 * @param {'en' | 'zh'} lang - Target language
 * @returns {Array<{role: string, content: string}>}
 */
export function buildMemoMessages(keyframes, lang = 'zh') {
    return [
        { role: 'system', content: getMemoSystemPrompt(lang) },
        { role: 'user', content: buildMemoUserPrompt(keyframes, lang) },
    ];
}

/**
 * Truncate text to maxLen characters
 * @param {string} text
 * @param {number} maxLen
 * @returns {string}
 */
function truncateText(text, maxLen) {
    if (!text) return '';
    const trimmed = text.trim();
    if (trimmed.length <= maxLen) return trimmed;
    return trimmed.slice(0, maxLen - 3) + '...';
}

/**
 * Extract the first valid JSON object from a string using balanced brace matching.
 * Handles cases where LLM adds trailing commentary after the JSON.
 * @param {string} text - Raw text containing JSON
 * @returns {string|null} - Extracted JSON string or null
 */
function extractFirstJsonObject(text) {
    if (!text || typeof text !== 'string') return null;

    const startIdx = text.indexOf('{');
    if (startIdx === -1) return null;

    let depth = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = startIdx; i < text.length; i++) {
        const char = text[i];

        if (escapeNext) {
            escapeNext = false;
            continue;
        }

        if (char === '\\' && inString) {
            escapeNext = true;
            continue;
        }

        if (char === '"' && !escapeNext) {
            inString = !inString;
            continue;
        }

        if (inString) continue;

        if (char === '{') {
            depth++;
        } else if (char === '}') {
            depth--;
            if (depth === 0) {
                return text.slice(startIdx, i + 1);
            }
        }
    }

    // Fallback: return from first { to last } (original behavior for edge cases)
    const endIdx = text.lastIndexOf('}');
    if (endIdx > startIdx) {
        return text.slice(startIdx, endIdx + 1);
    }

    return null;
}

/**
 * Parse and validate LLM response for memo bullets
 * @param {string|object} response - Raw LLM response
 * @param {Array<string>} validNodeIds - Valid node IDs from input
 * @returns {{bullets: Array<{text: string, anchors: Array<{type: string, id: string}>}>}}
 */
export function parseMemoResponse(response, validNodeIds) {
    let parsed;

    if (typeof response === 'string') {
        // Try to extract JSON from response using balanced brace matching
        const extracted = extractFirstJsonObject(response);
        if (!extracted) {
            throw new Error('memo_parse_failed: no JSON found in response');
        }
        try {
            parsed = JSON.parse(extracted);
        } catch (e) {
            throw new Error(`memo_parse_failed: invalid JSON - ${e.message}`);
        }
    } else if (typeof response === 'object') {
        parsed = response;
    } else {
        throw new Error('memo_parse_failed: unexpected response type');
    }

    // Validate structure
    if (!parsed.bullets || !Array.isArray(parsed.bullets)) {
        throw new Error('memo_parse_failed: bullets array missing');
    }

    if (parsed.bullets.length < 3) {
        console.warn('[memo] LLM returned fewer than 3 bullets, proceeding anyway');
    }

    if (parsed.bullets.length > 7) {
        console.warn('[memo] LLM returned more than 7 bullets, truncating');
        parsed.bullets = parsed.bullets.slice(0, 7);
    }

    // Validate and filter anchors
    const validIdSet = new Set(validNodeIds);
    const validatedBullets = parsed.bullets.map((bullet, idx) => {
        const text = typeof bullet.text === 'string' ? bullet.text.trim() : `Bullet ${idx + 1}`;
        let anchors = Array.isArray(bullet.anchors) ? bullet.anchors : [];

        // Filter to only valid node IDs
        anchors = anchors
            .filter(a => a && typeof a.id === 'string')
            .filter(a => validIdSet.has(a.id))
            .map(a => ({ type: 'node', id: a.id }));

        // If no valid anchors, use first valid node as fallback
        if (anchors.length === 0 && validNodeIds.length > 0) {
            anchors = [{ type: 'node', id: validNodeIds[0] }];
        }

        return { text, anchors };
    }).filter(b => b.text.length > 0);

    return { bullets: validatedBullets };
}

export { MEMO_SYSTEM_PROMPT };

// ============================================
// T75: Grounding & Drift Guardrails
// ============================================

/**
 * Find nearest valid node by timestamp proximity
 * @param {string} badId - The invalid node ID
 * @param {Set<string>} validSet - Set of valid node IDs
 * @param {Map<string, object>} nodeMap - node_id -> {id, created_at}
 * @returns {string|null} - Nearest valid node ID or null
 */
function findNearestValidNode(badId, validSet, nodeMap) {
    // Simple fallback: return latest valid node (most likely relevant)
    // Could be enhanced with timestamp proximity if badId has metadata
    const validNodes = Array.from(validSet);
    if (validNodes.length === 0) return null;

    // Return the last valid node (most recent in scope)
    return validNodes[validNodes.length - 1];
}

/**
 * T75: Verify all bullet anchors exist and are in scope
 * @param {Array<{text: string, anchors: Array<{type: string, id: string}>}>} bullets
 * @param {Array<string>|Set<string>} validNodeIds - Valid node_ids in scope (tree + window)
 * @param {Map<string, object>|null} nodeMap - Optional: node_id -> {id, created_at} for repair
 * @returns {{ ok: boolean, bad_refs: string[], affected_count: number, bullets: Array }}
 */
export function verifyMemoIntegrity(bullets, validNodeIds, nodeMap = null) {
    const validSet = validNodeIds instanceof Set ? validNodeIds : new Set(validNodeIds);
    const badRefs = [];

    const bulletsWithStatus = bullets.map((b, idx) => {
        const goodAnchors = [];
        const repairs = [];
        let verified = true;

        for (const anchor of (b.anchors || [])) {
            if (!anchor || typeof anchor.id !== 'string') continue;

            if (validSet.has(anchor.id)) {
                goodAnchors.push({ type: 'node', id: anchor.id });
            } else {
                badRefs.push(anchor.id);
                verified = false;

                // Try nearest-neighbor repair
                if (nodeMap && nodeMap.size > 0) {
                    const nearest = findNearestValidNode(anchor.id, validSet, nodeMap);
                    if (nearest) {
                        goodAnchors.push({ type: 'node', id: nearest });
                        repairs.push({ from: anchor.id, to: nearest, rule: 'nearest_neighbor' });
                    }
                }
            }
        }

        // If all anchors were bad and no repairs, bullet becomes anchor-less
        return {
            text: b.text,
            anchors: goodAnchors,
            verified,
            ...(repairs.length > 0 ? { repairs } : {}),
        };
    });

    const affectedCount = bulletsWithStatus.filter(b => !b.verified).length;

    return {
        ok: badRefs.length === 0,
        bad_refs: [...new Set(badRefs)],
        affected_count: affectedCount,
        bullets: bulletsWithStatus,
    };
}

// ============================================
// T62/T67: Incremental Relay Prompt Templates (Language-aware)
// ============================================

const MEMO_INCREMENTAL_SYSTEM_PROMPT_ZH = `你是一个"项目秘书"，负责更新进度备忘录。

你会收到：
1. 上一份备忘录（可能已过期）
2. 之后新增的对话关键帧

你的任务是输出更新后的 memo（3-7 条 bullets），尽量复用旧背景信息，避免跑题。

输出必须是严格的 JSON 格式，包含 bullets 数组。
每条 bullet 都必须包含 anchors（节点 ID 列表），用于前端跳转。

**重要：输出必须全部使用中文。不要混用语言。所有 bullet 文本必须是中文。**

重要规则:
- bullets 数量: 3-7 条
- 每条 text 不超过 28 个中文字符
- 允许用图标前缀：✅ 已确定 / 🚫 已排除 / 🔀 转折决定 / 💡 关键发现 / ❓ 仍未确定 / 📌 待办
- anchors 必须非空，选 1-3 个最相关的 node_id
- 如果 delta 为空或没有实质推进，输出：[{"text": "☕️ 最近没有实质推进", "anchors": [最后一个节点]}]
- 只输出 JSON，不要输出其他任何内容`;

const MEMO_INCREMENTAL_SYSTEM_PROMPT_EN = `You are a "project secretary" responsible for updating the progress memo.

You will receive:
1. The previous memo (may be outdated)
2. New conversation keyframes since then

Your task is to output an updated memo (3-7 bullets), reusing old background info and avoiding tangents.

Output must be strict JSON format containing a bullets array.
Each bullet must contain anchors (node ID list) for frontend navigation.

**CRITICAL: Output must be in English only. Do not mix languages. All bullet text must be in English.**

Important rules:
- Number of bullets: 3-7
- Each text should not exceed 50 English characters
- Allowed icon prefixes: ✅ Confirmed / 🚫 Ruled out / 🔀 Pivot / 💡 Key finding / ❓ Uncertain / 📌 To-do
- anchors must not be empty, select 1-3 most relevant node_ids
- If delta is empty or no real progress, output: [{"text": "☕️ No significant progress recently", "anchors": [last_node]}]
- Output JSON only, no other content`;

// Legacy default (Chinese)
const MEMO_INCREMENTAL_SYSTEM_PROMPT = MEMO_INCREMENTAL_SYSTEM_PROMPT_ZH;

/**
 * T67: Get incremental system prompt for specified language
 */
function getIncrementalSystemPrompt(lang) {
    return lang === 'en' ? MEMO_INCREMENTAL_SYSTEM_PROMPT_EN : MEMO_INCREMENTAL_SYSTEM_PROMPT_ZH;
}

/**
 * T62/T67: Build USER prompt for incremental update
 * @param {Array} previousBullets - Bullets from previous memo
 * @param {Array} deltaKeyframes - New keyframes since last memo
 * @param {'en' | 'zh'} lang - Target language
 * @returns {string}
 */
export function buildIncrementalMemoUserPrompt(previousBullets, deltaKeyframes, lang = 'zh') {
    const oldBulletsText = previousBullets.map((b, i) => `${i + 1}. ${b.text}`).join('\n');

    const deltaLines = deltaKeyframes.map((kf, idx) => {
        const userSnippet = truncateText(kf.user_text || '', 100);
        const aiSnippet = truncateText(kf.ai_text || '', 200);
        return `${idx + 1}) node_id=${kf.node_id}
   user: ${userSnippet}
   assistant: ${aiSnippet}`;
    }).join('\n\n');

    if (lang === 'en') {
        if (deltaKeyframes.length === 0) {
            return `Previous memo:
${oldBulletsText}

No new conversations since last memo.

If there is truly no progress, output: {"bullets": [{"text": "☕️ No significant progress recently", "anchors": []}]}
Otherwise, keep the original memo content.`;
        }

        return `Previous memo (may be outdated):
${oldBulletsText}

New keyframes since then (${deltaKeyframes.length} total):
${deltaLines}

Output updated memo (3-7 bullets), reuse old background, avoid tangents.
- Select anchors from new keyframes
- Output strict JSON only`;
    }

    // Chinese (default)
    if (deltaKeyframes.length === 0) {
        return `这是上一份备忘录：
${oldBulletsText}

自上次备忘录以来，没有新增对话。

如果确实没有实质推进，请输出：{"bullets": [{"text": "☕️ 最近没有实质推进", "anchors": []}]}
否则，保持原有备忘录内容。`;
    }

    return `这是上一份备忘录（可能已过期）：
${oldBulletsText}

这是之后新增的关键帧（共 ${deltaKeyframes.length} 条）：
${deltaLines}

请输出更新后的 memo（3-7 条 bullets），并尽量复用旧背景，避免跑题。
- 从新增关键帧中选择 anchors
- 输出严格 JSON，不要输出其他内容`;
}

/**
 * T62/T67: Build messages for incremental memo update
 * @param {Array} previousBullets - Previous memo bullets
 * @param {Array} deltaKeyframes - New keyframes since last memo
 * @param {'en' | 'zh'} lang - Target language
 * @returns {Array<{role: string, content: string}>}
 */
export function buildIncrementalMemoMessages(previousBullets, deltaKeyframes, lang = 'zh') {
    return [
        { role: 'system', content: getIncrementalSystemPrompt(lang) },
        { role: 'user', content: buildIncrementalMemoUserPrompt(previousBullets, deltaKeyframes, lang) },
    ];
}

export { MEMO_INCREMENTAL_SYSTEM_PROMPT };

