/**
 * T58-3: File Upload Configuration
 * 
 * Multer middleware for evidence file uploads.
 */

import multer from 'multer';
import path from 'path';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';

// Upload directory
const UPLOAD_DIR = process.env.EVIDENCE_UPLOAD_DIR || './data/evidence_uploads';

// File type whitelist
const ALLOWED_MIME_TYPES = [
  // Documents
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/json',
  
  // Images
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/svg+xml',
  'image/webp',
];

const ALLOWED_EXTENSIONS = [
  '.pdf',
  '.txt',
  '.md',
  '.json',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
];

// File size limit (10MB)
const MAX_FILE_SIZE = parseInt(process.env.EVIDENCE_MAX_FILE_SIZE || '10485760', 10); // 10MB

/**
 * Multer storage configuration
 */
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const treeId = req.body.tree_id || 'unknown';
    const uploadPath = path.join(UPLOAD_DIR, treeId);
    
    // Ensure directory exists
    try {
      await fs.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `${randomUUID()}${ext}`;
    cb(null, filename);
  },
});

/**
 * File filter for validation
 */
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mimeType = file.mimetype;

  // Check extension
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return cb(new Error(`File type not allowed: ${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`));
  }

  // Check MIME type
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return cb(new Error(`MIME type not allowed: ${mimeType}`));
  }

  cb(null, true);
};

/**
 * Multer upload middleware
 */
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
});

/**
 * Get file size limit in MB
 */
export function getMaxFileSizeMB() {
  return Math.round(MAX_FILE_SIZE / 1024 / 1024);
}

/**
 * Get allowed file types
 */
export function getAllowedFileTypes() {
  return {
    extensions: ALLOWED_EXTENSIONS,
    mimeTypes: ALLOWED_MIME_TYPES,
  };
}
