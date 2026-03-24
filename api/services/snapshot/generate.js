import { pool, getClient } from '../../db/pool.js';
import { buildContextPack } from '../context/context_pack.js';
import { trailNarrativeFromEvents, formatDiaryForSnapshot, formatDiaryText } from './trail_narrative.js';

const FALLBACK_STATUS = 'Working session in progress';

// T58-2: Trail event types for full diary narrative
const DIARY_TRAIL_TYPES = [
  'BRANCH_BURST', 'NODE_CREATED', 'TURN_ADDED', 'BRANCH_SWITCH',
  'EVIDENCE_ATTACHED', 'OUTCOME_SAVED', 'SNAPSHOT_CREATED', 'NODE_FOCUSED'
];

/**
 * T58-2: Fetch ALL trail events for diary narrative (not limited by sinceTs)
 * This ensures diary shows complete exploration history, not just delta
 */
async function fetchAllTrailEventsForDiary(client, treeId, limit = 100) {
  const { rows } = await client.query(
    `SELECT type, actor, ts, node_id, turn_id, payload
       FROM tree_trail_events
      WHERE tree_id = $1
        AND type = ANY($2)
      ORDER BY ts DESC
      LIMIT $3`,
    [treeId, DIARY_TRAIL_TYPES, limit]
  );
  return rows;
}

function limitItems(items = [], limit = 7) {
  return items.slice(0, limit);
}

function uniqueSources(list = []) {
  const seen = new Set();
  const result = [];
  for (const src of list) {
    if (typeof src !== 'string' || src.trim().length === 0) continue;
    const v = src.trim();
    if (seen.has(v)) continue;
    seen.add(v);
    result.push(v);
  }
  return result;
}

