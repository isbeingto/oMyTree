-- P3: Drop redundant indexes that are fully covered by unique indexes.
-- Safe scope only: no primary key / unique constraint indexes are touched.

-- Covered by uq_email_verification_token(token)
DROP INDEX IF EXISTS idx_email_verification_tokens_token;

-- Covered by uq_password_reset_token(token)
DROP INDEX IF EXISTS idx_password_reset_tokens_token;

-- Covered by idx_platform_providers_single_default WHERE is_default = true
DROP INDEX IF EXISTS idx_platform_providers_default;

-- Duplicate of idx_uploads_user_id(user_id)
DROP INDEX IF EXISTS idx_uploads_user;
