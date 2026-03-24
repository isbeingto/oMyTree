import { pool } from '../../db/pool.js';
import { writeOutcomeArtifact } from '../artifact_audit.js';

export const OUTCOME_TYPES = new Set(['decision', 'brief', 'report']);

function normalizeOutcomeType(value) {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return OUTCOME_TYPES.has(raw) ? raw : 'brief';
}

function uniqueSources(list = []) {
  const seen = new Set();
  const result = [];
  for (const src of list) {
    if (typeof src !== 'string') continue;
    const trimmed = src.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function collectSourcesFromItems(items = []) {
  const collected = [];
  for (const item of items) {
    if (item?.sources && Array.isArray(item.sources)) {
      collected.push(...item.sources);
    }
  }
  return uniqueSources(collected);
}

function truncate(text, max = 140) {
  if (typeof text !== 'string') return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function buildOutlineSections(outcomeType, data) {
  const {
    statusLine,
    diaryLead,
    facts,
    inferences,
    openLoops,
    nextActions,
    artifacts,
    sources: {
      baseSources,
      diarySources,
      factSources,
      inferenceSources,
      loopSources,
      actionSources,
      artifactSources,
    },
  } = data;

  if (outcomeType === 'decision') {
    return [
      {
        key: 'context',
        title: 'Decision Context',
        summary: truncate(statusLine || 'Decision context pending.'),
        sources: uniqueSources([...baseSources, ...diarySources]),
      },
      {
        key: 'evidence',
        title: 'Options & Evidence',
        summary: `${facts.length + inferences.length} ledger updates available as options/evidence.`,
        sources: uniqueSources([...factSources, ...inferenceSources]),
      },
      {
        key: 'risks',
        title: 'Risks & Unknowns',
        summary: openLoops.length > 0
          ? `${openLoops.length} open loops to resolve before final decision.`
          : 'No open loops captured; verify hidden risks.',
        sources: loopSources,
      },
      {
        key: 'decision',
        title: 'Decision Draft',
        summary: 'Draft the decision statement referencing snapshot status and evidence.',
        sources: uniqueSources([...baseSources, ...factSources, ...inferenceSources]),
      },
      {
        key: 'next_steps',
        title: 'Follow-ups',
        summary: nextActions.length > 0
          ? `Plan ${nextActions.length} follow-up action(s) to operationalize the decision.`
          : 'Add immediate follow-up actions to close gaps.',
        sources: actionSources,
      },
    ];
  }

  if (outcomeType === 'report') {
    return [
      {
        key: 'exec_summary',
        title: 'Executive Summary',
        summary: truncate(statusLine || 'Summarize current state from snapshot.'),
        sources: uniqueSources([...baseSources, ...diarySources]),
      },
      {
        key: 'background',
        title: 'Background & Trail',
        summary: truncate(diaryLead || 'Add recent trail to ground the report.'),
        sources: diarySources,
      },
      {
        key: 'findings',
        title: 'Key Findings',
        summary: `${facts.length} facts and ${inferences.length} inferences to narrate.`,
        sources: uniqueSources([...factSources, ...inferenceSources]),
      },
      {
        key: 'issues',
        title: 'Open Issues',
        summary: openLoops.length > 0
          ? `${openLoops.length} open issues/questions remain.`
          : 'Open issues not captured; confirm gaps before closing.',
        sources: loopSources,
      },
      {
        key: 'recommendations',
        title: 'Recommendations',
        summary: nextActions.length > 0
          ? `Carry forward ${nextActions.length} recommended actions.`
          : 'Add actionable recommendations tied to evidence.',
        sources: actionSources,
      },
      {
        key: 'evidence',
        title: 'Evidence & Artifacts',
        summary: artifacts.length > 0
          ? `${artifacts.length} artifacts ready for citation.`
          : 'No artifacts recorded; attach supporting evidence.',
        sources: artifactSources,
      },
    ];
  }

  // Default: brief
  return [
    {
      key: 'overview',
      title: 'Situation Overview',
      summary: truncate(statusLine || 'Summarize current situation.'),
      sources: uniqueSources([...baseSources, ...diarySources]),
    },
    {
      key: 'findings',
      title: 'Findings',
      summary: `${facts.length + inferences.length} finding(s) captured in ledger.`,
      sources: uniqueSources([...factSources, ...inferenceSources]),
    },
    {
      key: 'questions',
      title: 'Open Questions',
      summary: openLoops.length > 0
        ? `${openLoops.length} open question(s) to clarify.`
        : 'Open questions missing; confirm what is unresolved.',
      sources: loopSources,
    },
    {
      key: 'actions',
      title: 'Next Actions',
      summary: nextActions.length > 0
        ? `${nextActions.length} next action(s) proposed.`
        : 'Next actions not captured; propose immediate steps.',
      sources: actionSources,
    },
    {
      key: 'evidence',
      title: 'Evidence',
      summary: artifacts.length > 0
        ? `${artifacts.length} artifact(s) available for citation.`
        : 'No artifacts attached; mark missing evidence.',
      sources: artifactSources,
    },
  ];
}

function buildEvidenceRequirements(outcomeType, sections, data) {
  const {
    facts,
    inferences,
    openLoops,
    nextActions,
    artifacts,
    sources: {
      baseSources,
      diarySources,
      factSources,
      inferenceSources,
      loopSources,
      actionSources,
      artifactSources,
    },
  } = data;

  const requirements = [];

  const appendRequirement = ({ sectionKey, title, needs, sources }) => {
    const uniqSources = uniqueSources(sources || []);
    const gaps = [];
    if (uniqSources.length === 0) {
      gaps.push('No sources found in snapshot for this section.');
    }
    requirements.push({
      section_key: sectionKey,
      title,
      needs,
      sources: uniqSources,
      gaps,
      status: gaps.length > 0 ? 'missing' : 'ok',
    });
  };

  sections.forEach((section) => {
    switch (section.key) {
      case 'context':
      case 'overview':
      case 'exec_summary':
        appendRequirement({
          sectionKey: section.key,
          title: section.title,
          needs: 'Ground the outline with latest status and focus node trail; cite node/turn or tree sources.',
          sources: [...baseSources, ...diarySources],
        });
        break;
      case 'evidence':
      case 'findings':
        appendRequirement({
          sectionKey: section.key,
          title: section.title,
          needs: 'Ledger facts/inferences required for claims; pull semantic_ledger_atoms of kind claim/decision/rejection/note.',
          sources: [...factSources, ...inferenceSources],
        });
        break;
      case 'risks':
      case 'issues':
      case 'questions':
        {
          const baseNeeds = 'Capture unresolved risks/open loops with traceable nodes/turns.';
          const sources = loopSources;
          const gaps = [];
          if (openLoops.length === 0) {
            gaps.push('No open loops found; confirm if investigation gaps exist.');
          }
          if (sources.length === 0) {
            gaps.push('No sources attached to open loops.');
          }
          requirements.push({
            section_key: section.key,
            title: section.title,
            needs: baseNeeds,
            sources,
            gaps,
            status: gaps.length > 0 ? 'missing' : 'ok',
          });
        }
        break;
      case 'decision':
        appendRequirement({
          sectionKey: section.key,
          title: section.title,
          needs: 'Decision statement should reference supporting ledger evidence and latest trail events.',
          sources: [...factSources, ...inferenceSources, ...baseSources],
        });
        break;
      case 'next_steps':
      case 'actions':
      case 'recommendations':
        {
          const gaps = [];
          if (nextActions.length === 0) {
            gaps.push('No next actions recorded; synthesize actionable steps.');
          }
          if (actionSources.length === 0) {
            gaps.push('Actions lack source references.');
          }
          requirements.push({
            section_key: section.key,
            title: section.title,
            needs: 'Tie next actions to nodes/turns or ledger items to keep traceability.',
            sources: actionSources,
            gaps,
            status: gaps.length > 0 ? 'missing' : 'ok',
          });
        }
        break;
      case 'background':
        appendRequirement({
          sectionKey: section.key,
          title: section.title,
          needs: 'Include recent trail events or diary summaries with node/turn references.',
          sources: diarySources,
        });
        break;
      case 'evidence_and_artifacts':
      case 'evidence_block':
      default:
        appendRequirement({
          sectionKey: section.key,
          title: section.title,
          needs: 'Attach artifacts/resources with traceable sources.',
          sources: artifactSources,
        });
        break;
    }
  });

  // Ensure artifacts coverage for explicit evidence sections
  if (sections.every((s) => s.key !== 'evidence')) {
    const gaps = [];
    if (artifacts.length === 0) {
      gaps.push('No artifacts available to cite.');
    }
    if (artifactSources.length === 0) {
      gaps.push('Artifacts missing source tags.');
    }
    requirements.push({
      section_key: 'evidence',
      title: 'Evidence',
      needs: 'Attach artifacts/resources with traceable sources.',
      sources: artifactSources,
      gaps,
      status: gaps.length > 0 ? 'missing' : 'ok',
    });
  }

  return requirements;
}

function buildOutcomeFromSnapshot(snapshot, outcomeType) {
  const content = snapshot?.content || {};
  const statusLine = content?.A_now_status?.items?.[0]?.text || 'Status not recorded';
  const diaryItems = content?.B_exploration_diary?.items || [];
  const diaryLead = diaryItems[0]?.text || diaryItems[0]?.title || '';
  const facts = content?.C_facts_vs_inferences?.facts || [];
  const inferences = content?.C_facts_vs_inferences?.inferences || [];
  const openLoops = content?.D_open_loops?.items || [];
  const nextActions = content?.E_next_actions?.items || [];
  const artifacts = content?.F_artifacts?.items || [];

  const sources = {
    baseSources: uniqueSources(content?.sources || []),
    diarySources: collectSourcesFromItems(diaryItems),
    factSources: collectSourcesFromItems(facts),
    inferenceSources: collectSourcesFromItems(inferences),
    loopSources: collectSourcesFromItems(openLoops),
    actionSources: collectSourcesFromItems(nextActions),
    artifactSources: collectSourcesFromItems(artifacts),
  };

  const sections = buildOutlineSections(outcomeType, {
    statusLine,
    diaryLead,
    facts,
    inferences,
    openLoops,
    nextActions,
    artifacts,
    sources,
  });

  const evidenceRequirements = buildEvidenceRequirements(outcomeType, sections, {
    facts,
    inferences,
    openLoops,
    nextActions,
    artifacts,
    sources,
  });

  const gapCount = evidenceRequirements.reduce((acc, req) => acc + (req.gaps?.length || 0), 0);

  return { outlineSections: sections, evidenceRequirements, gapCount };
}

function mergeOutlineSections(existingSections = [], refreshedSections = []) {
  const existingList = Array.isArray(existingSections) ? existingSections : [];
  const refreshedList = Array.isArray(refreshedSections) ? refreshedSections : [];
  const refreshedByKey = new Map();
  refreshedList.forEach((section) => {
    if (section?.key) {
      refreshedByKey.set(section.key, section);
    }
  });

  const existingKeys = new Set();
  let sourcesUpdatedCount = 0;
  let matchedCount = 0;

  const merged = existingList.map((section) => {
    if (!section || !section.key) return section;
    existingKeys.add(section.key);
    const refreshed = refreshedByKey.get(section.key);
    if (!refreshed) return section;
    matchedCount += 1;

    const prevSources = Array.isArray(section.sources) ? section.sources : [];
    const nextSources = Array.isArray(refreshed.sources) ? refreshed.sources : [];
    if (JSON.stringify(prevSources) !== JSON.stringify(nextSources)) {
      sourcesUpdatedCount += 1;
    }

    const hasTitle = Object.prototype.hasOwnProperty.call(section, 'title');
    const hasSummary = Object.prototype.hasOwnProperty.call(section, 'summary');
    return {
      ...refreshed,
      ...section,
      title: hasTitle ? section.title : refreshed.title,
      summary: hasSummary ? section.summary : refreshed.summary,
      sources: nextSources.length > 0 ? nextSources : prevSources,
    };
  });

  const added = refreshedList.filter((section) => section?.key && !existingKeys.has(section.key));
  merged.push(...added);

  const unmatchedExisting = existingList.filter(
    (section) => section?.key && !refreshedByKey.has(section.key)
  );

  return {
    sections: merged,
    stats: {
      existingCount: existingList.length,
      refreshedCount: refreshedList.length,
      matchedCount,
      addedCount: added.length,
      unmatchedExistingCount: unmatchedExisting.length,
      sourcesUpdatedCount,
    },
  };
}

function mergeEvidenceRequirements(previousRequirements = [], recomputedRequirements = []) {
  const prevList = Array.isArray(previousRequirements) ? previousRequirements : [];
  const nextList = Array.isArray(recomputedRequirements) ? recomputedRequirements : [];
  const prevByKey = new Map();
  const duplicates = new Set();

  prevList.forEach((req, idx) => {
    const key = req?.section_key || req?.title || `idx:${idx}`;
    if (prevByKey.has(key)) {
      duplicates.add(key);
      prevByKey.set(`${key}::${idx}`, req);
    } else {
      prevByKey.set(key, req);
    }
  });

  const matchedKeys = new Set();
  let statusPreservedCount = 0;
  let statusRecomputedCount = 0;

  const merged = nextList.map((req, idx) => {
    const key = req?.section_key || req?.title || `next:${idx}`;
    const prev = prevByKey.get(key);
    if (prev) {
      matchedKeys.add(key);
    }

    const gaps = Array.isArray(req.gaps) ? req.gaps : [];
    let status;
    if (prev) {
      if (prev.status === 'ignored') {
        status = 'ignored';
      } else if (prev.status === 'needs_material') {
        status = gaps.length === 0 ? 'ok' : 'needs_material';
      } else {
        status = gaps.length === 0 ? 'ok' : 'missing';
      }
      statusPreservedCount += 1;
    } else {
      status = gaps.length === 0 ? 'ok' : 'missing';
      statusRecomputedCount += 1;
    }

    return { ...req, status, gaps };
  });

  const unmatchedPrevious = prevList.filter((req, idx) => {
    const key = req?.section_key || req?.title || `idx:${idx}`;
    return !matchedKeys.has(key);
  });

  const conflictKeys = unmatchedPrevious
    .filter((req) => req?.status && !['ok', 'missing'].includes(req.status))
    .map((req, idx) => req.section_key || req.title || `idx:${idx}`);

  return {
    requirements: merged,
    stats: {
      previousCount: prevList.length,
      recomputedCount: nextList.length,
      statusPreservedCount,
      statusRecomputedCount,
      duplicateKeys: Array.from(duplicates),
      unmatchedPreviousCount: unmatchedPrevious.length,
    },
    conflict: conflictKeys.length > 0,
    conflictKeys,
  };
}

export async function generateOutcomeDraft({ snapshotId, outcomeType = 'brief' } = {}) {
  const normalizedType = normalizeOutcomeType(outcomeType);
  if (!snapshotId) {
    throw new Error('snapshot_id_required');
  }

  const client = await pool.connect();
  try {
    const snapshotRes = await client.query(
      `SELECT id, tree_id, content
         FROM resume_snapshots
        WHERE id = $1
        LIMIT 1`,
      [snapshotId]
    );

    if (snapshotRes.rows.length === 0) {
      throw new Error('snapshot_not_found');
    }

    const snapshot = snapshotRes.rows[0];
    const treeId = snapshot.tree_id;
    if (!treeId) {
      throw new Error('tree_id_missing');
    }

    const { outlineSections, evidenceRequirements, gapCount } = buildOutcomeFromSnapshot(snapshot, normalizedType);

    const upsertRes = await client.query(
      `INSERT INTO outcome_drafts (tree_id, snapshot_id, outcome_type, outline_sections, evidence_requirements, gap_count, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, now(), now())
       ON CONFLICT (snapshot_id, outcome_type)
       DO UPDATE SET
         outline_sections = EXCLUDED.outline_sections,
         evidence_requirements = EXCLUDED.evidence_requirements,
         gap_count = EXCLUDED.gap_count,
         updated_at = now()
       RETURNING id, tree_id, snapshot_id, outcome_type, outline_sections, evidence_requirements, gap_count, created_at, updated_at`,
      [
        treeId,
        snapshotId,
        normalizedType,
        JSON.stringify(outlineSections),
        JSON.stringify(evidenceRequirements),
        gapCount,
      ]
    );

    const outcomeDraft = upsertRes.rows[0];

    // P1-3: Write auditable artifact version for outcome draft (fail-open)
    // Build content_markdown from outline sections
    const contentLines = outlineSections.map(s => `## ${s.title}\n\n${s.summary}`);
    const contentMarkdown = contentLines.join('\n\n');

    // Collect evidence links from evidence_requirements sources
    const evidenceLinks = evidenceRequirements
      .flatMap(r => r.sources || [])
      .filter((v, i, a) => a.indexOf(v) === i); // unique

    writeOutcomeArtifact(pool, {
      tree_id: treeId,
      outcome_draft_id: outcomeDraft.id,
      outcome_type: normalizedType,
      created_by: null, // Could be enhanced to pass user ID
      provider: null,
      model: null,
      prompt_version: 'outcome_draft_v1',
      content_markdown: contentMarkdown,
      snapshot_id: snapshotId,
      keyframe_ids: [],
      node_ids: [],
      trail_version_id: null,
      path_snapshot_id: null,
      evidence_links: evidenceLinks,
      validation_metrics: {
        gap_count: gapCount,
        section_count: outlineSections.length,
      },
    }).catch(() => {}); // fail-open

    return outcomeDraft;
  } finally {
    client.release();
  }
}

export async function getOutcomeDraftById(id) {
  if (!id) return null;
  const { rows } = await pool.query(
    `SELECT id, tree_id, snapshot_id, outcome_type, outline_sections, evidence_requirements, gap_count, created_at, updated_at
       FROM outcome_drafts
      WHERE id = $1
      LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

export async function listOutcomeDrafts({ treeId, snapshotId = null, outcomeType = null, limit = 20 } = {}) {
  if (!treeId) {
    throw new Error('tree_id_required');
  }

  const clauses = ['tree_id = $1'];
  const params = [treeId];
  let paramIndex = params.length;

  if (snapshotId) {
    clauses.push(`snapshot_id = $${paramIndex + 1}`);
    params.push(snapshotId);
    paramIndex += 1;
  }

  if (outcomeType) {
    clauses.push(`outcome_type = $${paramIndex + 1}`);
    params.push(normalizeOutcomeType(outcomeType));
    paramIndex += 1;
  }

  const safeLimit = Math.max(1, Math.min(limit, 50));
  params.push(safeLimit);

  const { rows } = await pool.query(
    `SELECT id, tree_id, snapshot_id, outcome_type, outline_sections, evidence_requirements, gap_count, created_at, updated_at
       FROM outcome_drafts
      WHERE ${clauses.join(' AND ')}
      ORDER BY updated_at DESC
      LIMIT $${params.length}`,
    params
  );

  return rows;
}

/**
 * T57-2: Update an existing outcome draft (outline_sections, evidence_requirements)
 * Used when user edits outline sections or marks gaps as ignored/needs-material
 * @param {Object} params
 * @param {string} params.id - Draft ID
 * @param {Array} [params.outlineSections] - Updated outline sections
 * @param {Array} [params.evidenceRequirements] - Updated evidence requirements
 * @returns {Object|null} Updated draft or null if not found
 */
export async function updateOutcomeDraft({ id, outlineSections, evidenceRequirements } = {}) {
  if (!id) {
    throw new Error('draft_id_required');
  }

  const setClauses = [];
  const params = [id];
  let paramIndex = 1;

  if (outlineSections !== undefined) {
    paramIndex += 1;
    setClauses.push(`outline_sections = $${paramIndex}::jsonb`);
    params.push(JSON.stringify(outlineSections));
  }

  if (evidenceRequirements !== undefined) {
    paramIndex += 1;
    setClauses.push(`evidence_requirements = $${paramIndex}::jsonb`);
    params.push(JSON.stringify(evidenceRequirements));

    // Recalculate gap_count based on requirements where status !== 'ignored'
    const activeGaps = evidenceRequirements.filter(
      (req) => req.status !== 'ignored' && req.status !== 'needs_material'
    );
    const gapCount = activeGaps.reduce((acc, req) => acc + (req.gaps?.length || 0), 0);
    paramIndex += 1;
    setClauses.push(`gap_count = $${paramIndex}`);
    params.push(gapCount);
  }

  if (setClauses.length === 0) {
    // Nothing to update, just return current draft
    return getOutcomeDraftById(id);
  }

  setClauses.push('updated_at = now()');

  const { rows } = await pool.query(
    `UPDATE outcome_drafts
        SET ${setClauses.join(', ')}
      WHERE id = $1
      RETURNING id, tree_id, snapshot_id, outcome_type, outline_sections, evidence_requirements, gap_count, created_at, updated_at`,
    params
  );

  return rows[0] || null;
}

/**
 * Normalize various source payload shapes into a string identifier.
 */
function normalizeSourceId(src) {
  if (!src) return null;
  if (typeof src === 'string') return src.trim() || null;
  if (typeof src === 'object') {
    if (src.node_id) return `node:${src.node_id}`;
    if (src.turn_id) return `turn:${src.turn_id}`;
    if (src.evidence_id) return `evidence:${src.evidence_id}`;
    if (src.id) return `ledger:${src.id}`;
  }
  return null;
}

/**
 * T58-10-0: Refresh outcome draft gaps based on latest evidence links + ledger + snapshot sections.
 * - Re-pulls evidence links
 * - Rebuilds requirements (gap status) without overwriting outline sections
 * - Emits before/after stats for traceability
 */
export async function refreshOutcomeDraft(id) {
  if (!id) {
    throw new Error('draft_id_required');
  }

  const { rows: draftRows } = await pool.query(
    `SELECT id, tree_id, snapshot_id, outcome_type, outline_sections, evidence_requirements, gap_count, created_at, updated_at
       FROM outcome_drafts
      WHERE id = $1
      LIMIT 1`,
    [id]
  );

  if (draftRows.length === 0) {
    throw new Error('outcome_draft_not_found');
  }

  const draft = draftRows[0];
  const outcomeType = normalizeOutcomeType(draft.outcome_type);

  // Load snapshot content (sections/facts) to recompute gaps with live sources
  const { rows: snapshotRows } = await pool.query(
    `SELECT content FROM resume_snapshots WHERE id = $1 LIMIT 1`,
    [draft.snapshot_id]
  );
  if (snapshotRows.length === 0) {
    throw new Error('snapshot_not_found');
  }
  const snapshot = snapshotRows[0]?.content || {};

  // Live evidence + ledger inputs
  const [
    { rows: evidenceCountRows },
    { rows: linkRows },
    { rows: ledgerRows },
  ] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS count FROM evidence_items WHERE tree_id = $1`, [draft.tree_id]),
    pool.query(
      `SELECT nel.node_id, nel.evidence_id
         FROM node_evidence_links nel
         JOIN nodes n ON n.id = nel.node_id
        WHERE n.tree_id = $1`,
      [draft.tree_id]
    ),
    pool.query(
      `SELECT id, sources
         FROM semantic_ledger_atoms
        WHERE tree_id = $1`,
      [draft.tree_id]
    ),
  ]);

  const evidenceCount = Number(evidenceCountRows?.[0]?.count || 0);
  const evidenceLinks = linkRows || [];
  const ledgerSources = uniqueSources(
    ledgerRows
      .map((row) => row.sources || [])
      .flat()
      .map((src) => normalizeSourceId(src))
  );
  const evidenceLinkSources = uniqueSources(
    evidenceLinks
      .map((row) => [
        normalizeSourceId({ node_id: row.node_id }),
        normalizeSourceId({ evidence_id: row.evidence_id }),
      ])
      .flat()
  );

  // Snapshot-derived context
  const statusLine = snapshot?.A_now_status?.items?.[0]?.text || 'Status not recorded';
  const diaryItems = snapshot?.B_exploration_diary?.items || [];
  const facts = snapshot?.C_facts_vs_inferences?.facts || [];
  const inferences = snapshot?.C_facts_vs_inferences?.inferences || [];
  const openLoops = snapshot?.D_open_loops?.items || [];
  const nextActions = snapshot?.E_next_actions?.items || [];
  const artifacts = snapshot?.F_artifacts?.items || [];

  // Merge snapshot sources with live ledger/evidence links
  const sources = {
    baseSources: uniqueSources([
      ...(snapshot?.sources || []),
      ...ledgerSources,
      ...evidenceLinkSources,
    ]),
    diarySources: uniqueSources([
      ...collectSourcesFromItems(diaryItems),
      ...ledgerSources,
      ...evidenceLinkSources,
    ]),
    factSources: uniqueSources([
      ...collectSourcesFromItems(facts),
      ...ledgerSources,
      ...evidenceLinkSources,
    ]),
    inferenceSources: uniqueSources([
      ...collectSourcesFromItems(inferences),
      ...ledgerSources,
      ...evidenceLinkSources,
    ]),
    loopSources: uniqueSources([
      ...collectSourcesFromItems(openLoops),
      ...ledgerSources,
      ...evidenceLinkSources,
    ]),
    actionSources: uniqueSources([
      ...collectSourcesFromItems(nextActions),
      ...ledgerSources,
      ...evidenceLinkSources,
    ]),
    artifactSources: uniqueSources([
      ...collectSourcesFromItems(artifacts),
      ...ledgerSources,
      ...evidenceLinkSources,
    ]),
  };

  const refreshedSections = buildOutlineSections(outcomeType, {
    statusLine,
    diaryLead: diaryItems[0]?.text || diaryItems[0]?.title || '',
    facts,
    inferences,
    openLoops,
    nextActions,
    artifacts,
    sources,
  });

  const outlineMerge = mergeOutlineSections(draft.outline_sections || [], refreshedSections);
  const mergedOutlineSections = outlineMerge.sections;

  const recomputedRequirements = buildEvidenceRequirements(outcomeType, mergedOutlineSections, {
    facts,
    inferences,
    openLoops,
    nextActions,
    artifacts,
    sources,
  });

  const requirementsMerge = mergeEvidenceRequirements(
    draft.evidence_requirements || [],
    recomputedRequirements
  );
  const mergedRequirements = requirementsMerge.requirements;

  const refreshedGapCount = mergedRequirements
    .filter((r) => r.status !== 'ignored' && r.status !== 'needs_material')
    .reduce((acc, r) => acc + (r.gaps?.length || 0), 0);

  const { rows: updatedRows } = await pool.query(
    `UPDATE outcome_drafts
        SET outline_sections = $2::jsonb,
            evidence_requirements = $3::jsonb,
            gap_count = $4,
            updated_at = now()
      WHERE id = $1
      RETURNING id, tree_id, snapshot_id, outcome_type, outline_sections, evidence_requirements, gap_count, created_at, updated_at`,
    [
      id,
      JSON.stringify(mergedOutlineSections),
      JSON.stringify(mergedRequirements),
      refreshedGapCount,
    ]
  );

  return {
    draft: updatedRows[0] || null,
    stats: {
      evidenceCount,
      evidenceLinks: evidenceLinks.length,
      ledgerAtoms: ledgerRows.length,
      gapCountBefore: draft.gap_count,
      gapCountAfter: refreshedGapCount,
      outlineSectionsBefore: Array.isArray(draft.outline_sections) ? draft.outline_sections.length : 0,
      outlineSectionsAfter: mergedOutlineSections.length,
      requirementsBefore: Array.isArray(draft.evidence_requirements) ? draft.evidence_requirements.length : 0,
      requirementsAfter: mergedRequirements.length,
      statusPreserved: requirementsMerge.stats.statusPreservedCount,
      statusRecomputed: requirementsMerge.stats.statusRecomputedCount,
      sourcesUpdated: outlineMerge.stats.sourcesUpdatedCount,
      addedSections: outlineMerge.stats.addedCount,
      mergeConflict: requirementsMerge.conflict,
      mergeConflictKeys: requirementsMerge.conflictKeys,
    },
  };
}

export default {
  generateOutcomeDraft,
  getOutcomeDraftById,
  listOutcomeDrafts,
  updateOutcomeDraft,
  refreshOutcomeDraft,
  OUTCOME_TYPES,
};