function compactText(value, maxLen = 80) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 3))}...`;
}

function buildStatusLine(pack) {
  const focusNode = pack?.focus_context?.path?.[0] || null;
  const focusText = compactText(focusNode?.text || '', 72);
  const claimCount = pack?.delta_ledger?.groups?.claim?.length || 0;
  const openLoopCount = pack?.delta_ledger?.groups?.open_loop?.length || 0;
  const statusBits = [];
  if (claimCount > 0) statusBits.push(`${claimCount} claims`);
  if (openLoopCount > 0) statusBits.push(`${openLoopCount} open loops`);
  const focusLabel = focusText ? `Now: ${focusText}` : 'Now: Capturing the current thread';
  const countsLabel = statusBits.length > 0 ? ` · ${statusBits.join(' · ')}` : '';
  return `${focusLabel}${countsLabel}` || FALLBACK_STATUS;
}

function buildSources({ nodeId, turnId, treeId, extra = [] }) {
  const list = [];
  if (nodeId) list.push(`node:${nodeId}`);
  if (turnId) list.push(`turn:${turnId}`);
  if (treeId) list.push(`tree:${treeId}`);
  return uniqueSources([...list, ...extra]);
}

/**
 * T58-7-1: Check if sources contain meaningful references (node: or turn:)
 * Tree-level sources alone are considered "fallback" and not meaningful for coverage
 */
function hasMeaningfulSources(sources = []) {
  return sources.some(s =>
    typeof s === 'string' && (s.startsWith('node:') || s.startsWith('turn:') || s.startsWith('evidence:'))
  );
}

/**
 * T58-7-1: Add sources_missing_reason to an item if it lacks meaningful sources
 */
function addSourcesMissingReason(item, reason) {
  if (!hasMeaningfulSources(item.sources || [])) {
    return { ...item, sources_missing_reason: reason };
  }
  return item;
}

/**
 * T58-2: Build diary entries using narrative pivot points
 * Replaces the old raw event listing with human-readable narratives
 */
function buildDiaryEntries(events = [], treeId) {
  const narrativeEntries = trailNarrativeFromEvents(events, { treeId });
  return formatDiaryForSnapshot(narrativeEntries, treeId);
}

function buildFactsAndInferences(ledgerGroups = {}, treeId) {
  const facts = [];
  const inferences = [];

  for (const claim of ledgerGroups.claim || []) {
    facts.push({
      text: claim.text,
      subkind: claim.subkind,
      ts: claim.ts,
      sources: uniqueSources(claim.sources || buildSources({ treeId })),
    });
  }

  const inferKinds = ['decision', 'rejection', 'note'];
  for (const kind of inferKinds) {
    for (const item of ledgerGroups[kind] || []) {
      inferences.push({
        text: item.text,
        kind,
        ts: item.ts,
        sources: uniqueSources(item.sources || buildSources({ treeId })),
      });
    }
  }

  return { facts: limitItems(facts, 10), inferences: limitItems(inferences, 10) };
}

function buildOpenLoops(ledgerGroups = {}, treeId) {
  const loops = [];
  for (const loop of ledgerGroups.open_loop || []) {
    loops.push({
      text: loop.text,
      subkind: loop.subkind,
      ts: loop.ts,
      suggested_next: 'Follow up in next turn',
      sources: uniqueSources(loop.sources || buildSources({ treeId })),
    });
  }
  return limitItems(loops, 10);
}

function buildNextActions(openLoops = [], treeId) {
  if (!openLoops.length) {
    return [
      {
        text: 'Review recent claims and decide next question',
        sources: buildSources({ treeId }),
      },
    ];
  }
  return limitItems(
    openLoops.map((loop) => ({
      text: `Resolve: ${loop.text}`,
      sources: loop.sources || buildSources({ treeId }),
    })),
    5
  );
}

function buildArtifacts(ledgerGroups = {}, treeId) {
  const artifacts = [];
  for (const ev of ledgerGroups.evidence_mention || []) {
    artifacts.push({
      text: ev.text,
      sources: uniqueSources(ev.sources || buildSources({ treeId })),
    });
  }
  return limitItems(artifacts, 10);
}

function assembleContent(pack) {
  const treeId = pack?.tree_id || null;
  const ledgerGroups = pack?.delta_ledger?.groups || {};
  const trailEvents = pack?.trail_summary_delta?.events || [];
  const diaryEntries = buildDiaryEntries(trailEvents, treeId);
  const { facts, inferences } = buildFactsAndInferences(ledgerGroups, treeId);
  const openLoops = buildOpenLoops(ledgerGroups, treeId);
  const nextActions = buildNextActions(openLoops, treeId);
  const artifacts = buildArtifacts(ledgerGroups, treeId);
  const statusLine = buildStatusLine(pack);

  // T58-7-1: Add sources_missing_reason for items without meaningful sources
  const statusItem = addSourcesMissingReason(
    { text: statusLine, sources: buildSources({ treeId }) },
    'Status is derived from aggregate context, not a specific turn'
  );

  const diaryWithReasons = diaryEntries.map(item =>
    addSourcesMissingReason(item, 'Diary entry has no specific node/turn reference')
  );

  const factsWithReasons = facts.map(item =>
    addSourcesMissingReason(item, 'Fact from ledger atom missing node/turn source')
  );

  const inferencesWithReasons = inferences.map(item =>
    addSourcesMissingReason(item, 'Inference from ledger atom missing node/turn source')
  );

  const openLoopsWithReasons = openLoops.map(item =>
    addSourcesMissingReason(item, 'Open loop from ledger atom missing node/turn source')
  );

  const nextActionsWithReasons = nextActions.map(item =>
    addSourcesMissingReason(item, 'Next action derived from context, not a specific turn')
  );

  const artifactsWithReasons = artifacts.map(item =>
    addSourcesMissingReason(item, 'Evidence mention missing node/turn source')
  );

  // T58-7-1: Calculate coverage for diagnostics
  // Coverage = sections with at least one meaningful source / total sections with content
  const sections = [
    { key: 'A_now_status', items: [statusItem] },
    { key: 'B_exploration_diary', items: diaryWithReasons },
    { key: 'C_facts', items: factsWithReasons },
    { key: 'C_inferences', items: inferencesWithReasons },
    { key: 'D_open_loops', items: openLoopsWithReasons },
    { key: 'E_next_actions', items: nextActionsWithReasons },
    { key: 'F_artifacts', items: artifactsWithReasons },
  ];

  let sectionsWithContent = 0;
  let sectionsWithMeaningfulSources = 0;

  for (const section of sections) {
    const contentItems = section.items.filter(i => i?.text);
    if (contentItems.length > 0) {
      sectionsWithContent++;
      // Section has meaningful sources if at least one item has meaningful sources
      const hasAnyMeaningful = contentItems.some(i => hasMeaningfulSources(i.sources || []));
      if (hasAnyMeaningful) {
        sectionsWithMeaningfulSources++;
      }
    }
  }

  const coverage = sectionsWithContent > 0
    ? Math.round((sectionsWithMeaningfulSources / sectionsWithContent) * 100) / 100
    : 0;
  const deltaSummary = pack?.delta_summary || null;

  return {
    A_now_status: {
      title: 'Now + Status',
      items: [statusItem],
    },
    B_exploration_diary: {
      title: 'Exploration Diary',
      items: diaryWithReasons,
    },
    C_facts_vs_inferences: {
      title: 'Facts vs Inferences',
      facts: factsWithReasons,
      inferences: inferencesWithReasons,
    },
    D_open_loops: {
      title: 'Open Loops',
      items: openLoopsWithReasons,
    },
    E_next_actions: {
      title: 'Next Actions',
      items: nextActionsWithReasons,
    },
    F_artifacts: {
      title: 'Artifacts / Evidence',
      items: artifactsWithReasons,
    },
    sources: buildSources({ treeId }),
    meta: {
      coverage,
      sections_with_content: sectionsWithContent,
      sections_with_sources: sectionsWithMeaningfulSources,
      ...(deltaSummary ? { delta_summary: deltaSummary } : {}),
    },
  };
}

/**
 * T58-2: Build diary text with icons and narrative format
 */
function buildDiaryText(sectionB) {
  const items = sectionB.items || [];
  if (items.length === 0) {
    return '- 📭 No exploration activity yet';
  }
  const lines = items.map(item => {
    const icon = item.text?.charAt(0) === '🌿' || item.text?.charAt(0) === '💬'
      ? '' // Already has icon in text
      : '';
    const text = item.title || item.text || 'event';
    const sources = (item.sources || []).slice(0, 2).join(', ');
    return `- ${text} (${sources})`;
  });
  return lines.join('\n');
}

export async function generateSnapshot({
  treeId,
  scopeNodeId = null,
  mode = 'incremental',
  pinned = false,
  userNotes = null,
  anchorNodeId = null,
} = {}) {
  if (!treeId) {
    throw new Error('treeId is required');
  }
  const pack = await buildContextPack(treeId, { preferPinnedSnapshot: true });

  // T58-2: Fetch ALL trail events for complete diary narrative
  const client = await getClient();
  let allTrailEvents = [];
  try {
    allTrailEvents = await fetchAllTrailEventsForDiary(client, treeId, 100);
  } finally {
    client.release();
  }

  // T58-2: Override trail events in pack with full history for diary
  const packWithFullTrail = {
    ...pack,
    trail_summary_delta: {
      ...pack.trail_summary_delta,
      events: allTrailEvents,
    },
  };

  const content = assembleContent(packWithFullTrail);
  const diary = buildDiaryText(content.B_exploration_diary);

  const client2 = await getClient();
  try {
    await client2.query('BEGIN');

    // Insert snapshot
    const { rows } = await client2.query(
      `INSERT INTO resume_snapshots (tree_id, scope_node_id, ts, mode, based_on_snapshot_id, content, diary, pinned, user_notes)
       VALUES ($1, $2, now(), $3, $4, $5::jsonb, $6, $7, $8)
       RETURNING id, tree_id, scope_node_id, ts, mode, based_on_snapshot_id, content, diary, pinned, user_notes`,
      [
        treeId,
        scopeNodeId || null,
        mode === 'full' ? 'full' : 'incremental',
        pack?.prev_snapshot?.id || null,
        JSON.stringify(content),
        diary,
        Boolean(pinned),
        userNotes || null,
      ]
    );
    const snapshot = rows[0];

    // T55-3: Write snapshot anchor if anchorNodeId is provided or derive from focus context
    const finalAnchorNodeId = anchorNodeId || pack?.focus_context?.node_id || null;
    if (finalAnchorNodeId) {
      // Build label for the anchor: "Snapshot #<short-id>: <first-line-of-diary>"
      const shortId = snapshot.id.substring(0, 8);
      const firstDiaryLine = diary.split('\n')[0]?.replace(/^-\s*/, '').trim() || 'Snapshot';
      const label = `Snapshot #${shortId}: ${firstDiaryLine.substring(0, 50)}${firstDiaryLine.length > 50 ? '...' : ''}`;

      await client2.query(
        `INSERT INTO snapshot_anchors (snapshot_id, anchor_node_id, label)
         VALUES ($1, $2, $3)
         ON CONFLICT (snapshot_id, anchor_node_id) DO UPDATE SET label = EXCLUDED.label`,
        [snapshot.id, finalAnchorNodeId, label]
      );
    }

    await client2.query('COMMIT');
    return snapshot;
  } catch (err) {
    try {
      await client2.query('ROLLBACK');
    } catch (rollbackErr) {
      console.warn('[snapshot/generate] ROLLBACK failed:', rollbackErr?.message);
    }
    throw err;
  } finally {
    client2.release();
  }
}

