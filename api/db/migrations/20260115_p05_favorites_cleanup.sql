-- 20260115_p05_favorites_cleanup.sql
-- P0-5: 补齐 favorites 迁移并确保 ownership 一致性
-- 该表用于用户收藏对话中的关键 AI 回答（Star 标记）。

-- 1. 确保 pgcrypto 扩展存在（用于 gen_random_uuid）
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. 创建 favorites 表 (Idempotent)
CREATE TABLE IF NOT EXISTS favorites (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tree_id     uuid NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
    node_id     uuid NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    role        varchar(20) NOT NULL DEFAULT 'assistant' CHECK (role IN ('assistant', 'user', 'ai')),
    snippet     text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    
    -- 每个用户对每个节点只能有一条收藏记录
    CONSTRAINT favorites_user_node_unique UNIQUE (user_id, node_id)
);

-- 3. 创建索引优化查询
-- 用于首页或列表展示用户收藏的项目
CREATE INDEX IF NOT EXISTS idx_favorites_user_tree_created 
    ON favorites(user_id, tree_id, created_at DESC);

-- 用于树视图下高亮显示已收藏节点
CREATE INDEX IF NOT EXISTS idx_favorites_tree_node 
    ON favorites(tree_id, node_id);

-- 4. 添加注释
COMMENT ON TABLE favorites IS 'T28-2: User favorites/highlights for AI responses (starred nodes)';
COMMENT ON COLUMN favorites.role IS 'The role of the starred entity: assistant, user, or ai';
COMMENT ON COLUMN favorites.snippet IS 'Preview text or summary of the starred content';

-- 5. 兼容旧环境：如果 favorites 已存在且默认值仍为 uuid_generate_v4()，统一切换到 gen_random_uuid()
--    该操作不改动历史数据，只影响后续插入。
ALTER TABLE favorites
    ALTER COLUMN id SET DEFAULT gen_random_uuid();
