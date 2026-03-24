/**
 * P1-05: Semantic Selection Evaluation Scaffold
 * 
 * Offline comparison of time-based vs semantic selection strategies.
 * No user privacy data - for local/CI evaluation only.
 */
import { selectRecentDialogueSemantic } from './recent_dialogue_semantic.js';

/**
 * Compare time-based (recency) selection vs semantic selection.
 * @param {object} params
 * @param {Array<{role:string,text:string}>} params.turns
 * @param {string} params.userText
 * @param {number} params.limit
 * @param {string} params.profile
 * @returns {Promise<object>}
 */
export async function compareSelectionStrategies({
    turns = [],
    userText = '',
    limit = 4,
    profile = 'lite',
} = {}) {
    // Time-based (recency) selection - just take the most recent
    const recencyBased = turns.slice(0, limit).map((t) => ({
        role: t.role,
        text: t.text,
    }));

    // Semantic selection
    const semanticBased = await selectRecentDialogueSemantic({
        turns,
        userText,
        limit,
        profile,
    });

    // Calculate overlap
    const recencyTexts = new Set(recencyBased.map((t) => t.text));
    const overlap = semanticBased.filter((t) => recencyTexts.has(t.text)).length;
    const overlapRatio = limit > 0 ? overlap / Math.min(limit, semanticBased.length) : 0;

    // Check if semantic selection changed the order or content
    const isIdentical =
        recencyBased.length === semanticBased.length &&
        recencyBased.every((t, i) => t.text === semanticBased[i]?.text);

    return {
        recencyBased,
        semanticBased,
        overlap,
        overlapRatio,
        isIdentical,
        stats: {
            recencyCount: recencyBased.length,
            semanticCount: semanticBased.length,
            turnsTotal: turns.length,
            limit,
        },
    };
}

/**
 * Batch evaluate across multiple queries.
 * @param {Array<{turns: Array, userText: string, limit?: number, profile?: string}>} testCases
 * @returns {Promise<object>}
 */
export async function batchEvaluate(testCases = []) {
    const results = [];
    let totalOverlap = 0;
    let totalCases = 0;
    let identicalCount = 0;

    for (const testCase of testCases) {
        const result = await compareSelectionStrategies(testCase);
        results.push(result);
        totalOverlap += result.overlapRatio;
        totalCases += 1;
        if (result.isIdentical) identicalCount += 1;
    }

    return {
        results,
        summary: {
            totalCases,
            avgOverlapRatio: totalCases > 0 ? totalOverlap / totalCases : 0,
            identicalCount,
            identicalRatio: totalCases > 0 ? identicalCount / totalCases : 0,
        },
    };
}

export default {
    compareSelectionStrategies,
    batchEvaluate,
};
