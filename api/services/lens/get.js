import { getNodeLocal } from '../node/local.js';
import { getSummaries } from '../llm/index.js';
import { saveLens } from './update.js';
import { pool } from '../../db/pool.js';

const PATH_DEFAULT_LIMIT = 140;
const PARENT_DEFAULT_LIMIT = 120;
const AUTO_AUTHOR_FALLBACK = 'llm:fallback';
const AUTO_AUTHOR_DEFAULT = 'llm:auto';

function truncate(value, max) {
	if (!value) {
		return '';
	}
	return value.length <= max ? value : value.slice(0, max);
}

function isBlank(value) {
	return typeof value !== 'string' || value.trim().length === 0;
}

function shouldAutoInitialize(row) {
	if (!row) {
		return true;
	}
	const pathBlank = isBlank(row.path_summary);
	const parentBlank = isBlank(row.parent_summary);
	const hasAuthor = typeof row.updated_by === 'string' && row.updated_by.trim().length > 0;
	return pathBlank && parentBlank && !hasAuthor;
}

function buildFallbackLens(nodeId, local) {
	const pathTitles = Array.isArray(local.path_titles) ? local.path_titles : [];
	const joinedPath = pathTitles.filter(Boolean).join(' → ');
	const parentText = local.parent?.text ?? '';

	return {
		node_id: nodeId,
		path_summary: truncate(joinedPath, PATH_DEFAULT_LIMIT),
		parent_summary: truncate(parentText, PARENT_DEFAULT_LIMIT),
		updated_by: null,
		updated_at: null,
		lens_text: null,
	};
}

function resolveAutoAuthor(result) {
	if (result.source === 'fallback') {
		return AUTO_AUTHOR_FALLBACK;
	}
	if (result.source === 'mock') {
		return 'llm:mock';
	}
	if (result.provider) {
		return `llm:${result.provider}`;
	}
	return AUTO_AUTHOR_DEFAULT;
}

export async function getLens(nodeId, { autoInitialize = false, userId = null } = {}) {
  if (!userId) {
    throw Object.assign(new Error('user_id is required'), { status: 422, code: 'INVALID_USER_ID' });
  }
 // 复用局部视图查询，确保节点存在且未被软删
	const local = await getNodeLocal(nodeId, { includeDeleted: false, userId });
	if (!local) {
		return null;
	}

	const { rows } = await pool.query(
		`SELECT node_id, path_summary, parent_summary, updated_by, updated_at, lens_text
		 FROM node_summaries
		 WHERE node_id = $1
		 LIMIT 1`,
		[nodeId]
	);

	const existing = rows[0] || null;
	const fallback = buildFallbackLens(nodeId, local);

	const needsAuto = autoInitialize && shouldAutoInitialize(existing);
	if (!needsAuto) {
		return existing || fallback;
	}

	const treeId = local.node?.tree_id;
	if (!treeId) {
		return existing || fallback;
	}

	const generationPayload = {
		tree_id: treeId,
		node_id: nodeId,
		user_text: local.node?.text ?? '',
		path_summary: fallback.path_summary,
		parent_summary: fallback.parent_summary,
		breadcrumb: Array.isArray(local.path_titles) ? local.path_titles : [],
		parent_text: local.parent?.text ?? '',
	};

	const summaries = await getSummaries(generationPayload, { userId });
	const author = resolveAutoAuthor(summaries);

	try {
		const saved = await saveLens(nodeId, {
			path_summary: summaries.path_summary,
			parent_summary: summaries.parent_summary,
			updated_by: author,
			userId,
		});
		console.info(
			`[LensService] Auto-initialized node ${nodeId} via ${summaries.source} (${summaries.provider || 'n/a'})`
		);
		return saved;
	} catch (error) {
		console.error('[LensService] Failed to persist auto summaries', error);
		return {
			node_id: nodeId,
			path_summary: summaries.path_summary || fallback.path_summary,
			parent_summary: summaries.parent_summary || fallback.parent_summary,
			updated_by: null,
			updated_at: null,
		};
	}
}
