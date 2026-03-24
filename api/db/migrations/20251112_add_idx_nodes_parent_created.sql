-- Migration: 20251112_add_idx_nodes_parent_created
-- Purpose: Optimize children retrieval in /api/node/:id/local
-- Date: 2025-11-12

-- Index to accelerate parent_id + created_at queries
CREATE INDEX IF NOT EXISTS idx_nodes_parent_id_created_at
ON nodes(parent_id, created_at)
WHERE soft_deleted_at IS NULL;

-- This index supports:
-- 1. Fast enumeration of children for a given parent_id
-- 2. Ordered retrieval by created_at (chronological order)
-- 3. Filtered on non-deleted nodes
