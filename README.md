<div align="center">

# 🌳 oMyTree

**面向深度研究与复杂思考的 AI 工作台**

[English](README.en.md) | 简体中文

<!-- Badges -->
<p>
  <a href="https://www.omytree.com"><img src="https://img.shields.io/badge/Live-www.omytree.com-1f7a5a?style=flat-square&logo=vercel" alt="Live Demo" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node-20%2B-3c873a?style=flat-square&logo=nodedotjs" alt="Node" /></a>
  <a href="https://www.postgresql.org/"><img src="https://img.shields.io/badge/PostgreSQL-14%2B-336791?style=flat-square&logo=postgresql" alt="PostgreSQL" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-black?style=flat-square" alt="License" /></a>
</p>

oMyTree 把“对话结果”进一步推进为“过程资产”：在无限画布上持续分叉、批注、归纳、生成成果，并把可复用经验沉淀进知识库。

</div>

---

## 🌟 Overview

与传统聊天产品不同，oMyTree 关注的**不仅仅是最终答案**，而是如何把**探索过程、证据链和阶段性结论**保留下来，形成可追溯、可复用、可协作的知识结构。

- 🌲 **无限画布 + 树状结构**：允许围绕任意节点继续分叉，告别线性对话的束缚。
- 📌 **过程策展 (Curation)**：通过批注、关键帧与成果报告，沉淀“思考过程”。
- 🧠 **知识库联动 (Assets)**：将成果资产化，并在后续对话中进行显式的检索增强 (RAG)。
- 🤖 **多模型工作流**：支持 GPT、Gemini、DeepSeek、BYOK / Ollama 等多种模型接入。

> **💡 品牌说明：** 项目已于 2026-01-22 从 LinZhi 更名为 oMyTree。历史文档中可能仍会看到旧名称。

## 🎯 Why oMyTree?

AI 让“获得答案”变得极其容易，但在**研究、写作、分析、产品设计、知识管理**等复杂任务中，真正稀缺的是：

1. 哪些分支已经探索过？
2. 哪些证据真正且关键？
3. 某个阶段性结论是如何推导出来的？
4. 哪些经验值得进入长期知识库进行复用？

oMyTree 的核心目标，就是把这些原本极易丢失的**“中间过程”**，转化为**“结构化资产”**。

## 💡 Core Highlights

### 1. 结构哲学：Space → Curation → Assets
项目围绕三个连续层次构建，这不是简单的“聊天 + RAG”拼接，而是一套从**探索、整理到资产化**的完整连续工作流：
- **Space（空间）**：无限画布与树状问答，承载发散探索。
- **Curation（策展）**：通过 Keyframes 与 Outcomes 主动收敛，形成可阅读、可引用的过程叙事。
- **Assets（资产）**：将高价值成果沉淀为知识库资产，进入后续检索与复用链路。

### 2. 可追溯成果，拒绝黑盒总结
成果报告不是独立生成的一段孤立文本。系统会以“锚点节点”为中心，回溯 Root 到 Anchor 的主路径，并结合“关键帧批注”生成带**来源依据**的结果，使所有结论皆可回看、审查和反思。

