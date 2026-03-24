-- Migration: Create branch_summaries table for P2:BranchSummary feature
-- Date: 2026-02-02

CREATE TABLE IF NOT EXISTS branch_summaries (
    id SERIAL PRIMARY KEY,
    tree_id VARCHAR(64) NOT NULL,
    branch_id VARCHAR(64) NOT NULL,
    branch_root_node_id VARCHAR(64) NOT NULL,
    branch_tip_node_id VARCHAR(64) NOT NULL,
    summary JSONB,
    summary_text TEXT DEFAULT '',
    node_count INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    summarized_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_branch_summaries_tree_branch UNIQUE (tree_id, branch_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_branch_summaries_tree_id ON branch_summaries(tree_id);
CREATE INDEX IF NOT EXISTS idx_branch_summaries_updated_at ON branch_summaries(updated_at DESC);
