-- Migration: 20251130_t24_0_admin_schema
-- Description: Add site_docs table and user role/status fields for admin system

BEGIN;

-- ============================================================================
-- 1. Add role and is_active fields to users table
-- ============================================================================

-- Add role field: 'user' (default) or 'admin'
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'admin'));

-- Add is_active field for account status
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Create index for common queries filtering by role
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ============================================================================
-- 2. Create site_docs table for website content management
-- ============================================================================

CREATE TABLE IF NOT EXISTS site_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Unique slug for URL routing (e.g., 'getting-started', 'pricing')
  slug TEXT NOT NULL,
  
  -- Document title
  title TEXT NOT NULL,
  
  -- Main content (markdown/html)
  content TEXT,
  
  -- Publication status
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  
  -- Language code for i18n (e.g., 'en', 'zh-CN')
  lang TEXT NOT NULL DEFAULT 'en',
  
  -- Timestamps (matching existing schema style)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Optional: creator reference
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Unique constraint on slug + lang combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_site_docs_slug_lang ON site_docs(slug, lang);

-- Index for filtering by status
CREATE INDEX IF NOT EXISTS idx_site_docs_status ON site_docs(status);

-- Index for filtering by language
CREATE INDEX IF NOT EXISTS idx_site_docs_lang ON site_docs(lang);

COMMIT;
