/**
 * Admin Landing Media Routes
 * Manage images/GIFs/videos for the landing page showcase sections.
 *
 * POST   /api/admin/landing-media/upload   – Upload a media file
 * GET    /api/admin/landing-media           – List all media items
 * PATCH  /api/admin/landing-media/:id       – Update metadata
 * DELETE /api/admin/landing-media/:id       – Delete a media item
 *
 * Public:
 * GET    /api/landing-media                 – Public listing (for SSR)
 * GET    /api/landing-media/file/:filename  – Serve media file
 */

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import crypto from 'crypto';
import { getConfig, setConfig } from '../services/system_config.js';

const router = express.Router();

const MEDIA_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../data/landing-media',
);

const CONFIG_KEY = 'landing_media_items';
const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);
const ALLOWED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.mp4',
  '.webm',
  '.mov',
]);
const MIMELESS_FALLBACK_TYPES = new Set([
  '',
  'application/octet-stream',
  'binary/octet-stream',
]);
const EXTENSION_MIME_MAP = Object.freeze({
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
});

// Ensure media directory exists
async function ensureDir() {
  await fs.mkdir(MEDIA_DIR, { recursive: true });
}

// Multer configuration
const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    await ensureDir();
    cb(null, MEDIA_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const id = crypto.randomUUID();
    cb(null, `${id}${ext}`);
  },
});

export function isAllowedLandingMediaFile(file = {}) {
  const mimetype = String(file.mimetype || '').toLowerCase();
  const ext = path.extname(String(file.originalname || '')).toLowerCase();

  if (ALLOWED_MIME_TYPES.has(mimetype)) return true;
  if (!ALLOWED_EXTENSIONS.has(ext)) return false;

  // Some browsers/mobile clients upload MP4/MOV as generic octet-stream.
  return MIMELESS_FALLBACK_TYPES.has(mimetype);
}

export function getLandingMediaMimeType(filename = '') {
  const ext = path.extname(String(filename)).toLowerCase();
  return EXTENSION_MIME_MAP[ext] || 'application/octet-stream';
}

function isLandingMediaUploadError(error) {
  if (!error) return false;
  if (error instanceof multer.MulterError) return true;
  return typeof error.message === 'string' && error.message.startsWith('UNSUPPORTED_MEDIA_TYPE');
}

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    if (isAllowedLandingMediaFile(file)) {
      cb(null, true);
    } else {
      cb(new Error('UNSUPPORTED_MEDIA_TYPE: only png/jpg/jpeg/gif/webp/svg/mp4/webm/mov files are allowed'));
    }
  },
});

function runLandingMediaUpload(req, res) {
  return new Promise((resolve, reject) => {
    upload.single('file')(req, res, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

// ─── Helpers ────────────────────────────────────────────────
async function loadItems() {
  const raw = await getConfig(CONFIG_KEY, '[]');
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? raw : []);
  } catch {
    return [];
  }
}

async function saveItems(items) {
  await setConfig(CONFIG_KEY, JSON.stringify(items));
}

// ─── Admin: Upload ──────────────────────────────────────────
router.post('/api/admin/landing-media/upload', async (req, res) => {
  try {
    await runLandingMediaUpload(req, res);

    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'NO_FILE' });
    }

    const { section = 'hero', title_en = '', title_zh = '', description_en = '', description_zh = '', sort_order = '0' } = req.body || {};

    const item = {
      id: path.basename(req.file.filename, path.extname(req.file.filename)),
      section,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      title_en,
      title_zh,
      description_en,
      description_zh,
      sortOrder: parseInt(sort_order, 10) || 0,
      createdAt: new Date().toISOString(),
    };

    const items = await loadItems();
    items.push(item);
    await saveItems(items);

    console.log(`[landing-media] Uploaded: ${req.file.filename} (${section})`);
    res.json({ ok: true, item });
  } catch (error) {
    console.error('[landing-media] Upload failed:', error);
    const status = isLandingMediaUploadError(error) ? 400 : 500;
    res.status(status).json({ ok: false, error: error.message || 'UPLOAD_FAILED' });
  }
});

// ─── Admin: List ────────────────────────────────────────────
router.get('/api/admin/landing-media', async (_req, res) => {
  try {
    const items = await loadItems();
    res.json({ ok: true, items });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ─── Admin: Patch ───────────────────────────────────────────
router.patch('/api/admin/landing-media/:id', async (req, res) => {
  try {
    const items = await loadItems();
    const idx = items.findIndex((i) => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

    const allowed = ['section', 'title_en', 'title_zh', 'description_en', 'description_zh', 'sortOrder', 'sort_order'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        const storeKey = key === 'sort_order' ? 'sortOrder' : key;
        items[idx][storeKey] = key.includes('order') || key === 'sortOrder'
          ? parseInt(req.body[key], 10) || 0
          : req.body[key];
      }
    }

    await saveItems(items);
    res.json({ ok: true, item: items[idx] });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ─── Admin: Delete ──────────────────────────────────────────
router.delete('/api/admin/landing-media/:id', async (req, res) => {
  try {
    const items = await loadItems();
    const idx = items.findIndex((i) => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

    const removed = items.splice(idx, 1)[0];

    // Delete file from disk
    const filePath = path.join(MEDIA_DIR, removed.filename);
    try { await fs.unlink(filePath); } catch { /* ignore if already gone */ }

    await saveItems(items);
    console.log(`[landing-media] Deleted: ${removed.filename}`);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ─── Public: List by section ────────────────────────────────
router.get('/api/landing-media', async (req, res) => {
  try {
    const items = await loadItems();
    const section = req.query.section;
    const filtered = section ? items.filter((i) => i.section === section) : items;
    filtered.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    // Browser-side caching for landing media metadata (works without CDN).
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    res.json({ ok: true, items: filtered });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ─── Public: Serve file ─────────────────────────────────────
router.get('/api/landing-media/file/:filename', async (req, res) => {
  try {
    const filename = path.basename(req.params.filename); // sanitize
    const filePath = path.join(MEDIA_DIR, filename);
    const stat = await fs.stat(filePath);
    const totalSize = stat.size;
    const range = req.headers.range;

    res.setHeader('Content-Type', getLandingMediaMimeType(filename));
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Accept-Ranges', 'bytes');

    if (typeof range === 'string' && range.startsWith('bytes=')) {
      const [startRaw, endRaw] = range.replace(/^bytes=/, '').split('-');
      const start = Number.parseInt(startRaw, 10);
      const end = endRaw ? Number.parseInt(endRaw, 10) : totalSize - 1;

      if (
        Number.isNaN(start) ||
        Number.isNaN(end) ||
        start < 0 ||
        end < 0 ||
        start > end ||
        end >= totalSize
      ) {
        res.status(416);
        res.setHeader('Content-Range', `bytes */${totalSize}`);
        return res.end();
      }

      const chunkSize = end - start + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
      res.setHeader('Content-Length', String(chunkSize));
      return createReadStream(filePath, { start, end }).pipe(res);
    }

    res.setHeader('Content-Length', String(totalSize));
    return createReadStream(filePath).pipe(res);
  } catch {
    res.status(404).json({ ok: false, error: 'FILE_NOT_FOUND' });
  }
});

export default router;
