<div align="center">

# 🌳 oMyTree

**An AI Workspace for Deep Research and Structured Thinking**

English | [简体中文](README.md)

<!-- Badges -->
<p>
  <a href="https://www.omytree.com"><img src="https://img.shields.io/badge/Live-www.omytree.com-1f7a5a?style=flat-square&logo=vercel" alt="Live Demo" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node-20%2B-3c873a?style=flat-square&logo=nodedotjs" alt="Node" /></a>
  <a href="https://www.postgresql.org/"><img src="https://img.shields.io/badge/PostgreSQL-14%2B-336791?style=flat-square&logo=postgresql" alt="PostgreSQL" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-black?style=flat-square" alt="License" /></a>
</p>

oMyTree turns chat sessions into structural process assets. Branch endlessly on a canvas, annotate key reasoning steps, generate outcome reports, and promote reusable knowledge to a centralized long-term memory layer.

</div>

---

## 🌟 Overview

Instead of treating AI conversations as disposable transcripts, oMyTree is built around preserving **how an idea evolved**, **what evidence mattered**, and **which intermediate results should remain reusable**.

- 🌲 **Infinite Canvas + Tree Structure**: Branch from any node anytime for non-linear exploration.
- 📌 **Curation Layer**: Annotations, keyframes, and outcome reports make sense of chaotic exploration.
- 🧠 **Knowledge-base Integration**: Convert insight to assets, and explicitly enable Retrieval-Augmented Generation (RAG).
- 🤖 **Multi-model Environment**: Full compatibility with GPT, Gemini, DeepSeek, BYOK, and local Ollama-style setups.

> **💡 Branding Note:** The project was renamed from LinZhi to oMyTree on January 22, 2026. Some historical docs may still reference the old name.

## 🎯 Why oMyTree?

AI makes getting "an answer" effortless. But for serious research, writing, planning, and analysis, the hardest problems are structural constraints:

1. Which narrative branches have already been explored?
2. Which evidence actually holds value?
3. How did a specific conclusion emerge from prior reasoning steps?
4. Which parts deserve promotion into a reusable knowledge hub?

oMyTree is intricately designed to **capture that middle layer** instead of losing it within endless chat scrollbacks.

## 💡 Core Highlights

### 1. The Design Philosophy: Space → Curation → Assets
The product and codebase structurally follow three consecutive layers—this isn't just "Chat + RAG", but a complete knowledge pipeline:
- **Space**: The infinite canvas carrying your divergent brainstorming and branching.
- **Curation**: Keyframes and outcomes to actively formulate readable, referencable narratives.
- **Assets**: Promoting high-value milestones into a persistent knowledge backend for future reuse.

### 2. Traceable Outcomes, No Black-Box Summaries
Outcome reports aren't detached hallucinated text. They are generated directly from a selected anchor node mapped backwardly to the root pathway—fully incorporating curated annotations. Outputs stay grounded in visible history.

### 3. User-Controlled Retrieval
Our knowledge backend rides on Tencent's open-source [WeKnora](https://github.com/Tencent/WeKnora). We strictly bypass "silent automated recall." Retrieval remains user-controlled to prevent subtle context contamination—you dictate exactly which knowledge base or files hit the current node branch context.

### 4. Robust Frontend Data Architecture
We avoid ad-hoc component `fetches`, applying strict, scalable data abstraction layers instead:
- **TanStack Query** manages async state, caching, caching invalidation, and data hydration.
- **Unified Client Interface** locally encapsulated within `web/lib/app-api-client.ts`, centralizing paths, errors, and authentication.
- **Modular Hooks** separate specific business domains (trees, settings, indicators) dropping UI complexity significantly.

### 5. Production-Shaped Developer Flow
We ditch local-only dev servers (`nodemon` / `next dev`) in favor of deploying via PM2. Web and API services reload hot into shapes identical to actual deployment contexts, offering complete Prometheus metrics, tracing middlewares, and docker orchestration features for free.

---

## 🛠 Product Capabilities

| Feature | Description |
| :--- | :--- |
| **🌲 Tree-based Exploration** | Branch directly from any node while fully preserving vertical conversation history. |
| **🤖 AI-assisted Branching** | Continue complex exploration interacting with configurable multi-model suites. |
| **📌 Keyframes & Annotations**| Directly mark reasoning checkpoints across your exploration pathway. |
| **📑 Outcome Reports** | Generate traceable summary milestones relying strictly upon curated graph segments. |
| **📚 Knowledge-base Intgs.**| Harness WeKnora + Qdrant + docreader pipeline for high-performance RAG insertion. |
| **🔗 Snapshots & Sharing** | Preserve historical canvas states, share interactive read-only tree maps contextually. |
| **🎛 Multi-model Support** | Seamless configuration of platform models, Custom BYOK, or offline models. |

---

## 🏗 Architecture Layout

A high-level view showing our integration points:

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
- **Frontend**: `Next.js 16 (App Router)` · `React 19` · `TanStack Query`
- **Backend API**: `Express 5 (ESM-only module format)` · `Node.js 20` · Postgres Client Pools · Redis
- **Knowledge Core**: `WeKnora Engine` · `Qdrant (Vectors)` · `docreader`

---

## 🚀 Quick Start

### Option A: Docker (Recommended)
Up and running immediately. See [docs/DOCKER_QUICKSTART.md](docs/DOCKER_QUICKSTART.md) for deeper instructions.

```bash
# 1. Bring up the full orchestrated stack
sudo docker compose -f docker/compose.yaml up -d --build

# 2. Run initial database schemas
sudo docker compose -f docker/compose.yaml exec api node scripts/run_migrations.mjs
```
> **Default Endpoints:**
> Web: http://localhost:3000 | API: http://localhost:8000 | WeKnora Health: http://localhost:8081/health

### Option B: Manual Bare-Metal Setup
<details>
<summary><b>Click to expand step-by-step setup ⬇️</b></summary>

**1. Clone the Repository & Bootstrab**
```bash
git clone https://github.com/isbeingto/oMyTree.git /srv/oMyTree
cd /srv/oMyTree
corepack enable
pnpm install --frozen-lockfile
```

**2. Setup PostgreSQL**
```sql
CREATE DATABASE omytree;
CREATE USER omytree WITH PASSWORD 'your_password_here';
GRANT ALL PRIVILEGES ON DATABASE omytree TO omytree;
```
Kick off schema migrations via scripts mapping:
```bash
PG_DSN="postgres://omytree:your_password_here@127.0.0.1:5432/omytree?sslmode=disable" node api/scripts/run_migrations.mjs
```

**3. Global Environment Variables**
```bash
cp ecosystem.config.example.js ecosystem.config.js
# Inject explicit PG bindings, LLM endpoints, billing, etc., per your runtime limits.
```

**4. Compile App and Extract API bindings.**
```bash
pnpm --filter omytree-web run gen:types
pnpm --filter omytree-web run build
```

**5. Start Operations via PM2**
```bash
pm2 start ecosystem.config.js
pm2 list

# Hot reload routine during dev phase seamlessly updates branches
pnpm --filter omytree-web run build && pm2 reload omytree-web
pm2 reload omytree-api
```
</details>

<br/>

<div align="center">
Made with ✨ for Deep Thinkers
</div>
