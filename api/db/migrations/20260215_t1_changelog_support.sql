-- Migration: Add changelog support to site_docs
-- Date: 2026-02-15
-- Description: Adds doc_type and version columns to site_docs, drops old changelog tables

-- Drop legacy changelog tables
DROP TABLE IF EXISTS site_changelogs CASCADE;
DROP TABLE IF EXISTS changelogs CASCADE;

-- Add doc_type column: 'article' (default) or 'changelog'
ALTER TABLE site_docs ADD COLUMN IF NOT EXISTS doc_type TEXT NOT NULL DEFAULT 'article' CHECK (doc_type IN ('article', 'changelog'));

-- Add version column for changelog entries (e.g., 'v1.2.0')
ALTER TABLE site_docs ADD COLUMN IF NOT EXISTS version TEXT;

-- Index for doc_type filtering
CREATE INDEX IF NOT EXISTS idx_site_docs_doc_type ON site_docs(doc_type);
