-- Migration: Add reasoning_content column for DeepSeek reasoning support
-- Date: 2025-01-13
-- Task: Phase 0 of DEEPSEEK_REASONING_UPGRADE_PLAN.md
-- Status: APPLIED ✅

-- Purpose: Store DeepSeek reasoner model's thinking process (推理内容)
-- Models affected:
--   - deepseek-chat: Will NOT populate this field (reasoning_content = NULL)
--   - deepseek-reasoner: Will populate with reasoning_content from API response

-- Add reasoning_content column to nodes table
ALTER TABLE nodes
ADD COLUMN IF NOT EXISTS reasoning_content TEXT DEFAULT NULL;

-- Add index for performance optimization when querying nodes with reasoning
-- This index uses a functional expression to filter NULL values
CREATE INDEX IF NOT EXISTS idx_nodes_has_reasoning
ON nodes ((reasoning_content IS NOT NULL))
WHERE reasoning_content IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN nodes.reasoning_content IS 'DeepSeek reasoner model thinking process (推理内容), NULL for non-reasoning models';

-- Verification query
-- SELECT COUNT(*) AS nodes_with_reasoning FROM nodes WHERE reasoning_content IS NOT NULL;
-- Expected: 0 (before feature deployment)
