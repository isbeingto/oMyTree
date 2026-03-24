/**
 * Admin System Settings Routes
 * T28: System Settings (TDK, Favicon)
 * 
 * GET  /api/admin/settings      - Get all system settings
 * POST /api/admin/settings      - Update system settings
 * POST /api/admin/settings/favicon - Upload favicon
 */

import express from 'express';
import multer from 'multer';
import { getConfig, setConfig } from '../services/system_config.js';
import { writeAuditLog } from '../lib/audit_log.js';

const router = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getClientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || null;
}

function getTraceId(res, req) {
  return res.locals?.traceId || req.headers?.['x-trace-id'] || null;
}

function getAdminActorUserId(req) {
  const raw = req.headers?.['x-omytree-user-id'];
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value) return null;
  return UUID_RE.test(value) ? value : null;
}

// Multer configuration for favicon upload
// NOTE: Store as data URL in system_config so it takes effect immediately
// without requiring a Next.js restart to pick up new files in /public.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 }, // 1MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/x-icon', 'image/png', 'image/svg+xml', 'image/vnd.microsoft.icon'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only .ico, .png, and .svg files are allowed'));
    }
  }
});

/**
 * GET /api/admin/settings
 * Get all system settings
 */
router.get('/api/admin/settings', async (req, res) => {
  try {
    const siteFavicon = await getConfig('site_favicon', null);

    res.json({
      ok: true,
      settings: {
        site_favicon: siteFavicon
      }
    });
  } catch (error) {
    console.error('[admin/settings] GET failed:', error);
    res.status(500).json({
      ok: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/settings/favicon
 * Upload favicon
 */
router.post('/api/admin/settings/favicon', upload.single('favicon'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        ok: false,
        error: 'NO_FILE',
        message: 'No favicon file uploaded'
      });
    }

    const adminEmail = req.headers['x-omytree-admin-email'] || 'unknown';

    const mimeType = req.file.mimetype;
    const base64 = req.file.buffer.toString('base64');
    const faviconDataUrl = `data:${mimeType};base64,${base64}`;

    await setConfig('site_favicon', faviconDataUrl, adminEmail);

    console.log(`[admin/settings] Favicon uploaded by ${adminEmail}: ${mimeType}, ${req.file.size} bytes`);

    await writeAuditLog({
      actorUserId: getAdminActorUserId(req),
      actorRole: 'admin',
      action: 'admin.settings.favicon_upload',
      targetType: 'system_settings',
      targetId: 'site_favicon',
      ip: getClientIp(req),
      traceId: getTraceId(res, req),
      metadata: {
        mime_type: mimeType,
        file_size: req.file.size,
        updated_by_email: adminEmail,
      },
    });

    res.json({
      ok: true,
      favicon: faviconDataUrl,
      message: 'Favicon uploaded successfully'
    });
  } catch (error) {
    console.error('[admin/settings] Favicon upload failed:', error);
    res.status(500).json({
      ok: false,
      error: 'UPLOAD_FAILED',
      message: error.message
    });
  }
});

export default router;
