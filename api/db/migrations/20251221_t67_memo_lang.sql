-- T67: Add lang column to memos table for language tracking
-- Default 'zh' for backward compatibility with existing Chinese memos

ALTER TABLE memos ADD COLUMN IF NOT EXISTS lang TEXT NOT NULL DEFAULT 'zh';

COMMENT ON COLUMN memos.lang IS 'T67: Memo output language (en/zh), resolved from auto/explicit selection';
