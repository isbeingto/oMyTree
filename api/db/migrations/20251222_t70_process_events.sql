-- T70: Process Events table for zero-token process asset logging
-- Records user behavior and system actions without LLM calls

BEGIN;

CREATE TABLE IF NOT EXISTS process_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id UUID NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  scope_node_id UUID REFERENCES nodes(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Required indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_process_events_tree_created 
  ON process_events(tree_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_process_events_tree_scope_created 
  ON process_events(tree_id, scope_node_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_process_events_tree_type_created 
  ON process_events(tree_id, event_type, created_at DESC);

-- Permissions for runtime user
GRANT SELECT, INSERT ON TABLE process_events TO linzhi;

COMMENT ON TABLE process_events IS 'T70/P0-6: Zero-token process event logging for user behavior, system actions, and second-layer assets';
COMMENT ON COLUMN process_events.event_type IS 'Whitelist: turn_created, branch_created, node_focused, model_switched, attachment_added, memo_generated, memo_updated, memo_regenerated, trail.generated, trail.version_viewed, keyframe.pinned, keyframe.unpinned, keyframe.annotation_updated, snapshot.created, branch.diff_generated';
COMMENT ON COLUMN process_events.meta IS 'Event metadata: { actor, source, node_id, turn_id, memo_id, model, conversation_id, artifact_id, prompt_version }';

COMMIT;
