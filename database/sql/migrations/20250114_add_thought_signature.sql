-- Migration: Add thought_signature column for Gemini 3 multi-turn reasoning
-- Date: 2025-01-14
-- Task: Phase 2 of GEMINI_OPTIMIZATION_PLAN.md
--
-- Purpose: Store Gemini 3 thought signatures for multi-turn conversation quality
-- Models affected:
--   - gemini-3-*: Will populate this field with encrypted reasoning context
--   - gemini-2.5-*: May populate (depending on API response)
--   - Other models: Will have NULL (not applicable)
--
-- Background:
-- Gemini 3 returns a `thoughtSignature` in the response which must be passed back
-- in subsequent requests to maintain reasoning quality across turns.
-- For Function Calling, missing signatures will cause 400 errors.

-- Add thought_signature column to nodes table
ALTER TABLE nodes
ADD COLUMN IF NOT EXISTS thought_signature TEXT DEFAULT NULL;

-- Create partial index for efficient lookup of nodes with signatures
-- This helps when loading conversation history for Gemini requests
CREATE INDEX IF NOT EXISTS idx_nodes_has_thought_signature
ON nodes ((thought_signature IS NOT NULL))
WHERE thought_signature IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN nodes.thought_signature IS
  'Gemini 3 Thought Signature: encrypted reasoning context for multi-turn quality. Only AI nodes may have this.';

-- Verification query
-- SELECT COUNT(*) AS nodes_with_signature FROM nodes WHERE thought_signature IS NOT NULL;
-- Expected: 0 (before feature deployment)
