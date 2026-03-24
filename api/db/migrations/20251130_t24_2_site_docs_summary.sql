-- Migration: 20251130_t24_2_site_docs_summary
-- Description: Add summary field to site_docs table

BEGIN;

-- Add summary field for document excerpts
ALTER TABLE site_docs
  ADD COLUMN IF NOT EXISTS summary TEXT;

COMMIT;
