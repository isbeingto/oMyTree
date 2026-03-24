import express from 'express';
import { validate as uuidValidate } from 'uuid';
import { getLens } from '../services/lens/get.js';
import { saveLens } from '../services/lens/update.js';
import { withTraceId } from '../lib/trace.js';
import { getAuthUserIdForRequest } from '../lib/auth_user.js';
import { pool } from '../db/pool.js';

const MAX_LENGTH = 280;

function invalidResponse(res, status, error, detail = null) {
	const payload = { ok: false, error };
	if (detail) {
		payload.detail = detail;
	}
	return res.status(status).json(withTraceId(res, payload));
}

export default function createLensRouter() {
	const router = express.Router();

	router.get('/:id/lens', async (req, res) => {
		try {
			const { id } = req.params;
			if (!uuidValidate(id)) {
				return invalidResponse(res, 422, 'INVALID_NODE_ID');
			}

			const userId = await getAuthUserIdForRequest(req, pool);
			const lens = await getLens(id, { autoInitialize: true, userId });
			if (!lens) {
				return invalidResponse(res, 404, 'NODE_NOT_FOUND');
			}

			return res.json(withTraceId(res, { ok: true, lens }));
		} catch (error) {
			console.error('[LensRoute] GET failed:', error);
			return invalidResponse(res, 500, 'INTERNAL_ERROR');
		}
	});

	router.patch('/:id/lens', async (req, res) => {
		try {
			const { id } = req.params;
			if (!uuidValidate(id)) {
				return invalidResponse(res, 422, 'INVALID_NODE_ID');
			}

			const nodeId = id;
			const body = req.body || {};
			if (typeof body !== 'object' || Array.isArray(body)) {
				return invalidResponse(res, 422, 'INVALID_PAYLOAD');
			}

			const allowed = new Set(['path_summary', 'parent_summary', 'who', 'text']);
			const extras = Object.keys(body).filter((key) => !allowed.has(key));
			if (extras.length > 0) {
				return invalidResponse(res, 400, 'FIELD_FORBIDDEN', extras);
			}

			const userId = await getAuthUserIdForRequest(req, pool);
			const current = await getLens(nodeId, { userId });
			if (!current) {
				return invalidResponse(res, 404, 'NODE_NOT_FOUND');
			}

			if (body.path_summary === undefined && body.parent_summary === undefined && body.text === undefined) {
				return invalidResponse(res, 422, 'EMPTY_UPDATE');
			}

			// Allow updates without 'who' if only updating manual text
			if (body.text !== undefined && body.who === undefined) {
				// It's okay, we can default to 'manual' or keep existing if we wanted, 
				// but let's just not require it for manual text updates if the spec implies it.
				// However, the original code required 'who'. Let's see if we should relax it.
				// The spec says: PATCH body contains { text: string }. It doesn't mention 'who'.
				// So we should probably allow 'who' to be optional or default it.
			} else if (typeof body.who !== 'string') {
				// If 'who' is provided, it must be a string.
				// If 'who' is NOT provided, and we are updating summaries, we might have an issue if the original code enforced it.
				// But for 'text' (lens_text), we definitely want to allow it without 'who'.
				if (body.path_summary !== undefined || body.parent_summary !== undefined) {
					 return invalidResponse(res, 422, 'INVALID_AUTHOR');
				}
			}

			let nextPath = undefined; // undefined means "do not update" in our new saveLens logic (if we use COALESCE)
			let nextParent = undefined;
			let nextLensText = undefined;
			let nextWho = body.who;

			if (body.text !== undefined) {
				if (typeof body.text !== 'string') {
					return invalidResponse(res, 422, 'INVALID_LENS_TEXT');
				}
				nextLensText = body.text; // Allow empty string
			}

			if (body.path_summary !== undefined) {
				if (typeof body.path_summary !== 'string') {
					return invalidResponse(res, 422, 'INVALID_PATH_SUMMARY');
				}
				const trimmed = body.path_summary.trim();
				if (trimmed.length > MAX_LENGTH) {
					return invalidResponse(res, 422, 'PATH_SUMMARY_TOO_LONG');
				}
				nextPath = trimmed;
			}

			if (body.parent_summary !== undefined) {
				if (typeof body.parent_summary !== 'string') {
					return invalidResponse(res, 422, 'INVALID_PARENT_SUMMARY');
				}
				const trimmed = body.parent_summary.trim();
				if (trimmed.length > MAX_LENGTH) {
					return invalidResponse(res, 422, 'PARENT_SUMMARY_TOO_LONG');
				}
				nextParent = trimmed;
			}

			const saved = await saveLens(nodeId, {
				path_summary: nextPath,
				parent_summary: nextParent,
				updated_by: nextWho,
				lens_text: nextLensText,
				userId,
			});

			return res.json(withTraceId(res, { ok: true, lens: saved }));
		} catch (error) {
			console.error('[LensRoute] PATCH failed:', error);
			return invalidResponse(res, 500, 'INTERNAL_ERROR');
		}
	});

	return router;
}
