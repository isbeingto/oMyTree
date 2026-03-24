import { requestWeKnoraJson } from "../../routes/knowledge/proxy.js";
import { HttpError } from "../../lib/errors.js";

function clampInt(value, { min, max, fallback }) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function normalizeWeKnoraApiKey(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function buildWeKnoraAuthHeaders(weknoraApiKey) {
  const apiKey = normalizeWeKnoraApiKey(weknoraApiKey);
  // Service layer must not assume res.locals exists. If apiKey is missing, defer decision to proxy layer:
  // - if WEKNORA_ALLOW_GLOBAL_KEY_FALLBACK=true, proxy will use WEKNORA_API_KEY
  // - otherwise proxy will raise a clear 500 (workspace_weknora_key_missing)
  if (!apiKey) return {};
  return { "X-API-Key": apiKey };
}

function isEmbeddingModelMissingError(err) {
  const msg = String(err?.message || "");
  const detailMsg = String(err?.detail?.error?.message || "");
  const detailCode = err?.detail?.error?.code;
  return (
    msg.includes("model ID cannot be empty") ||
    detailMsg.includes("model ID cannot be empty") ||
    String(detailCode) === "1007"
  );
}

function normalizeIdList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v)).filter(Boolean);
}

function extractDocIdFromResult(item) {
  if (!item || typeof item !== 'object') return null;
  const candidates = [
    item.knowledge_id,
    item.knowledgeId,
    item.knowledge,
    item.knowledge?.id,
    item.doc_id,
    item.docId,
    item.document_id,
    item.documentId,
  ];
  const found = candidates.find((v) => typeof v === 'string' || typeof v === 'number');
  if (!found) return null;
  const id = String(found).trim();
  return id.length > 0 ? id : null;
}

/**
 * KB-2.4: Perform hybrid search across multiple knowledge bases.
 * @param {string[]} knowledgeBaseIds
 * @param {string} query
 * @param {number} topK
 * @returns {Promise<Array>} Combined search results
 */
export async function searchKnowledgeBases(knowledgeBaseIds, query, topK = 5, { weknoraApiKey = null } = {}) {
  if (!Array.isArray(knowledgeBaseIds) || knowledgeBaseIds.length === 0) {
    return [];
  }

  // Deduplicate IDs
  const uniqueIds = [...new Set(knowledgeBaseIds.filter(Boolean))];
  const allResults = [];
  
  console.log(`[searchKnowledgeBases] Searching across ${uniqueIds.length} KBs: ${uniqueIds.join(', ')} (query: "${(query || '').slice(0, 50)}...")`);

  // Parallel search for better performance
  const safeTopK = clampInt(topK, { min: 1, max: 50, fallback: 5 });
  const weknoraHeaders = buildWeKnoraAuthHeaders(weknoraApiKey);
  const searchPromises = uniqueIds.map(async (kbId) => {
    try {
      // Use hybrid-search for better recall vs just vector search
      const baseBody = { query_text: query, match_count: safeTopK };
      let data;
      try {
        data = await requestWeKnoraJson({
          method: "GET",
          path: `/knowledge-bases/${kbId}/hybrid-search`,
          body: baseBody,
          headers: weknoraHeaders,
        });
      } catch (err) {
        if (isEmbeddingModelMissingError(err)) {
          data = await requestWeKnoraJson({
            method: "GET",
            path: `/knowledge-bases/${kbId}/hybrid-search`,
            body: { ...baseBody, disable_vector_match: true },
            headers: weknoraHeaders,
          });
        } else {
          throw err;
        }
      }
      
      if (Array.isArray(data)) {
        return data.map(item => ({
          ...item,
          kb_id: kbId
        }));
      }
      return [];
    } catch (err) {
      console.warn(`[searchKnowledgeBases] Failed to search KB ${kbId}:`, err.message);
      return [];
    }
  });

  const resultsPool = await Promise.all(searchPromises);
  resultsPool.forEach(results => allResults.push(...results));

  console.log(`[searchKnowledgeBases] Total results found: ${allResults.length}`);

  // Sort by score descending and take topK overall
  return allResults
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, topK * 2); 
}

