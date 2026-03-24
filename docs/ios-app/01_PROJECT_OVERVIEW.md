# 01 — oMyTree 项目完整概述

## 1.1 产品定位

oMyTree 是一款**基于树状结构的 AI 对话探索工具**。与传统线性聊天不同，oMyTree 将对话组织为一棵"思维树"——用户可以在任意节点创建分支、回溯、比较不同思路，实现**多路径并行探索**。

### 核心差异化
| 特性 | 传统 AI Chat | oMyTree |
|------|-------------|---------|
| 对话结构 | 线性列表 | 树状分支 |
| 回溯能力 | 无/有限 | 任意节点可分支 |
| 思路对比 | 不支持 | BranchDiff 对比 |
| 知识管理 | 无 | Knowledge Base 集成 |
| 成果输出 | 复制粘贴 | Outcome/Trail 结构化报告 |
| 上下文控制 | 固定 | lite/standard/max 三档 |

---

## 1.2 核心功能模块

### 🌳 Tree（思维树）
- **创建 Tree**：用户发起新话题，自动创建一棵树
- **Tree 列表**：侧边栏展示所有历史 Tree，可搜索、重命名、删除
- **Tree 配置**：每棵树有独立配置（上下文档位、记忆范围、LLM 模型选择）
- **Tree 导出**：支持 JSON/Markdown 格式导出
- **Tree 分享**：生成公开分享链接
- **Tree 分叉 (Fork)**：从他人分享的树创建自己的副本

### 💬 Turn（对话轮次）
- **Turn 发送**：用户输入消息 → API 以 SSE 流返回 AI 回复
- **Turn Stream**：实时流式显示 AI 生成内容（核心交互，必须实现 SSE）
- **Turn 终止**：支持中途停止 AI 生成
- **编辑问题**：修改已发送的用户消息，重新生成 AI 回复（也是 SSE 流）

### 🔀 Branch（分支）
- **分支建议**：在任意节点获取分支建议
- **分支确认**：确认/拒绝分支建议
- **分支摘要**：自动为分支生成摘要提要

### 📍 Node（节点）
- **节点详情**：读取节点完整信息（包含用户消息或 AI 回复）
- **节点操作**：删除、修剪（prune）、从某节点开始删除后续
- **节点编辑问题**：修改用户问题并重新生成
- **Keyframes**：标记关键节点（书签）
- **Lens**：节点上下文透镜，查看详细信息

### 📝 Memo（摘要备忘）
- **自动生成**：基于对话节点自动提炼要点摘要
- **历史版本**：查看摘要历史
- **导出**：Markdown 格式导出

### 🎯 Outcome（成果）
- **创建 Outcome**：在特定节点锚定一个结论/成果
- **预览标题**：AI 生成标题候选
- **报告生成**：结构化报告自动生成
- **重新生成**：刷新报告内容

### 🥾 Trail（探索轨迹）
- **生成 Trail**：基于 Keyframes 生成探索叙事
- **版本历史**：Trail 有多个版本
- **最新版本**：获取最新 Trail

### 📸 PathSnapshot（路径快照）
- **创建快照**：冻结当前路径状态
- **回放**：逐步回放快照中的探索过程
- **对比**：BranchDiff 比较两条路径差异

### 📚 Knowledge（知识库）
- **知识库管理**：创建、删除知识库
- **文档上传**：上传文件到知识库
- **语义搜索**：在知识库中搜索相关内容
- **对话关联**：将知识库内容注入对话上下文

### 📎 Evidence（证据）
- **创建证据**：附加 URL/文件/文本作为证据
- **关联节点**：将证据附加到特定节点
- **文件上传**：上传文件作为证据

### 👤 Account（账户）
- **登录/注册**：邮箱密码 + Google OAuth
- **邮箱验证**：注册后需验证邮箱
- **密码重置**：忘记密码找回流程
- **API Keys**：BYOK（Bring Your Own Key）管理
- **LLM 设置**：选择偏好的 LLM 提供商/模型
- **用量查看**：查看 API 用量统计
- **计费/订阅**：Free / Pro / Team 计划

### 🏢 Workspace（工作空间）
- **多工作空间**：Team 计划支持切换工作空间
- **独立知识库**：每个工作空间有独立的知识库

---

## 1.3 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                    iOS App (Swift/SwiftUI)                    │
│                                                               │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│   │ TreeView  │  │ ChatView │  │ Settings │  │ Auth     │   │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│        └──────────────┴──────────────┴──────────────┘         │
│                           │                                   │
│                    ┌──────┴───────┐                           │
│                    │  APIClient   │                           │
│                    │  (URLSession)│                           │
│                    └──────┬───────┘                           │
└───────────────────────────┼───────────────────────────────────┘
                            │ HTTPS (REST + SSE)
                            ▼