### 3. 用户主控的知识召回
知识库能力基于腾讯开源 [WeKnora](https://github.com/Tencent/WeKnora) 项目，并在 oMyTree 中作为独立知识层与对话层整合。当前设计坚持**“手动选择知识库/文件再召回”**策略，避免隐式自动召回带来的上下文污染，将检索控制权完整交还给用户。

### 4. 健壮的前端数据层架构
前端告别组件直接 `fetch`，采用严谨的数据访问约定：
- **TanStack Query**：统管查询缓存、失效与异步状态。
- **统一 Client 包**：深度封装 `web/lib/app-api-client.ts` 集中处理路径规范化、拦截、错误建模和凭据。
- **领域 Modular Hooks**：按业务领域（树、设置、模型配置、指标等）拆分 API，极大降低页面组件复杂度。

### 5. 生产级开发与诊断体验
这不只是一个一次性的 Demo。我们采用真实的部署形态进行开发流，默认利用 **PM2** 进行带有热重载 (Reload) 的生产模式运行；内置 Prometheus 指标、统一 Tracing 与多维度日志监控。

---

## 🛠 Product Capabilities

| 功能特性 | 核心描述 |
| :--- | :--- |
| **🌲 Tree-based Exploration** | 围绕任意节点持续分叉，保留完整的非线性探索路径。 |
| **🤖 AI-assisted Branching** | 支持多大模型问答与分支式连续追问。 |
| **📌 Keyframes & Annotations** | 对关键节点做即时批注，沉淀证据与专家判断。 |
| **📑 Outcome Reports** | 自动化生成自带出处与来源路径的阶段性成果报告。 |
| **📚 Knowledge-base Integration** | 基于 WeKnora / Qdrant 支持文档上传解析、检索增强与 RAG。 |
| **🔗 Snapshots & Sharing** | 提供历史时间快照、支持只读分享与协作浏览。 |
| **🎛 Multi-model Engine** | 平台模型无缝切换，兼容自带密钥 (BYOK) 与开源本地部署 (Ollama)。 |

---

## 🏗 Architecture

项目的核心交互与服务边界：

```mermaid
graph TD;
  A[Browser Client] --> B(Web: Next.js 16 + React 19)
  B --> C{API: Express 5 + Node 20}
  C --> D[(PostgreSQL / Redis)]
  C --> E[Knowledge Services]
  E --> F[WeKnora]
  E --> G[Qdrant]
  E --> H[docreader]
```

### Tech Stack
- **Web 前端**: `Next.js 16 (App Router)` · `React 19` · `TanStack Query` · `OpenAPI Types`
- **API 后端**: `Express 5 (ESM 纯净态)` · `Node.js 20` · `pg pool` · `Redis` (限流)
- **底层引擎**: 腾讯 `WeKnora` · `Qdrant` · `docreader`

---

## 🚀 Quick Start

### 方案 A: Docker (推荐体验)
无需配置环境，开箱即用。完整指引请见 [docs/DOCKER_QUICKSTART.md](docs/DOCKER_QUICKSTART.md)

```bash
# 1. 启动容器编排
sudo docker compose -f docker/compose.yaml up -d --build

# 2. 初始化数据库表结构
sudo docker compose -f docker/compose.yaml exec api node scripts/run_migrations.mjs
```
> **访问入口：**
> Web: http://localhost:3000 | API: http://localhost:8000 | WeKnora Health: http://localhost:8081/health

### 方案 B: 手动部署与开发模式

<details>
<summary><b>点击展开详细步骤 ⬇️</b></summary>

**1. 克隆代码与依赖安装**
```bash
git clone https://github.com/isbeingto/oMyTree.git /srv/oMyTree
cd /srv/oMyTree
corepack enable
pnpm install --frozen-lockfile
```

**2. 数据库准备 (Postgres)**
```sql
CREATE DATABASE omytree;
CREATE USER omytree WITH PASSWORD 'your_password_here';
GRANT ALL PRIVILEGES ON DATABASE omytree TO omytree;
```
随后执行内置迁移脚本：
```bash
PG_DSN="postgres://omytree:your_password_here@127.0.0.1:5432/omytree?sslmode=disable" node api/scripts/run_migrations.mjs
```

**3. 环境项配置**
```bash
cp ecosystem.config.example.js ecosystem.config.js
# 编辑并填入真实的数据库名、各模型 API Key、存储配置等。
```

**4. 编译与运行 (PM2)**
```bash
# 生成共享类型与前端构建
pnpm --filter omytree-web run gen:types
pnpm --filter omytree-web run build

# PM2 后台常驻启动
pm2 start ecosystem.config.js
pm2 list
```

**日常开发 Reload 流：**
```bash
pnpm --filter omytree-web run build && pm2 reload omytree-web
pm2 reload omytree-api
```

**5. Nginx 反向代理**

> ⚠️ **关键：** 如果不正确配置 Nginx，LLM 流式对话将会卡死、文件上传会失败。以下配置中的超时与缓冲设置对项目正常运行至关重要。

安装 Nginx 并创建站点配置：
```bash
sudo apt install nginx
sudo nano /etc/nginx/conf.d/omytree.conf
```

参考配置模板（将 `YOUR_DOMAIN` 替换为你的域名）：
```nginx
upstream nextjs {
    server 127.0.0.1:3000;
    keepalive 64;
}

upstream api {
    server 127.0.0.1:8000;
    keepalive 64;
}

# HTTP → HTTPS 重定向
server {
    listen 80;
    server_name YOUR_DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://YOUR_DOMAIN$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name YOUR_DOMAIN;

    ssl_certificate     /etc/letsencrypt/live/YOUR_DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/YOUR_DOMAIN/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;

    # 安全头
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    # 文件上传限制（知识库上传需要）
    client_max_body_size 50M;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/xml;

    # ========== 核心：所有请求先到 Next.js ==========
    # Next.js 通过 rewrites 将 API 请求转发到后端，Nginx 无需分流
    location / {
        proxy_pass http://nextjs;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # ⚠️ LLM 流式对话需要：关闭缓冲 + 延长超时
        proxy_buffering off;
        proxy_connect_timeout 120s;
        proxy_send_timeout    120s;
        proxy_read_timeout    120s;
    }

    # Next.js 静态资源长缓存
    location /_next/static {
        proxy_pass http://nextjs;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # 健康检查（直达 API 后端）
    location /readyz  { proxy_pass http://api; access_log off; }
    location /metrics { proxy_pass http://api; access_log off; }
}
```

申请 SSL 证书并启用：
```bash
# 安装 certbot
sudo apt install certbot python3-certbot-nginx

# 申请证书（自动配置 Nginx）
sudo certbot --nginx -d YOUR_DOMAIN

# 验证并重载
sudo nginx -t && sudo systemctl reload nginx
```

> 💡 **架构说明：** 浏览器 → Nginx → Next.js (`:3000`) → rewrites → API (`:8000`)。
> Nginx 只需要认识 Next.js 即可，API 路由分发由 Next.js `rewrites` 和 Route Handlers 完成。

</details>

<br/>

<div align="center">
Made with ✨ for Deep Thinkers
</div>
