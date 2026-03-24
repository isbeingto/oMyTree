-- T87: Text/Structured Parsing v0 — Normalize + Preview + Searchable Text Field
-- Adds normalized_text fields to uploads table for parsed content

BEGIN;

-- Add parsing-related columns to uploads table
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS normalized_text TEXT;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS normalized_meta JSONB;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS parsed_at TIMESTAMPTZ;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS parse_error TEXT;

-- Create index for parsed/unparsed lookup
CREATE INDEX IF NOT EXISTS idx_uploads_parsed_at 
  ON uploads(parsed_at)
  WHERE parsed_at IS NOT NULL;

COMMENT ON COLUMN uploads.normalized_text IS 'T87: Normalized/parsed text content for preview and search';
COMMENT ON COLUMN uploads.normalized_meta IS 'T87: Metadata from parsing (e.g., rows/cols for CSV, keys for JSON)';
COMMENT ON COLUMN uploads.parsed_at IS 'T87: Timestamp when content was parsed';
COMMENT ON COLUMN uploads.parse_error IS 'T87: Error message if parsing failed';

COMMIT;