┌───────────────────────────────────────────────────────────────┐
│                    oMyTree API (Express 5)                     │
│                    Port 8000 / PM2 Cluster                     │
│                                                               │
│   ┌──────────────────────────────────────────────────────┐   │
│   │  Middleware: CORS → Trace → JSON → Security →        │   │
│   │             Constitution → RateQuota                  │   │
│   └──────────────────────────────────────────────────────┘   │
│                           │                                   │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│   │ Tree     │  │ Turn     │  │Knowledge │  │ Auth     │   │
│   │ Routes   │  │ Stream   │  │ Routes   │  │ Routes   │   │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│        └──────────────┴──────────────┴──────────────┘         │
│                           │                                   │
│        ┌──────────────────┼──────────────────┐               │
│        ▼                  ▼                  ▼               │
│   ┌─────────┐      ┌──────────┐      ┌──────────┐          │
│   │PostgreSQL│      │  Redis   │      │ WeKnora  │          │
│   │ (Data)  │      │(Rate/Quo)│      │(Knowledge)│          │
│   └─────────┘      └──────────┘      └──────────┘          │
└───────────────────────────────────────────────────────────────┘
```

### 后端组件说明

| 组件 | 用途 | 技术 |
|------|------|------|
| Express API | 主业务 API 服务 | Express 5, Node 20, ESM |
| PostgreSQL | 核心数据存储 | pg 连接池, UUID 主键 |
| Redis | 速率限制、配额管理 | ioredis |
| WeKnora | 知识库服务 | Go 微服务 + Qdrant 向量库 |
| PM2 | 进程管理 | Cluster 模式, 2 实例 |

### 关键通信模式

1. **REST API**：标准 JSON 请求/响应，用于 CRUD 操作
2. **SSE (Server-Sent Events)**：用于 Turn 流式传输和实时更新
3. **文件上传**：multipart/form-data（Evidence、Knowledge 文档）

---

## 1.4 用户流程

### 核心使用流程
```
登录 → 侧边栏(Tree列表) → 选择/创建Tree → 对话交互 → AI回复(SSE流)
                                      ↓
                              在节点创建分支 → 并行探索 → 对比分支
                                      ↓
                          标记Keyframes → 生成Trail/Outcome → 导出
```

### 对话交互流程（最核心）
```
用户输入消息
    ↓
POST /api/turn/stream (SSE)
    ↓
接收 SSE events:
  - event: turn_start     → 开始标记
  - event: delta           → AI 文本增量 (一段一段返回)
  - event: reasoning_delta → DeepSeek 推理过程增量
  - event: turn_end        → 结束标记 (包含完整节点数据)
  - event: error           → 错误信息
    ↓
实时渲染 AI 回复文本（流式显示）
    ↓
turn_end 时保存最终节点到本地状态
```

---

## 1.5 用户角色与权限

| 角色 | 权限 |
|------|------|
| 未登录 | 仅可查看分享的 Tree |
| Free 用户 | 创建 Tree、基本对话、有限额度 |
| Pro 用户 | 更高额度、高级功能 |
| Team 用户 | 工作空间、团队协作、知识库 |
| Admin | 系统管理、用户管理、LLM 配置 |

---

## 1.6 国际化

- 支持两种语言：**English (en)** 和 **中文 (zh-CN)**
- 用户偏好存储在 `users.preferred_language` 字段
- iOS App 应支持同样的双语 UI
- 文案来源：后端 API 的 `lang` 参数 + 本地 i18n 文件

---

## 1.7 LLM 提供商

系统支持多个 LLM 提供商，用户可配置：

| 提供商 | 模型示例 | 协议 |
|--------|----------|------|
| OpenAI | GPT-4, GPT-4o, GPT-4o-mini | OpenAI Chat API |
| Anthropic | Claude 3.5 Sonnet, Claude 3 Opus | Anthropic Messages API |
| DeepSeek | DeepSeek-V3, DeepSeek-R1 | OpenAI-compatible |
| Google | Gemini Pro, Gemini Flash | Google GenAI API |
| Ollama (本地) | Llama, Mistral 等 | Ollama Bridge |

### BYOK (Bring Your Own Key)
用户可以在设置中添加自己的 API Key，使用自己的额度调用 LLM。

---

## 1.8 后端 API 基础信息

| 项 | 值 |
|----|----|
| 生产 URL | `https://www.omytree.com` |
| API 前缀 | `/api/` |
| 认证方式 | JWT Bearer Token (通过 NextAuth) |
| 用户 ID Header | `x-omytree-user-id` |
| 工作空间 ID Header | `x-omytree-workspace-id` |
| Trace ID Header | `x-trace-id` (响应) |
| 内容类型 | `application/json` (默认) |
| 文件上传 | `multipart/form-data` |
| 流式响应 | `text/event-stream` (SSE) |
| 请求体限制 | 1MB (JSON), 50MB (文件上传) |
