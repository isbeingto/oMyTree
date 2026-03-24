import express from 'express';
import { HttpError, wrapAsync } from '../lib/errors.js';
import { withTraceId } from '../lib/trace.js';
import {
  generateOutcomeDraft,
  getOutcomeDraftById,
  listOutcomeDrafts,
  updateOutcomeDraft,
  refreshOutcomeDraft,
  OUTCOME_TYPES,
} from '../services/outcome/draft.js';
import { recordTrailEvent } from '../services/trail/trail_events.js';
import { pool } from '../db/pool.js';

function normalizeOutcomeTypeInput(value, { fallback = 'brief', strict = false } = {}) {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (OUTCOME_TYPES.has(raw)) {
    return raw;
  }
  if (strict && value) {
    throw new HttpError({
      status: 400,
      code: 'invalid_outcome_type',
      message: 'outcome_type must be one of decision|brief|report',
    });
  }
  return fallback;
}

export default function createOutcomesRouter() {
  const router = express.Router();

  router.post(
    '/api/outcomes/draft',
    wrapAsync(async (req, res) => {
      const snapshotId = req.body?.snapshot_id;
      if (!snapshotId) {
        throw new HttpError({ status: 400, code: 'snapshot_id_required', message: 'snapshot_id is required' });
      }
      const outcomeType = normalizeOutcomeTypeInput(req.body?.outcome_type, { fallback: 'brief', strict: !!req.body?.outcome_type });
      let draft;
      try {
        draft = await generateOutcomeDraft({ snapshotId, outcomeType });
      } catch (err) {
        if (err?.message === 'snapshot_not_found') {
          throw new HttpError({ status: 404, code: 'snapshot_not_found', message: 'Snapshot not found' });
        }
        if (err?.message === 'tree_id_missing') {
          throw new HttpError({ status: 400, code: 'tree_id_missing', message: 'Snapshot missing tree_id' });
        }
        throw err;
      }
      res.status(201).json(withTraceId(res, { ok: true, draft }));
    })
  );

  router.get(
    '/api/outcomes/:id',
    wrapAsync(async (req, res) => {
      const draft = await getOutcomeDraftById(req.params.id);
      if (!draft) {
        throw new HttpError({ status: 404, code: 'outcome_draft_not_found', message: 'Outcome draft not found' });
      }
      res.status(200).json(withTraceId(res, { draft }));
    })
  );

  // T58-5: Refresh outcome draft after evidence updates
  router.post(
    '/api/outcomes/:id/refresh',
    wrapAsync(async (req, res) => {
      const id = req.params.id;
      if (!id) {
        throw new HttpError({ status: 400, code: 'invalid_id', message: 'Draft ID is required' });
      }

      let result;
      try {
        result = await refreshOutcomeDraft(id);
      } catch (err) {
        if (err?.message === 'outcome_draft_not_found') {
          throw new HttpError({ status: 404, code: 'outcome_draft_not_found', message: 'Outcome draft not found' });
        }
        throw err;
      }

      if (!result?.draft) {
        throw new HttpError({ status: 500, code: 'refresh_failed', message: 'Failed to refresh outcome draft' });
      }

      try {
        await recordTrailEvent({
          treeId: result.draft.tree_id,
          type: 'OUTCOME_REFRESHED',
          actor: 'user',
          payload: {
            outcome_id: result.draft.id,
            gap_count_before: result.stats?.gapCountBefore,
            gap_count_after: result.stats?.gapCountAfter,
            evidence_count: result.stats?.evidenceCount,
            evidence_links: result.stats?.evidenceLinks,
            ledger_atoms: result.stats?.ledgerAtoms,
            outline_sections_before: result.stats?.outlineSectionsBefore,
            outline_sections_after: result.stats?.outlineSectionsAfter,
            requirements_before: result.stats?.requirementsBefore,
            requirements_after: result.stats?.requirementsAfter,
            status_preserved: result.stats?.statusPreserved,
            status_recomputed: result.stats?.statusRecomputed,
            sources_updated: result.stats?.sourcesUpdated,
            added_sections: result.stats?.addedSections,
            merge_conflict: result.stats?.mergeConflict,
            merge_conflict_keys: result.stats?.mergeConflictKeys,
          },
        });
      } catch (err) {
        console.warn('[trail] failed to record OUTCOME_REFRESHED', err);
      }

      res.status(200).json(withTraceId(res, { ok: true, draft: result.draft, stats: result.stats }));
    })
  );

  // T58-6: Export outcome draft as Markdown with references
  router.get(
    '/api/outcomes/:id/export.md',
    wrapAsync(async (req, res) => {
      const id = req.params.id;
      if (!id) {
        throw new HttpError({ status: 400, code: 'invalid_id', message: 'Draft ID is required' });
      }

      const draft = await getOutcomeDraftById(id);
      if (!draft) {
        throw new HttpError({ status: 404, code: 'outcome_draft_not_found', message: 'Outcome draft not found' });
      }

      const sections = Array.isArray(draft.outline_sections) ? draft.outline_sections : [];
      const requirements = Array.isArray(draft.evidence_requirements) ? draft.evidence_requirements : [];

      const refs = [];
      const seen = new Set();

      const previewText = (text) => {
        if (!text || typeof text !== 'string') return 'No content';
        const clean = text.replace(/\s+/g, ' ').trim();
        if (!clean) return 'No content';
        return clean.length > 120 ? `${clean.slice(0, 117)}…` : clean;
      };

      const register = (kind, id) => {
        if (!id) return;
        const key = `${kind}:${id}`;
        if (seen.has(key)) return;
        seen.add(key);
        refs.push({ kind, id });
      };

      const extract = (src) => {
        if (typeof src !== 'string') return;
        if (src.startsWith('node:')) register('node', src.slice(5));
        if (src.startsWith('turn:')) register('turn', src.slice(5));
        if (src.startsWith('evidence:')) register('evidence', src.slice(9));
        if (src.startsWith('ev:')) register('evidence', src.slice(3));
      };

      sections.forEach((section) => (section.sources || []).forEach(extract));
      requirements.forEach((req) => (req.sources || []).forEach(extract));

      const nodeIds = refs.filter((r) => r.kind === 'node' || r.kind === 'turn').map((r) => r.id);
      const evidenceIds = refs.filter((r) => r.kind === 'evidence').map((r) => r.id);

      const [nodeRows, evidenceRows] = await Promise.all([
        nodeIds.length
          ? pool.query(
              `SELECT id, text, role
                 FROM nodes
                WHERE id = ANY($1::uuid[])`,
              [nodeIds]
            ).then((r) => r.rows)
          : [],
        evidenceIds.length
          ? pool.query(
              `SELECT id, title, source_url
                 FROM evidence_items
                WHERE id = ANY($1::uuid[])`,
              [evidenceIds]
            ).then((r) => r.rows)
          : [],
      ]);

      const nodeMap = new Map(nodeRows.map((n) => [String(n.id), n]));
      const evidenceMap = new Map(evidenceRows.map((e) => [String(e.id), e]));
      const appBaseUrl = process.env.APP_PUBLIC_URL || '';
      const normalizedBaseUrl = appBaseUrl ? appBaseUrl.replace(/\/$/, '') : '';
      const buildAppUrl = (path) => (normalizedBaseUrl ? `${normalizedBaseUrl}${path}` : path);
      const buildNodeLink = (nodeId) => {
        if (!draft.tree_id || !nodeId) return null;
        return buildAppUrl(`/app/tree/${draft.tree_id}?node=${encodeURIComponent(nodeId)}`);
      };
      const buildEvidenceLink = (evidenceId) => {
        if (!draft.tree_id || !evidenceId) return null;
        return buildAppUrl(`/app/tree/${draft.tree_id}?evidence=${encodeURIComponent(evidenceId)}`);
      };

      const formatReference = (ref) => {
        if (ref.kind === 'node') {
          const node = nodeMap.get(ref.id);
          const label = node?.text ? previewText(node.text) : `Node ${ref.id}`;
          const link = buildNodeLink(ref.id);
          return link ? `- [node:${ref.id}](${link}) ${label}` : `- [node:${ref.id}] ${label}`;
        }
        if (ref.kind === 'turn') {
          const node = nodeMap.get(ref.id);
          const label = node?.text ? previewText(node.text) : `Turn ${ref.id}`;
          const link = buildNodeLink(ref.id);
          return link ? `- [turn:${ref.id}](${link}) ${label}` : `- [turn:${ref.id}] ${label}`;
        }
        const ev = evidenceMap.get(ref.id) || {};
        const title = ev.title || `Evidence ${ref.id}`;
        const url = ev.source_url ? ` ${ev.source_url}` : '';
        const link = buildEvidenceLink(ref.id);
        return link
          ? `- [evidence:${ref.id}](${link}) ${title}${url}`
          : `- [evidence:${ref.id}] ${title}${url}`;
      };

      const sourceLine = (sources = []) => {
        const markers = [];
        sources.forEach((src) => {
          if (typeof src !== 'string') return;
          if (src.startsWith('node:')) {
            markers.push(`[node:${src.slice(5)}]`);
          } else if (src.startsWith('turn:')) {
            markers.push(`[turn:${src.slice(5)}]`);
          } else if (src.startsWith('evidence:')) {
            markers.push(`[evidence:${src.slice(9)}]`);
          } else if (src.startsWith('ev:')) {
            markers.push(`[evidence:${src.slice(3)}]`);
          }
        });
        return markers.length ? `Sources: ${markers.join(' ')}` : null;
      };

      const lines = [];
      lines.push(`# Outcome Export (${draft.outcome_type || 'brief'})`);
      lines.push('');
      sections.forEach((section) => {
        lines.push(`## ${section.title || section.key || 'Section'}`);
        if (section.summary) {
          lines.push(section.summary);
        } else {
          lines.push('_No summary_');
        }
        const srcLine = sourceLine(section.sources);
        if (srcLine) {
          lines.push(srcLine);
        }
        lines.push('');
      });

      lines.push('## References');
      if (refs.length === 0) {
        lines.push('_No references_');
      } else {
        const sorted = refs.sort((a, b) => {
          const order = { node: 0, turn: 1, evidence: 2 };
          const oa = order[a.kind] ?? 99;
          const ob = order[b.kind] ?? 99;
          if (oa !== ob) return oa - ob;
          return String(a.id).localeCompare(String(b.id));
        });
        sorted.forEach((ref) => lines.push(formatReference(ref)));
      }
      lines.push('');

      const content = lines.join('\n');
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.send(content);
    })
  );

  // T57-2: PATCH endpoint to update outline_sections and evidence_requirements
  router.patch(
    '/api/outcomes/:id',
    wrapAsync(async (req, res) => {
      const id = req.params.id;
      if (!id) {
        throw new HttpError({ status: 400, code: 'invalid_id', message: 'Draft ID is required' });
      }

      const { outline_sections, evidence_requirements } = req.body || {};

      // Validate arrays if provided
      if (outline_sections !== undefined && !Array.isArray(outline_sections)) {
        throw new HttpError({ status: 400, code: 'invalid_outline_sections', message: 'outline_sections must be an array' });
      }
      if (evidence_requirements !== undefined && !Array.isArray(evidence_requirements)) {
        throw new HttpError({ status: 400, code: 'invalid_evidence_requirements', message: 'evidence_requirements must be an array' });
      }

      let draft;
      try {
        draft = await updateOutcomeDraft({
          id,
          outlineSections: outline_sections,
          evidenceRequirements: evidence_requirements,
        });
      } catch (err) {
        if (err?.message === 'draft_id_required') {
          throw new HttpError({ status: 400, code: 'draft_id_required', message: 'Draft ID is required' });
        }
        throw err;
      }

      if (!draft) {
        throw new HttpError({ status: 404, code: 'outcome_draft_not_found', message: 'Outcome draft not found' });
      }

      res.status(200).json(withTraceId(res, { ok: true, draft }));
    })
  );

  router.get(
    '/api/trees/:treeId/outcomes',
    wrapAsync(async (req, res) => {
      const treeId = req.params.treeId;
      if (!treeId) {
        throw new HttpError({ status: 400, code: 'invalid_tree_id', message: 'treeId is required' });
      }
      const snapshotId = req.query.snapshot_id || null;
      const outcomeType = req.query.outcome_type
        ? normalizeOutcomeTypeInput(req.query.outcome_type, { fallback: null, strict: true })
        : null;
      const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 20, 50));
      const drafts = await listOutcomeDrafts({ treeId, snapshotId, outcomeType, limit });
      res.status(200).json(withTraceId(res, { drafts }));
    })
  );

  return router;
}
