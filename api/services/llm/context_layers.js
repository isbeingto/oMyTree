/**
 * Layered context builder: splits system prompt into semantic layers and deduplicates content.
 */
import { TREE_SUMMARY_LIMIT } from './context_limits.js';

/**
 * Truncate text at sentence boundaries when possible, falling back to character clamp with ellipsis.
 * @param {string} value
 * @param {number} limit
 * @returns {string}
 */
export function truncateBySentence(value, limit) {
  if (!value || typeof value !== 'string') return '';
  if (!limit || limit <= 0) return value.trim();
  const trimmed = value.trim();
  if (trimmed.length <= limit) return trimmed;

  const sentences = trimmed.match(/[^。！？!?.]+[。！？!?.]?/g) || [trimmed];
  const collected = [];
  let total = 0;
  for (const sentence of sentences) {
    const s = sentence.trim();
    if (!s) continue;
    const nextTotal = total + s.length + (collected.length > 0 ? 1 : 0); // count a space/newline
    if (nextTotal > limit) break;
    collected.push(s);
    total = nextTotal;
  }

  if (collected.length === 0) {
    return `${trimmed.slice(0, limit)}…`;
  }
  const joined = collected.join(' ');
  return joined.length < trimmed.length ? `${joined}…` : joined;
}

/**
 * @typedef {Object} LayeredContextInput
 * @property {'branch'|'tree'} scope
 * @property {string[]} breadcrumbTitles
 * @property {string} pathSummary
 * @property {string} parentSummary
 * @property {string} parentFullText
 * @property {string} treeSummary
 * @property {string} [rollingSummary]
 * @property {Array<{role:string,text:string}>} recentTurns
 * @property {string|null} activeTopicTag
 * @property {object} limits
 * @property {number} limits.pathSummary
 * @property {number} limits.parentSummary
 * @property {number} [limits.rollingSummary]
 * @property {number} limits.parentFull
 * @property {number} limits.recentTurnChars
 * @property {number} limits.treeStory
 */

/**
 * @typedef {Object} LayeredContext
 * @property {string|null} tree_story
 * @property {string|null} rolling_summary
 * @property {string[]} core_facts
 * @property {string|null} path_background
 * @property {Array<{role:string,text:string}>} recent_dialogue
 */

/**
 * Build layered context sections with deduplication.
 * Prefers path_summary + parent_summary; falls back to compact breadcrumbs only when summaries are empty.
 * @param {LayeredContextInput} params
 * @param {{ userText?: string, semanticCoreFactsEnabled?: boolean, profile?: string }} [options]
 * @returns {LayeredContext}
 */
