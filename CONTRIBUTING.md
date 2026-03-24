# Contributing to oMyTree

感谢你对 oMyTree 的关注！我们欢迎社区贡献。

## 开发环境设置

请参阅 [README.md](README.md#-快速开始) 中的快速开始部分。

### 前置要求

- Node.js 20+
- pnpm 9+
- PostgreSQL 14+
- Redis 6+

### 本地开发

```bash
# 克隆项目
git clone https://github.com/isbeingto/oMyTree.git
cd oMyTree

# 安装依赖
corepack enable
pnpm install --frozen-lockfile

# 复制配置模板并填写你的配置
cp ecosystem.config.example.js ecosystem.config.js
# 编辑 ecosystem.config.js 填入数据库密码、API Key 等

# 初始化数据库
PG_DSN="postgres://omytree:your_password@127.0.0.1:5432/omytree" node api/scripts/run_migrations.mjs

# 构建 Web
pnpm --filter omytree-web run gen:types
pnpm --filter omytree-web run build

# 启动服务
pm2 start ecosystem.config.js
```

或使用 Docker 一键启动：

```bash
sudo docker compose -f docker/compose.yaml up -d --build
```

## 提交规范

- 使用清晰的 commit message 描述变更
- 每个 PR 应聚焦于一个特定的改动
- 确保现有测试通过：`pnpm --filter omytree-api test`

## 代码风格

- API (Express)：ESM (`import`/`export`)，Node 20
- Web (Next.js)：App Router，React 19，TypeScript
- 遵循项目已有的代码风格和命名约定

## 报告 Bug

请在 [GitHub Issues](https://github.com/isbeingto/oMyTree/issues) 中创建 issue，包含：

1. Bug 描述
2. 复现步骤
3. 预期行为 vs 实际行为
4. 环境信息（OS、Node 版本等）

## 功能建议

欢迎在 Issues 中提出功能建议，请描述使用场景和预期效果。

## License

贡献的代码将遵循 [MIT License](LICENSE)。
