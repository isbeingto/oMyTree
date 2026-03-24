# oMyTree

[English](README.en.md) | 简体中文

[![Live](https://img.shields.io/badge/Live-www.omytree.com-1f7a5a)](https://www.omytree.com)
[![Node](https://img.shields.io/badge/Node-20%2B-3c873a)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-336791)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-MIT-black)](LICENSE)

oMyTree 是一个面向深度研究与复杂思考场景的 AI 工作台。它把“对话结果”进一步推进为“过程资产”：用户可以在无限画布上持续分叉、批注、归纳、生成成果，并把可复用经验沉淀进知识库。

与传统聊天产品不同，oMyTree 关注的不只是最终答案，而是如何把探索过程、证据链和阶段性结论保留下来，形成可追溯、可复用、可协作的知识结构。

> 品牌说明：项目已于 2026-01-22 从 LinZhi 更名为 oMyTree。历史文档中可能仍会看到旧名称。

## Overview

- 无限画布 + 树状结构：允许围绕任意节点继续分叉，而不是被线性对话限制。
- 过程策展：通过批注、关键帧与成果报告，把“思考过程”而不只是“最终结论”沉淀下来。
- 知识库联动：把成果进一步资产化，并在后续对话中按用户显式选择进行检索增强。
- 多模型工作流：支持 GPT、Gemini、DeepSeek、BYOK / Ollama 等多种模型接入。

## Why oMyTree

AI 让“获得答案”越来越容易，但对于研究、写作、分析、产品设计、知识管理等复杂任务，真正稀缺的是：

- 哪些分支已经探索过
- 哪些证据真正重要
- 某个阶段性结论是如何推导出来的
- 哪些经验值得进入长期知识库复用

oMyTree 的目标，是把这些原本容易丢失的中间过程变成结构化资产。

## Core Highlights

### 1. Space → Curation → Assets 三层结构

项目围绕三个连续层次构建：

- Space：无限画布与树状问答，承载发散探索。
- Curation：通过 Keyframes 与 Outcomes 主动收敛，形成可阅读、可引用的过程叙事。
- Assets：将高价值成果沉淀为知识库资产，进入后续检索与复用链路。

这不是简单的“聊天 + RAG”拼接，而是一套从探索、整理到资产化的连续工作流。

### 2. 可追溯成果，而不是纯生成摘要

成果报告不是独立生成的一段文本。系统会以锚点节点为中心，回溯 root 到 anchor 的主路径，并结合关键帧批注生成带来源依据的结果，使结论能够回看、审查和复用。

### 3. 用户控制的知识召回

知识库能力已接入腾讯开源的 WeKnora 项目，并在 oMyTree 中作为独立知识层与对话层整合。当前设计明确坚持“手动选择知识库/文件再召回”的策略，避免隐式自动召回带来的上下文污染，保留用户对检索范围的控制权。

### 4. 前端数据层清晰可维护

前端不是零散地在组件里直接 fetch，而是采用统一的数据访问约定：

- TanStack Query 负责查询缓存、失效与异步状态管理。
- 统一 Client 封装在 `web/lib/app-api-client.ts`，集中处理路径规范化、JSON/FormData 请求体、错误建模和鉴权凭据。
- 业务 API 再按领域拆成模块化 Hooks，例如树、设置、模型配置、指标、分享等，降低页面组件复杂度。

这种组织方式更适合持续演进的产品，而不是一次性 Demo。

### 5. 生产式开发工作流

这个仓库默认以 PM2 生产模式运行，而不是依赖 `next dev` / `nodemon` 进行日常开发。Web 与 API 都围绕真实部署形态组织，支持零停机 reload，更贴近长期运行环境。

### 6. 可观测性与运维意识较完整

项目内置了较完整的指标、日志和诊断能力，包括 Prometheus 指标、统一 metrics 路由、追踪中间件、热重载脚本与 Docker 一键编排，不是只关注功能实现而忽视运行质量。

## Product Capabilities

| Capability | Description |
| --- | --- |
| Tree-based exploration | 围绕任意节点持续分叉，保留完整探索路径 |
| AI-assisted branching | 支持多模型问答与分支式继续追问 |
| Keyframes / annotations | 对关键节点做批注，沉淀证据与判断 |
| Outcome reports | 生成带来源路径的阶段性成果报告 |
| Knowledge-base integration | 通过 WeKnora + Qdrant + docreader 支持知识库上传、检索与 RAG |
| Snapshots and sharing | 支持时间快照、分享与协作浏览 |
| Multi-model support | 支持平台模型、BYOK 与 Ollama |
| Observability | 内置 tracing、metrics、日志与运维脚本 |

## Architecture

```text
Browser
  -> Web (Next.js 16 + React 19)
  -> API (Express 5 + Node.js 20)
  -> PostgreSQL / Redis
  -> Knowledge services (WeKnora + Qdrant + docreader)
```

### Frontend

- Next.js 16 App Router
- React 19
- TanStack Query 作为统一数据请求缓存层
- 统一 API client + 模块化 hooks
- OpenAPI 类型生成，减少前后端契约漂移

### Backend

- Express 5 + Node.js 20，ESM-only
- 路由工厂模式，集中在 `api/index.js` 装配
- PostgreSQL 连接池复用，避免 ad-hoc client
- Redis 用于限流与配额等实时控制链路

### Knowledge Layer

- 知识库后端基于腾讯开源 WeKnora
- Qdrant 负责向量检索
- docreader 负责文档解析、切分与预处理
- oMyTree API 在此之上提供工作区、租户、检索注入与引用组装

## Quick Start

### Option A: Docker

完整说明见 [docs/DOCKER_QUICKSTART.md](docs/DOCKER_QUICKSTART.md)。

```bash
sudo docker compose -f docker/compose.yaml up -d --build
sudo docker compose -f docker/compose.yaml exec api node scripts/run_migrations.mjs
```

服务默认地址：

- Web: http://localhost:3000
- API: http://localhost:8000
- WeKnora health: http://localhost:8081/health

### Option B: Manual Setup

#### 1. Clone

```bash
git clone https://github.com/isbeingto/oMyTree.git /srv/oMyTree
cd /srv/oMyTree
```

#### 2. Install dependencies

```bash
corepack enable
pnpm install --frozen-lockfile
```

#### 3. Prepare PostgreSQL

```sql
CREATE DATABASE omytree;
CREATE USER omytree WITH PASSWORD 'your_password_here';
GRANT ALL PRIVILEGES ON DATABASE omytree TO omytree;
```

执行主业务迁移：

```bash
PG_DSN="postgres://omytree:your_password_here@127.0.0.1:5432/omytree?sslmode=disable" node api/scripts/run_migrations.mjs
```

如需 legacy tree-engine 表：

```bash
PGPASSWORD='your_password_here' psql -U omytree -h 127.0.0.1 -d omytree -f database/sql/init_pg.sql
```

#### 4. Configure services

```bash
cp ecosystem.config.example.js ecosystem.config.js
```

然后根据实际环境填写数据库、认证、模型、支付、邮件与 WeKnora 相关配置。

#### 5. Generate types and build web

```bash
pnpm --filter omytree-web run gen:types
pnpm --filter omytree-web run build
```

#### 6. Start with PM2

```bash
pm2 start ecosystem.config.js
pm2 list
```

## Development Workflow

本仓库的日常工作流以 PM2 生产模式为主。

```bash
pnpm --filter omytree-web run build && pm2 reload omytree-web
pm2 reload omytree-api
pnpm --filter omytree-web run gen:types
```

便捷脚本：

```bash
bash scripts/deploy/hot-reload.sh web
bash scripts/deploy/hot-reload.sh api
bash scripts/deploy/hot-reload.sh all
```

## Project Structure

```text
api/                 Express API, route factories, services, migrations, tests
web/                 Next.js app, UI components, API client, hooks, OpenAPI types
services/weknora/    Embedded WeKnora service source
database/sql/        SQL bootstrap and migration scripts
docker/              Docker images and compose stack
scripts/             Deployment, maintenance and diagnostics scripts
docs/                Navigation, specs, integration memos and operational docs
```

## Testing

```bash
pnpm --filter omytree-api test
pnpm --filter omytree-web test
pnpm test:e2e
```

## Documentation

- Docker 快速开始：[docs/DOCKER_QUICKSTART.md](docs/DOCKER_QUICKSTART.md)
- Layer2 / Layer3 衔接说明：[docs/L2_L3_INTEGRATION_MEMO.md](docs/L2_L3_INTEGRATION_MEMO.md)
- Layer2 成果机制：[docs/t93_layer2_outcomes.md](docs/t93_layer2_outcomes.md)
- 产品定位与功能概览：[docs/PRODUCT_POSITIONING_AND_FEATURES_2026-02-21.md](docs/PRODUCT_POSITIONING_AND_FEATURES_2026-02-21.md)
- Copilot 协作约定：[.github/copilot-instructions.md](.github/copilot-instructions.md)
- API 契约：[web/openapi/openapi.yaml](web/openapi/openapi.yaml)
- 运维脚本说明：[scripts/README.md](scripts/README.md)

## Open Source Notes

- `ecosystem.config.js` 不纳入版本控制；请从 `ecosystem.config.example.js` 复制生成。
- 数据库备份、私有密钥和本地环境配置均不应提交。
- 如果你计划进行二次部署，建议优先检查鉴权、支付、邮件、对象存储和知识库相关配置。

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Web 代码修改后未生效 | 先执行 `pnpm --filter omytree-web run build`，再 `pm2 reload omytree-web` |
| OpenAPI 类型过期 | 执行 `pnpm --filter omytree-web run gen:types` |
| PM2 进程不存在 | 执行 `pm2 start ecosystem.config.js` |
| 数据库连接失败 | 检查 `PG_DSN`、`PGUSER`、`PGPASSWORD` 和数据库授权 |
| Redis 连接失败 | 检查 Redis 是否启动并确认连接地址 |

## License

MIT. See [LICENSE](LICENSE).