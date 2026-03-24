-- T53-3: Context Debug Logs - messages sampling for debugging
-- Migration: 20251211_t53_3_context_debug_logs
-- Purpose: Store LLM request context snapshots for debugging purposes

BEGIN;

-- Main debug logs table
CREATE TABLE IF NOT EXISTS context_debug_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Request identifiers
  tree_id UUID NOT NULL,
  node_id UUID,
  turn_id UUID,
  
  -- LLM configuration
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  context_profile TEXT NOT NULL CHECK (context_profile IN ('lite', 'standard', 'max')),
  memory_scope TEXT NOT NULL CHECK (memory_scope IN ('branch', 'tree')),
  
  -- Context snapshot
  messages JSONB NOT NULL, -- Array of {role, content} objects
  message_count INTEGER NOT NULL, -- For quick filtering
  total_tokens INTEGER, -- Estimated token count if available
  
  -- Metadata
  user_id UUID NOT NULL,
  debug_enabled_by TEXT, -- 'global' or 'tree' or 'user'
  
  -- Performance tracking
  context_build_ms INTEGER, -- Time to build context
  
  -- Optional notes
  notes TEXT
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_context_debug_logs_tree_id 
  ON context_debug_logs(tree_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_context_debug_logs_turn_id 
  ON context_debug_logs(turn_id);

CREATE INDEX IF NOT EXISTS idx_context_debug_logs_user_id 
  ON context_debug_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_context_debug_logs_created_at 
  ON context_debug_logs(created_at DESC);

-- Add per-tree debug flag to trees table
ALTER TABLE trees 
  ADD COLUMN IF NOT EXISTS context_debug_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_trees_context_debug_enabled 
  ON trees(context_debug_enabled) 
  WHERE context_debug_enabled = true;

-- Comment on table
COMMENT ON TABLE context_debug_logs IS 
  'T53-3: Stores LLM request context snapshots for debugging. Only active when debug mode is enabled.';

COMMENT ON COLUMN context_debug_logs.messages IS 
  'JSONB array of {role, content} objects sent to LLM. May be truncated for large contexts.';

COMMENT ON COLUMN context_debug_logs.debug_enabled_by IS 
  'Indicates whether debug was enabled globally or per-tree/user basis';

COMMIT;