/**
 * KB-B.1: Perform hybrid search within a single knowledge base, optionally filtering to specific documents.
 * @param {string} baseId
 * @param {string} query
 * @param {object} opts
 * @param {number} opts.topK
 * @param {string[]} opts.documentIds
 */
export async function searchKnowledgeBase(baseId, query, { topK = 5, documentIds = [], weknoraApiKey = null } = {}) {
  const kbId = typeof baseId === 'string' ? baseId.trim() : '';
  if (!kbId) return [];

  const filterIds = new Set(normalizeIdList(documentIds));
  // If we're filtering to specific documents, we need to fetch more items 
  // from the hybrid search to increase the chance of finding them.
  const safeTopK = clampInt(topK, { min: 1, max: 50, fallback: 5 });
  const fetchCount = filterIds.size > 0 ? 100 : safeTopK;
  const safeFetchCount = clampInt(fetchCount, { min: 1, max: 200, fallback: 5 });
  const weknoraHeaders = buildWeKnoraAuthHeaders(weknoraApiKey);

  try {
    console.log(`[searchKnowledgeBase] Searching KB ${kbId} (query: "${(query || '').slice(0, 50)}...", topK: ${topK}, filtering to: ${filterIds.size} docs)`);

    const baseBody = { query_text: query, match_count: safeFetchCount };
    let data;
    try {
      data = await requestWeKnoraJson({
        method: 'GET',
        path: `/knowledge-bases/${kbId}/hybrid-search`,
        body: baseBody,
        headers: weknoraHeaders,
      });
    } catch (err) {
      if (isEmbeddingModelMissingError(err)) {
        data = await requestWeKnoraJson({
          method: 'GET',
          path: `/knowledge-bases/${kbId}/hybrid-search`,
          body: { ...baseBody, disable_vector_match: true },
          headers: weknoraHeaders,
        });
      } else {
        throw err;
      }
    }
    const results = Array.isArray(data) ? data.map((item) => ({ ...item, kb_id: kbId })) : [];
    
    const filtered = filterIds.size > 0
      ? results.filter((item) => {
          const docId = extractDocIdFromResult(item);
          return docId ? filterIds.has(docId) : false;
        })
      : results;

    if (filterIds.size > 0) {
      console.log(`[searchKnowledgeBase] Filtered ${results.length} results down to ${filtered.length} for ${filterIds.size} doc IDs`);
    }

    return filtered
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, safeTopK * 2);
  } catch (err) {
    console.warn(`[searchKnowledgeBase] Failed to search KB ${kbId}:`, err.message);
    return [];
  }
}

export function mapKnowledgeResultsToCitations(results, { snippetMaxChars = 800 } = {}) {
  if (!Array.isArray(results) || results.length === 0) return [];
  const citations = [];
  const seen = new Set();
  for (const res of results) {
    const docId = extractDocIdFromResult(res);
    const docName = String(res?.knowledge_filename || res?.knowledge_title || res?.knowledge_source || 'Unknown').trim();
    if (!docId) continue;
    const key = `${docId}:${docName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const raw = typeof res?.content === 'string' ? res.content.trim() : '';
    const snippet = raw.length > snippetMaxChars ? raw.slice(0, snippetMaxChars) : raw;
    citations.push({
      docId,
      docName: docName || 'Unknown',
      snippet,
      score: typeof res?.score === 'number' ? res.score : null,
      kbId: typeof res?.kb_id === 'string' ? res.kb_id : null,
    });
  }
  return citations;
}

/**
 * Format search results into a clean string for prompt injection (KB-2.5).
 */
export function formatKnowledgeResultsForPrompt(results) {
  if (!Array.isArray(results) || results.length === 0) {
    return "";
  }

  const sections = results.map((res, idx) => {
    const sourceInfo = res.knowledge_title || res.knowledge_filename || res.knowledge_source || "Unknown Source";
    const kbInfo = res.kb_name ? ` (Knowledge Base: ${res.kb_name})` : "";
    
    return `[Knowledge Source ${idx + 1}: ${sourceInfo}${kbInfo}]\n${res.content}`;
  });

  return `
Relevant information retrieved from Knowledge Bases:
---
${sections.join('\n\n')}
---
Use the information above to provide a grounded and accurate response. If the information is not relevant to the user's question, prioritize the conversation context but acknowledge the knowledge source if appropriate.
`.trim();
}
