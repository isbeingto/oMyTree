const VALID_KINDS = new Set([
  'claim', 'open_loop', 'decision', 'rejection', 'evidence_mention', 'note'
]);
const VALID_SUBKINDS = new Set(['fact', 'inference', 'hypothesis', 'plan', 'question']);

function safeJsonParse(raw) {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, error: err };
  }
}

export function extractMemoryPatchFromText(aiText) {
  if (typeof aiText !== 'string' || aiText.trim().length === 0) {
    return { cleanText: aiText || '', patch: null, error: null };
  }

  const fenced = aiText.match(/```json\s*([\s\S]*?)\s*```/i);
  if (!fenced) {
    return { cleanText: aiText, patch: null, error: null };
  }

  const jsonBlock = fenced[1];
  const parsed = safeJsonParse(jsonBlock);
  if (!parsed.ok) {
    const cleanText = aiText.replace(fenced[0], '').trim();
    return { cleanText, patch: null, error: parsed.error };
  }

  const payload = parsed.value;
  const patch = payload?.memory_patch ?? payload;
  const cleanText = aiText.replace(fenced[0], '').trim();
  return { cleanText, patch, error: null };
}

function normalizeSources(baseSources = [], incoming) {
  const merged = Array.isArray(incoming) ? [...baseSources, ...incoming] : [...baseSources];
  const uniq = [];
  const seen = new Set();
  for (const entry of merged) {
    if (typeof entry !== 'string' || entry.trim().length === 0) continue;
    const val = entry.trim();
    if (seen.has(val)) continue;
    seen.add(val);
    uniq.push(val);
  }
  return uniq;
}

function normalizeLedgerUpdate(update, { treeId, nodeId, turnId, nodeDigest }) {
  if (!update || typeof update !== 'object') {
    return null;
  }
  const kind = typeof update.kind === 'string' ? update.kind.trim().toLowerCase() : '';
  if (!VALID_KINDS.has(kind)) {
    return null;
  }
  const subkindRaw = typeof update.subkind === 'string' ? update.subkind.trim().toLowerCase() : '';
  const subkind = VALID_SUBKINDS.has(subkindRaw) ? subkindRaw : null;
  const text = typeof update.text === 'string' && update.text.trim().length > 0 ? update.text.trim() : null;
  if (!text) {
    return null;
  }

  const baseSources = [];
  if (nodeId) baseSources.push(`node:${nodeId}`);
  if (turnId) baseSources.push(`turn:${turnId}`);
  if (treeId) baseSources.push(`tree:${treeId}`);

  const sources = normalizeSources(baseSources, update.sources);
  const confidence = Number.isFinite(update.confidence) ? update.confidence : null;

  const payload = { ...update };
  delete payload.kind;
  delete payload.subkind;
  delete payload.text;
  delete payload.confidence;
  delete payload.sources;
  if (nodeDigest && !payload.node_digest) {
    payload.node_digest = nodeDigest;
  }

  return {
    kind,
    subkind,
    text,
    sources,
    confidence,
    payload,
  };
}

export async function persistMemoryPatch(client, { treeId, nodeId, turnId, patch, nodeDigest = null }) {
  if (!client || !treeId || !patch || !Array.isArray(patch.ledger_updates)) {
    return { inserted: 0, skipped: true };
  }

  const updates = [];
  for (const raw of patch.ledger_updates) {
    const normalized = normalizeLedgerUpdate(raw, { treeId, nodeId, turnId, nodeDigest: patch.node_digest ?? nodeDigest });
    if (normalized) {
      updates.push(normalized);
    }
  }

  if (updates.length === 0) {
    return { inserted: 0, skipped: true };
  }

  let inserted = 0;
  for (const update of updates) {
    try {
      await client.query(
        `INSERT INTO semantic_ledger_atoms (tree_id, ts, kind, subkind, text, sources, confidence, payload)
         VALUES ($1, now(), $2, $3, $4, $5::jsonb, $6, $7::jsonb)`,
        [
          treeId,
          update.kind,
          update.subkind,
          update.text,
          JSON.stringify(update.sources),
          update.confidence,
          JSON.stringify(update.payload ?? {}),
        ]
      );
      inserted += 1;
    } catch (err) {
      console.warn('[memory_patch] failed to persist ledger atom:', err?.message || err);
    }
  }

  return { inserted, skipped: inserted === 0 };
}

/**
 * T58-7-2: Write a fallback note atom when memory_patch parsing fails.
 * This ensures atoms are always written to the ledger, even on parse errors.
 * 
 * @param {object} client - Database client
 * @param {object} params - Parameters
 * @param {string} params.treeId - Tree ID
 * @param {string} params.nodeId - Node ID (optional)
 * @param {string} params.turnId - Turn ID (required for traceability)
 * @param {string} params.reason - Reason text for the fallback note
 * @returns {Promise<{inserted: number}>}
 */
export async function persistFallbackNote(client, { treeId, nodeId, turnId, reason }) {
  if (!client || !treeId || !turnId) {
    return { inserted: 0 };
  }

  const sources = [];
  if (turnId) sources.push(`turn:${turnId}`);
  if (nodeId) sources.push(`node:${nodeId}`);
  if (treeId) sources.push(`tree:${treeId}`);

  try {
    await client.query(
      `INSERT INTO semantic_ledger_atoms (tree_id, ts, kind, text, sources, payload)
       VALUES ($1, now(), 'note', $2, $3::jsonb, '{}'::jsonb)`,
      [treeId, reason, JSON.stringify(sources)]
    );
    return { inserted: 1 };
  } catch (err) {
    console.warn('[memory_patch] failed to persist fallback note:', err?.message || err);
    return { inserted: 0 };
  }
}