export async function listSnapshotsForTree(treeId, { scopeNodeId = null, limit = 20 } = {}) {
  const { rows } = await pool.query(
    `SELECT id, tree_id, scope_node_id, ts, mode, based_on_snapshot_id, content, diary, pinned, user_notes
       FROM resume_snapshots
      WHERE tree_id = $1
        AND ($2::uuid IS NULL OR scope_node_id = $2)
      ORDER BY pinned DESC, ts DESC
      LIMIT $3`,
    [treeId, scopeNodeId || null, Math.max(1, Math.min(limit, 100))]
  );
  return rows;
}

export async function getSnapshotById(id) {
  const { rows } = await pool.query(
    `SELECT id, tree_id, scope_node_id, ts, mode, based_on_snapshot_id, content, diary, pinned, user_notes
       FROM resume_snapshots
      WHERE id = $1
      LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

export async function updateSnapshotMeta(id, { pinned = null, userNotes = undefined } = {}) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, tree_id, pinned FROM resume_snapshots WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (rows.length === 0) {
      throw new Error('snapshot_not_found');
    }
    const snapshot = rows[0];
    if (pinned === true) {
      await client.query(
        `UPDATE resume_snapshots SET pinned = false WHERE tree_id = $1 AND id <> $2`,
        [snapshot.tree_id, id]
      );
    }
    const updates = [];
    const params = [];
    if (pinned !== null) {
      updates.push(`pinned = $${updates.length + 1}`);
      params.push(Boolean(pinned));
    }
    if (userNotes !== undefined) {
      updates.push(`user_notes = $${updates.length + 1}`);
      params.push(userNotes || null);
    }
    if (updates.length > 0) {
      params.push(id);
      await client.query(
        `UPDATE resume_snapshots SET ${updates.join(', ')} WHERE id = $${params.length}`,
        params
      );
    }
    const refreshed = await client.query(
      `SELECT id, tree_id, scope_node_id, ts, mode, based_on_snapshot_id, content, diary, pinned, user_notes
         FROM resume_snapshots
        WHERE id = $1`,
      [id]
    );
    await client.query('COMMIT');
    return refreshed.rows[0] || null;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.warn('[snapshot/updateMeta] ROLLBACK failed:', rollbackErr?.message);
    }
    throw err;
  } finally {
    client.release();
  }
}
