# oMyTree 🌿

**深度研究者的 AI 工作台** - 用「无限画布 + 树状结构」保存思考过程，并将阶段性成果沉淀为可复用的知识资产。

[![在线访问](https://img.shields.io/badge/Live-www.omytree.com-brightgreen)](https://www.omytree.com)
[![Node](https://img.shields.io/badge/Node-20%2B-green)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-blue)](https://www.postgresql.org/)

---

> **📢 开源发布 (2026-03)**
>
> oMyTree 现已开源！欢迎社区参与贡献，详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## 目录

- [🎯 项目愿景](#-项目愿景)
- [🧠 三层架构](#-三层架构)
- [✨ 核心特性](#-核心特性)
- [🏗️ 技术架构](#️-技术架构)
- [🚀 快速开始](#-快速开始)
  - [环境要求](#环境要求)
  - [从零开始搭建](#从零开始搭建)
  - [运行服务](#运行服务)
- [💻 开发指南](#-开发指南)
  - [开发工作流](#开发工作流)
  - [项目结构](#项目结构)
  - [常用命令](#常用命令)
- [⚙️ 配置说明](#️-配置说明)
  - [环境变量](#环境变量)
  - [数据库配置](#数据库配置)
- [🧪 测试与验证](#-测试与验证)
- [📚 文档导航](#-文档导航)
- [🆘 故障排除](#-故障排除)

---

## 🎯 项目愿景

随着 AI 使用频率提高，**获取信息越来越容易，但真正理解、记住并复用推理过程反而更难**。信息过载正在成为新的瓶颈。

oMyTree 关注的不是「生成更多内容」，而是「**保存思考过程**」：把多轮对话中的发散探索、关键批注与阶段性成果，沉淀为可回溯、可管理、可复用的**过程资产**。

我们相信：

- **树形结构是人类思维的自然形式** - 从大纲到知识图谱，树形结构贯穿人类知识管理的始终
- **AI 应该增强而非取代人类思考** - 通过智能问答和分支建议，帮助用户深入探索每一个想法
- **过程资产应该可追溯、可复用、可分享** - 不仅保存「结论」，更保存「如何一步步得到结论」

---

## 🧠 三层架构

oMyTree 的产品与代码实现可以用三层来理解：**空间层 → 策展层 → 资产层**。

### Layer 1：无限生长的空间层（Space / TreeCanvas）

**目标**：提供一块「无限画布」来承载发散探索——允许用户在任意节点分叉、试错、继续深入，并对 AI 回复做批注，完整保留“草稿纸”。

**代码入口（核心）**
- Web：`web/app/app/workspace/TreeWorkspace.tsx`（工作区主页面）、`web/app/app/workspace/TreeCanvas.tsx`（无限画布/树可视化）、`web/app/app/workspace/ChatPane.tsx`（对话与上下文微操）、`web/app/tree/qaClient.ts`（树数据拉取）
- API：`api/routes/tree_qa.js`（树数据聚合输出给前端）、`api/routes/turn.js` + `api/services/turn/create.js`（对话轮次/分叉继续）、`api/routes/node*.js`（节点操作）、`api/db/migrations/20251110_t1_1_schema.sql`（trees/nodes/turns 主表）

### Layer 2：主动意识的策展层（Curation / Keyframes + Outcomes）

**目标**：树会自然长得很“乱”，需要用户主动标记“我认为有价值的逻辑”。Layer2 通过两类机制把噪音收敛为可读的过程叙事：
- **批注/关键帧（Keyframes）**：用户对任意节点（尤其是 AI 回复）添加批注，形成可被引用的“关键证据点”
- **成果（Outcomes / 成果报告）**：用户在某个关键节点点击「新建成果」，系统自动回溯 root→anchor 主路径，结合关键帧批注，生成带 `sources` 的成果报告（强调过程可溯源）

**代码入口（核心）**
- Web：`web/components/outcome/OutcomeCapsule.tsx`（顶部“成果”胶囊/列表）、`web/components/outcome/OutcomeDetail.tsx`（成果详情/报告）、`web/components/outcome/InlineOutcomeCreate.tsx`（消息底部“新建成果”）、`web/app/app/workspace/ChatMessageBubble.tsx`（成果入口挂载）、`web/app/app/workspace/TreeCanvas.tsx`（成果路径高亮）
- API：`api/routes/keyframes.js`（批注存储）、`api/routes/tree_outcomes.js`（成果 v2 CRUD + 生成/再生成）、`api/lib/outcome/*`（报告生成器与可溯源约束）、`api/db/migrations/20260105_keyframe_tables.sql` + `api/db/migrations/20260119_t93_2_outcomes.sql`
- 设计文档：`docs/t93_layer2_outcomes.md`（Layer2 收敛与验收）

### Layer 3：高密度的资产层（Assets / Knowledge Base via WeKnora）

**目标**：把可复用的“经验”系统性整合为知识库，支持检索、管理、复用与团队协作。当前已完成 WeKnora 的引入与整合：用户可上传资料到知识库，并在提问时选择知识库/文件进行检索增强（RAG）。

**代码入口（核心）**
- Web：`web/app/app/workspace/KnowledgePanel.tsx`（知识库管理/上传/检索预览）、`web/components/composer/KnowledgeMentionPicker.tsx`（输入框 @ 选择知识库/文件）、`web/app/app/workspace/ChatPane.tsx`（提问时注入 knowledge 参数）
- API：`api/routes/knowledge/index.js`（WeKnora 反向代理：知识库/文档 CRUD + 上传 + 检索）、`api/services/knowledge/search_service.js`（混合检索与 citation 组装）、`api/routes/turn.js` + `api/services/turn/create.js`（将检索结果注入 LLM 提示词）、`api/db/migrations/20260130_p0_workspaces.sql`（workspace 与 weknora 租户/密钥）
- Service：`services/weknora/`（WeKnora 服务源码）、`docker/compose.yaml`（qdrant + weknora + docreader 依赖编排）

> Layer2→Layer3 衔接已就位：成果可一键同步到"成果资产库"（知识库面板置顶展示），用户在对话时**手动选择**该库即可召回相关成果。不做自动召回——保持用户控制权。

---

Layer2 ↔ Layer3 的衔接设计（成果入库/资产化）另见：`docs/L2_L3_INTEGRATION_MEMO.md`。

## ✨ 核心特性

| 特性 | 描述 |
|------|------|
| 🌲 **树状知识结构** | 以树形结构组织问答对，支持无限深度分支 |
| 🤖 **AI 智能问答** | 多模型支持（GPT-4、Gemini、DeepSeek 等），上下文感知对话 |
| 🔀 **智能分支** | AI 建议替代问题，一键分叉探索不同思路 |
| 🖍️ **批注 / 关键帧（Keyframes）** | 对任意节点添加批注，沉淀“我认为重要的证据/逻辑” |
| 🏁 **成果 / 成果报告（Outcomes）** | 以节点为锚点一键生成成果报告，强调过程可溯源（段落携带 sources） |
| 📚 **知识库（WeKnora）** | 上传资料到知识库，提问时选择知识库/文件做检索增强（RAG） |
| 📸 **时间快照** | 保存树的状态，随时回溯历史版本 |
| 🔗 **知识分享** | 生成分享链接，协作探索知识 |
| 📊 **可观测性** | Prometheus 指标、完整日志、性能追踪 |

---

## 🏗️ 技术架构

```
┌──────────────────────────────────────────────────────────────┐
│                        用户浏览器                              │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│   Web (Next.js 16 + React 19)          Port: 3000            │
│   ├── App Router                                              │
│   ├── 树状可视化 (TreeCanvas)                                 │
│   ├── NextAuth 认证                                           │
│   └── OpenAPI 类型生成                                        │
└──────────────────────────────────────────────────────────────┘
                              │ Next.js Rewrites
                              ▼
┌──────────────────────────────────────────────────────────────┐
│   API (Express 5 + Node.js 20)         Port: 8000            │
│   ├── 树引擎核心 (CRUD, 分支, 快照)                           │
│   ├── LLM 服务 (多模型, 流式响应)                             │
│   ├── Layer2 成果 (Keyframes + Outcomes)                      │
│   ├── Layer3 知识库 (WeKnora Proxy / RAG)                     │
│   ├── 事件总线 (实时同步)                                     │
│   └── 限流 & 配额管理                                         │
└──────────────────────────────────────────────────────────────┘
                    ┌───────────────┴────────────────┐
                    ▼                                ▼
┌──────────────────────────────────────────────────────────────┐
│   PostgreSQL (oMyTree)                 Port: 5432            │
│   ├── trees, nodes, turns (对话树/分叉)                      │
│   ├── keyframes, outcomes (策展/成果)                        │
│   └── users, sessions, workspaces... (认证/租户)             │
└──────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│   WeKnora (Knowledge Base)            Port: 8081             │
│   ├── Qdrant (向量检索)                                       │
│   └── docreader (文档解析/切分)                               │
└──────────────────────────────────────────────────────────────┘
```

**数据流**:
- 核心对话树：浏览器 → Web (Next.js) → API (Express) → PostgreSQL(oMyTree)
- 知识库：浏览器 → Web (Next.js) → API (Express) → WeKnora（→ Qdrant/docreader）

---

## 🚀 快速开始

### Docker（推荐，开箱即用）

完整指南见：
- [docs/DOCKER_QUICKSTART.md](docs/DOCKER_QUICKSTART.md)

一键启动（会拉起 Postgres / Redis / Qdrant / WeKnora / docreader / API / Web）：

```bash
sudo docker compose -f docker/compose.yaml up -d --build
```

首次启动（全新数据库）建议执行一次主业务迁移：

```bash
sudo docker compose -f docker/compose.yaml exec api node scripts/run_migrations.mjs
```

如果服务器未安装 compose 插件（`docker compose` 不可用），可改用纯 docker 脚本：

```bash
bash scripts/docker/up.sh
```

启动后访问：
- Web: http://localhost:3000
- API: http://localhost:8000
- WeKnora: http://localhost:8081/health

### 环境要求

| 依赖 | 版本 | 安装检查 |
|------|------|----------|
| Node.js | 20+ | `node --version` |
| pnpm | 9+ | `pnpm --version` |
| PostgreSQL | 14+ | `psql --version` |
| PM2 | 最新 | `pm2 --version` |
| Redis | 6+ | `redis-cli ping` |

### 从零开始搭建

#### 1. 克隆项目

```bash
git clone https://github.com/isbeingto/oMyTree.git /srv/oMyTree
cd /srv/oMyTree
```

#### 2. 安装依赖

```bash
# 启用 pnpm
corepack enable

# 安装所有依赖
pnpm install --frozen-lockfile
```

#### 3. 配置数据库

```bash
# 以 postgres 用户登录
sudo -u postgres psql

# 创建数据库和用户
CREATE DATABASE omytree;
CREATE USER omytree WITH PASSWORD 'your_password_here';
GRANT ALL PRIVILEGES ON DATABASE omytree TO omytree;

# 连接到数据库
\c omytree

# 授权 schema
GRANT ALL PRIVILEGES ON SCHEMA public TO omytree;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO omytree;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO omytree;

# 退出
\q
```

```bash
# 初始化 oMyTree 主业务表（trees/nodes/turns/keyframes/outcomes/...）
PG_DSN="postgres://omytree:your_password_here@127.0.0.1:5432/omytree?sslmode=disable" node api/scripts/run_migrations.mjs

# （可选）初始化 legacy tree-engine 表（tree_nodes/tree_edges/...，用于少量历史/开发端点）
PGPASSWORD='your_password_here' psql -U omytree -h 127.0.0.1 -d omytree -f database/sql/init_pg.sql
```

> 如需执行数据库层的重命名/授权步骤，请参考 [database/sql/20260122_brand_rename_omytree.sql](database/sql/20260122_brand_rename_omytree.sql)。

#### 4. 配置环境变量

```bash
cp ecosystem.config.example.js ecosystem.config.js
```

编辑 `ecosystem.config.js`，将所有 `CHANGE_ME_*` 占位符替换为你的实际配置：

```javascript
// PostgreSQL 连接
PG_DSN: "postgres://omytree:your_password_here@127.0.0.1:5432/omytree?sslmode=disable",
PGPASSWORD: "your_password_here",

// LLM API Key
OPENAI_API_KEY: "sk-xxx",

// 站点 URL (开发环境可用 localhost)
NEXTAUTH_URL: "http://localhost:3000",
APP_PUBLIC_URL: "http://localhost:3000",
```

#### 5. 生成类型 & 构建

```bash
# 生成 OpenAPI TypeScript 类型
pnpm --filter omytree-web run gen:types

# 构建 Web 应用
pnpm --filter omytree-web run build
```

### 运行服务

```bash
# 启动所有服务 (API + Web)
pm2 start ecosystem.config.js

# 查看状态
pm2 list

# 查看日志
pm2 logs omytree-web --lines 30
pm2 logs omytree-api --lines 30
```

**访问应用**: 
- 本地: http://localhost:3000
- 生产: https://www.omytree.com

---

## 💻 开发指南

### 开发工作流

⚠️ **重要**: 本项目使用 **PM2 生产模式** 开发，**不支持** `npm run dev`

```bash
# 🔄 Web 代码修改后 (必须执行)
pnpm --filter omytree-web run build && pm2 reload omytree-web

# 🔄 API 代码修改后
pm2 reload omytree-api

# 🔄 OpenAPI 规范修改后
pnpm --filter omytree-web run gen:types
pnpm --filter omytree-web run build && pm2 reload omytree-web

# 📜 一键便捷脚本
bash scripts/deploy/hot-reload.sh web   # Web 更新
bash scripts/deploy/hot-reload.sh api   # API 更新
bash scripts/deploy/hot-reload.sh all   # 全部更新
```

**零停机热更新**: PM2 集群模式运行 2 个实例，`reload` 命令会先启动新实例，就绪后才关闭旧实例，用户无感知。

### 项目结构

```
/srv/oMyTree/
├── api/                          # 🔧 后端 API 服务
│   ├── index.js                 # 入口文件
│   ├── routes/                  # API 路由 (Factory Pattern)
│   ├── services/                # 业务逻辑
│   │   ├── tree/               # 树引擎核心
│   │   ├── llm/                # LLM 服务
│   │   └── turn/               # 对话轮次
│   ├── lib/                     # 工具库
│   │   ├── errors.js           # 统一错误处理
│   │   ├── auth_user.js        # 用户认证
│   │   └── metrics_*.js        # 指标格式化
│   ├── db/                      # 数据库迁移
│   └── tests/                   # 测试文件
│
├── web/                          # 🌐 前端应用
│   ├── app/                     # Next.js App Router
│   │   ├── app/                # 主应用页面
│   │   ├── auth/               # 认证页面
│   │   └── api/                # Next.js API Routes
│   ├── components/              # React 组件
│   ├── lib/                     # 工具和类型
│   │   ├── auth.ts             # NextAuth 配置
│   │   └── types/              # TypeScript 类型
│   ├── openapi/                 # API 契约
│   │   └── openapi.yaml        # OpenAPI 规范 (单一真相源)
│   └── config/                  # 配置
│       └── features.json       # Feature Flags
│
├── database/                     # 💾 数据库
│   └── sql/                     # Schema 和迁移脚本
│
├── scripts/                      # 🔧 运维和工具脚本
│   ├── deploy/                  # 部署脚本 (热更新、集群)
│   ├── docker/                  # Docker 编排
│   ├── dev/                     # 开发工具
│   ├── maintenance/             # 维护脚本 (日志轮转、数据清理)
│   └── diagnostics/             # 诊断工具
│
├── docs/                         # 📚 项目文档
│   ├── adr/                     # 架构决策记录
│   ├── specs/                   # 技术规范
│   ├── runbooks/                # 运维手册
│   └── ios-app/                 # iOS 客户端文档
│
├── infra/                        # 🏗️ 基础设施
│   └── backup/                  # 数据库备份 (git-ignored)
│
├── services/                     # 🔌 微服务
│   └── weknora/                 # 知识库引擎 (Go + Python)
│       ├── scripts/             # 服务特有脚本 (构建、迁移、开发)
│       └── docreader/           # PDF/文档解析服务
│
├── tests/                        # 🧪 端到端测试
│   └── e2e/                     # Playwright E2E 测试
│
├── ecosystem.config.example.js    # ⚙️ PM2 配置模板 (复制后填入你的密钥)
└── README.md                     # 📖 本文件
```

### 常用命令

```bash
# === PM2 管理 ===
pm2 list                              # 查看所有进程状态
pm2 logs omytree-web --lines 50       # Web 日志
pm2 logs omytree-api --lines 50       # API 日志
pm2 reload omytree-web                # 零停机重载 Web
pm2 reload omytree-api                # 零停机重载 API
pm2 restart all                       # 重启所有服务

# === 开发构建 ===
pnpm --filter omytree-web run build   # 构建 Web
pnpm --filter omytree-web run gen:types # 生成 OpenAPI 类型
pnpm --filter omytree-web exec tsc --noEmit  # TypeScript 检查

# === 测试 ===
cd api && pnpm test                   # 运行 API 测试
pnpm test:e2e                         # 端到端测试 (Playwright)

# === 数据库 ===
PGPASSWORD='xxx' psql -U omytree -h 127.0.0.1 -d omytree
```

---

## ⚙️ 配置说明

### 环境变量

复制 `ecosystem.config.example.js` 为 `ecosystem.config.js` 并填写你的配置。

| 变量 | 必需 | 说明 | 示例 |
|------|------|------|------|
| `PG_DSN` | ✅ | PostgreSQL 连接串 | `postgres://omytree:xxx@127.0.0.1:5432/omytree` |
| `PGUSER` | ✅ | 数据库用户 | `omytree` |
| `PGPASSWORD` | ✅ | 数据库密码 | - |
| `PGDATABASE` | ✅ | 数据库名 | `omytree` |
| `OPENAI_API_KEY` | ⭕ | OpenAI API Key | `sk-xxx` |
| `NEXTAUTH_URL` | ✅ | NextAuth 回调 URL | `https://www.omytree.com` |
| `NEXTAUTH_SECRET` | ✅ | NextAuth 加密密钥 | 32+ 字符随机串 |
| `API_PROXY_TARGET` | ✅ | API 代理地址 | `http://127.0.0.1:8000` |
| `ACCEPT_DEV_ENDPOINTS` | ⭕ | 启用开发端点 | `1` (仅开发环境) |

### 数据库配置

```sql
-- 推荐的 PostgreSQL 配置
ALTER SYSTEM SET max_connections = 100;
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '768MB';
```

**数据库迁移**: 新迁移脚本放在 `database/sql/` 目录下，以日期开头命名 (如 `20260122_xxx.sql`)。

---

## 🧪 测试与验证

```bash
# API 单元测试 (Vitest)
pnpm --filter omytree-api test

# Web 单元测试 (Vitest)
pnpm --filter omytree-web test

# 端到端测试 (Playwright)
pnpm test:e2e
```

**开发端点** (需 `ACCEPT_DEV_ENDPOINTS=1`):

| 端点 | 用途 |
|------|------|
| `POST /api/tree/reset` | 清空演示数据 |
| `POST /api/tree/seed` | 加载演示数据 |
| `GET /readyz` | 就绪探针 |
| `GET /metrics` | Prometheus 指标 |

更多脚本说明: [scripts/README.md](scripts/README.md)

---

## 📚 文档导航

| 需求 | 文档 |
|------|------|
| **快速入门** | [本文件](#-快速开始) |
| **Docker 一键启动** | [docs/DOCKER_QUICKSTART.md](docs/DOCKER_QUICKSTART.md) |
| **Layer2↔Layer3 衔接** | [docs/L2_L3_INTEGRATION_MEMO.md](docs/L2_L3_INTEGRATION_MEMO.md) |
| **架构决策记录** | [docs/adr/](docs/adr/) |
| **运维手册** | [docs/runbooks/](docs/runbooks/) |
| **API 契约** | [web/openapi/openapi.yaml](web/openapi/openapi.yaml) |
| **贡献指南** | [CONTRIBUTING.md](CONTRIBUTING.md) |

---

## 🆘 故障排除

| 问题 | 解决方案 |
|------|----------|
| **Web 修改后没生效** | 必须运行 `pnpm --filter omytree-web run build` 后再 `pm2 reload` |
| **TypeScript 类型错误** | 运行 `pnpm --filter omytree-web run gen:types` |
| **端口被占用** | `ss -tlnp \| grep 3000` 或 `lsof -i :3000` 检查占用 |
| **数据库连接失败** | 检查 `ecosystem.config.js` 中的 `PG_DSN` 配置 |
| **PM2 进程找不到** | 运行 `pm2 start ecosystem.config.js` |
| **权限错误** | `rm -rf web/.next && pnpm --filter omytree-web run build` |
| **Redis 连接失败** | 检查 Redis 服务: `redis-cli ping` |

**查看详细日志**:
```bash
pm2 logs omytree-api --err --lines 100   # API 错误日志
pm2 logs omytree-web --err --lines 100   # Web 错误日志
```

---

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE)

---

<div align="center">

**Made with 💚 by oMyTree Team**

[在线体验](https://www.omytree.com) · [问题反馈](https://github.com/isbeingto/oMyTree/issues) · [文档](docs/)

</div>
