-- Migration 000011: Drop redundant indexes covered by unique indexes

DROP INDEX IF EXISTS idx_users_email;
DROP INDEX IF EXISTS idx_users_username;