export async function buildLayeredContextSections(params, options = {}) {
	  const {
	    scope = 'branch',
	    breadcrumbTitles = [],
	    pathSummary = '',
	    parentSummary = '',
	    parentFullText = '',
	    treeSummary = '',
	    rollingSummary = '',
	    recentTurns = [],
	    activeTopicTag = null,
	    limits = {},
	  } = params || {};
  const userText = typeof options.userText === 'string' ? options.userText.trim() : '';
  const semanticCoreFactsEnabled = Boolean(options.semanticCoreFactsEnabled);
  const profile = typeof options.profile === 'string' ? options.profile.trim().toLowerCase() : 'lite';

	  const sections = {
	    tree_story: null,
	    rolling_summary: null,
	    core_facts: [],
	    path_background: null,
	    recent_dialogue: [],
	  };

  const seen = new Set();
  const addUnique = (text) => {
    if (!text || typeof text !== 'string') return null;
    const trimmed = text.trim();
    if (!trimmed) return null;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return null;
    seen.add(key);
    return trimmed;
  };

  const normalizedParentFull = limits.parentFull > 0
    ? truncateBySentence(parentFullText || parentSummary, limits.parentFull)
    : '';
  const normalizedParentSummary = truncateBySentence(parentSummary, limits.parentSummary);
  const normalizedPathSummary = truncateBySentence(pathSummary, limits.pathSummary);
  const effectiveTreeLimit = limits.treeStory && limits.treeStory > 0
    ? Math.min(TREE_SUMMARY_LIMIT, limits.treeStory)
    : TREE_SUMMARY_LIMIT;
  const normalizedTreeSummary = scope === 'tree' && treeSummary
    ? truncateBySentence(treeSummary, effectiveTreeLimit)
    : '';

	  if (normalizedTreeSummary) {
	    const t = addUnique(normalizedTreeSummary);
	    if (t) sections.tree_story = t;
	  }

	  const normalizedRollingSummary =
	    typeof rollingSummary === 'string' && rollingSummary.trim()
	      ? truncateBySentence(rollingSummary.trim(), limits.rollingSummary || limits.parentSummary || 200)
	      : '';

	  if (normalizedRollingSummary) {
	    const t = addUnique(normalizedRollingSummary);
	    if (t) sections.rolling_summary = t;
	  }

  const coreFactCandidates = [];
  if (normalizedParentFull) coreFactCandidates.push(normalizedParentFull);
  if (normalizedParentSummary && normalizedParentSummary !== normalizedParentFull) {
    coreFactCandidates.push(normalizedParentSummary);
  }

  let orderedCoreFacts = coreFactCandidates;
  if (semanticCoreFactsEnabled && userText && coreFactCandidates.length > 1) {
    const topK = profile === 'lite' ? 1 : 2;
    const { rankTextsBySimilarity } = await import('./semantic_ranker.js');
    orderedCoreFacts = await rankTextsBySimilarity(coreFactCandidates, userText, topK);
  }
  for (const fact of orderedCoreFacts) {
    const t = addUnique(fact);
    if (t) sections.core_facts.push(t);
  }

  let pathCandidates = [];
  if (normalizedPathSummary) pathCandidates.push(normalizedPathSummary);
  if ((!normalizedPathSummary && Array.isArray(breadcrumbTitles) && breadcrumbTitles.length) || semanticCoreFactsEnabled) {
    const compactPath = breadcrumbTitles.slice(-3).filter(Boolean).join(' / ');
    const compact = truncateBySentence(compactPath, limits.pathSummary || 200);
    if (compact) pathCandidates.push(compact);
  }
  let pathBackground = pathCandidates.find(Boolean);
  if (semanticCoreFactsEnabled && userText && pathCandidates.length > 1) {
    const { rankTextsBySimilarity } = await import('./semantic_ranker.js');
    const ranked = await rankTextsBySimilarity(pathCandidates, userText, 1);
    pathBackground = ranked[0] || pathBackground;
  }
  if (pathBackground) {
    const t = addUnique(pathBackground);
    if (t) sections.path_background = t;
  }

  const turnLimit = Math.max(0, limits.recentTurns || 0);
  const perTurnLimit = limits.recentTurnChars || limits.parentSummary || 200;
  const activeTag = typeof activeTopicTag === 'string' ? activeTopicTag.trim().toLowerCase() : '';
  let sourceTurns = Array.isArray(recentTurns) ? [...recentTurns] : [];
  if (activeTag) {
    const matching = sourceTurns.filter(
      (t) => typeof t?.topic_tag === 'string' && t.topic_tag.trim().toLowerCase() === activeTag
    );
    if (matching.length) {
      sourceTurns = matching;
    }
  }
  const trimmedRecent = sourceTurns.slice(0, turnLimit);
  for (const turn of trimmedRecent) {
    const role = typeof turn?.role === 'string' ? turn.role : 'user';
    const text = truncateBySentence(turn?.text || '', perTurnLimit);
    const t = addUnique(text);
    if (t) {
      sections.recent_dialogue.push({ 
        role, 
        text: t,
        attachments: Array.isArray(turn.attachments) ? turn.attachments : [],
      });
    }
  }

  return sections;
}
