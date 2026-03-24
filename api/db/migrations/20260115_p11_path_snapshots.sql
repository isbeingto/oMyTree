-- 20260115_p11_path_snapshots.sql
-- P1-1: PathSnapshot - 把黄金路径固化为可回放对象
--
-- PathSnapshot 使用 artifact_versions 表存储（artifact_type='path_snapshot'）。
-- 本 migration 添加 latest_path_snapshot_id 到 trees 表以便快速访问最新快照。

-- 1. 在 trees 表添加 latest_path_snapshot_id 列
ALTER TABLE trees 
  ADD COLUMN IF NOT EXISTS latest_path_snapshot_id uuid 
    REFERENCES artifact_versions(id) ON DELETE SET NULL;

-- 2. 添加索引优化 path_snapshot 查询
CREATE INDEX IF NOT EXISTS idx_artifact_versions_tree_path_snapshot 
  ON artifact_versions(tree_id, created_at DESC) 
  WHERE artifact_type = 'path_snapshot';

-- 3. 添加注释
COMMENT ON COLUMN trees.latest_path_snapshot_id IS 
  'P1-1: Reference to the most recent PathSnapshot artifact version for this tree';
