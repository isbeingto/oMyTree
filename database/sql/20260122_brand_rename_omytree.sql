-- =============================================================================
-- 品牌更名迁移脚本: LinZhi → oMyTree
-- 创建日期: 2026-01-22
-- 说明: 此脚本提供数据库用户和数据库重命名的参考，需要 DBA 权限执行
-- =============================================================================

-- 注意：以下命令需要以 postgres 超级用户执行

-- 步骤 1: 创建新的数据库用户 (如果尚未创建)
-- CREATE USER omytree WITH PASSWORD 'YOUR_PASSWORD_HERE';

-- 步骤 2: 选项 A - 重命名数据库 (需要断开所有连接)
-- ALTER DATABASE linzhi RENAME TO omytree;

-- 步骤 2: 选项 B - 如果无法重命名，可以创建符号链接或继续使用旧名
-- 保持数据库名为 linzhi，在应用层使用别名

-- 步骤 3: 授权新用户访问数据库
-- GRANT ALL PRIVILEGES ON DATABASE omytree TO omytree;
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO omytree;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO omytree;
-- GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO omytree;

-- 步骤 4: 可选 - 移除旧用户 (确保不再使用后)
-- DROP USER IF EXISTS linzhi;

-- =============================================================================
-- 简化方案: 保持数据库名，只更新连接配置
-- =============================================================================
-- 如果不希望重命名数据库，可以：
-- 1. 创建新用户 omytree
-- 2. 在 ecosystem.config.js 中只更新用户名，保持数据库名 linzhi
-- 3. 这样可以避免数据库重命名带来的停机风险

-- 快速创建新用户并授权：
-- CREATE USER omytree WITH PASSWORD 'YOUR_PASSWORD_HERE';
-- GRANT ALL PRIVILEGES ON DATABASE linzhi TO omytree;
-- \c linzhi
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO omytree;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO omytree;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO omytree;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO omytree;
