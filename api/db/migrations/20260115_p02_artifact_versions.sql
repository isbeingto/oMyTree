-- 20260115_p02_artifact_versions.sql
-- P0-2: Trail/Narrative 资产版本化
-- 
-- 创建通用 artifact_versions 表，支持 Trail/Memo/Outcome/Snapshot/Diff 等多种资产类型的版本管理。
-- 在 trees 表上新增 latest_trail_artifact_id 列指向最新 Trail 版本。

-- 1. 创建 artifact_versions 表
CREATE TABLE IF NOT EXISTS artifact_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_type   text NOT NULL,  -- 'trail' | 'memo' | 'outcome' | 'path_snapshot' | 'branch_diff'
  tree_id         uuid NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  
  -- LLM generation metadata
  provider        text,
  model           text,
  prompt_version  text NOT NULL,  -- e.g. 'trail_v1_metacognitive_steps_json'
  
  -- Input context (for reproducibility)
  input           jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Example: { keyframe_ids: [...], step_count: N, truncation: { max_steps: 60 } }
  
  -- Generated content
  content_markdown text NOT NULL,
  
  -- Optional integrity check
  checksum        text,
  
  -- Validation metrics (for diagnostics)
  validation_metrics jsonb DEFAULT '{}'::jsonb,
  
  CONSTRAINT artifact_versions_type_check CHECK (
    artifact_type IN ('trail', 'memo', 'outcome', 'path_snapshot', 'branch_diff')
  )
);

-- 2. Create indexes for common queries
-- Primary query pattern: list versions by tree+type, ordered by time
CREATE INDEX IF NOT EXISTS idx_artifact_versions_tree_type_created 
  ON artifact_versions(tree_id, artifact_type, created_at DESC);

-- Secondary: query by prompt_version for analytics/debugging
CREATE INDEX IF NOT EXISTS idx_artifact_versions_prompt_version 
  ON artifact_versions(prompt_version);

-- 3. Add latest_trail_artifact_id to trees table
ALTER TABLE trees 
  ADD COLUMN IF NOT EXISTS latest_trail_artifact_id uuid 
    REFERENCES artifact_versions(id) ON DELETE SET NULL;

-- 4. Add comment for documentation
COMMENT ON TABLE artifact_versions IS 
  'P0-2: Versioned artifacts (Trail, Memo, Outcome, etc.) for reproducibility and history tracking';

COMMENT ON COLUMN artifact_versions.artifact_type IS 
  'Type of artifact: trail, memo, outcome, path_snapshot, branch_diff';

COMMENT ON COLUMN artifact_versions.input IS 
  'JSONB capturing input context (keyframe_ids, node_ids, scope, truncation params) for reproducibility';

COMMENT ON COLUMN artifact_versions.prompt_version IS 
  'Version identifier for the prompt template used (e.g., trail_v1_metacognitive_steps_json)';

COMMENT ON COLUMN artifact_versions.validation_metrics IS 
  'Validation results: { stepHeadersFound, jumpLinksFound, matchedNodeIds, hasKeyTakeaways }';

COMMENT ON COLUMN trees.latest_trail_artifact_id IS 
  'P0-2: Reference to the most recent Trail artifact version for this tree';
