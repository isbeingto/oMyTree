# oMyTree iOS 26 原生 App 开发文档索引

> **目标**：基于 Swift / SwiftUI，为 oMyTree 项目开发 iOS 26 原生 App  
> **技术栈**：Swift 6.2 · SwiftUI · iOS 26 (Liquid Glass) · Xcode 26  
> **后端**：对接现有 oMyTree Express API (https://www.omytree.com)  
> **创建日期**：2026-03-04

---

## 文档清单

| # | 文件 | 内容说明 |
|---|------|----------|
| 01 | [01_PROJECT_OVERVIEW.md](01_PROJECT_OVERVIEW.md) | oMyTree 项目完整概述：产品定位、核心功能、技术架构、业务流程 |
| 02 | [02_API_REFERENCE.md](02_API_REFERENCE.md) | 后端 API 完整接口文档：所有端点、请求/响应格式、认证方式、SSE流 |
| 03 | [03_DATA_MODELS.md](03_DATA_MODELS.md) | 数据模型与 Swift Codable 结构体定义：所有实体、关系、枚举 |
| 04 | [04_IOS_ARCHITECTURE.md](04_IOS_ARCHITECTURE.md) | iOS App 架构设计：模块划分、依赖关系、文件结构、设计模式 |
| 05 | [05_SWIFT_IMPLEMENTATION_GUIDE.md](05_SWIFT_IMPLEMENTATION_GUIDE.md) | Swift 核心实现指南：网络层、SSE流、状态管理、Swift Concurrency |
| 06 | [06_UI_DESIGN_SPEC.md](06_UI_DESIGN_SPEC.md) | UI/UX 设计规范：Liquid Glass 适配、页面结构、组件映射、交互设计 |
| 07 | [07_AUTH_AND_SECURITY.md](07_AUTH_AND_SECURITY.md) | 认证与安全：登录流程、JWT/Session、Keychain、Google OAuth、安全策略 |
| 08 | [08_DEV_ENVIRONMENT_SETUP.md](08_DEV_ENVIRONMENT_SETUP.md) | 开发环境配置：Xcode 项目创建、SPM 依赖、构建配置、调试技巧 |
| 09 | [09_FEATURE_IMPLEMENTATION_PLAN.md](09_FEATURE_IMPLEMENTATION_PLAN.md) | 功能实现路线图：分阶段实现计划、优先级、里程碑 |
| 10 | [10_COPILOT_INSTRUCTIONS.md](10_COPILOT_INSTRUCTIONS.md) | AI 编码助手指引：项目上下文、编码规范、关键约束（供 Cursor/Copilot 使用） |

---

## 快速开始

1. 阅读 `01_PROJECT_OVERVIEW.md` 了解产品全貌
2. 阅读 `08_DEV_ENVIRONMENT_SETUP.md` 配置开发环境
3. 阅读 `04_IOS_ARCHITECTURE.md` 理解 App 架构
4. 按照 `09_FEATURE_IMPLEMENTATION_PLAN.md` 分阶段开发
5. 将 `10_COPILOT_INSTRUCTIONS.md` 放入 `.github/` 或 `.cursor/` 目录供 AI 读取

## 注意事项

- iOS App 认证通过 `/api/mobile/login`（邮箱密码）或 `/api/mobile/google-login`（Google）获取 `userId`，后续请求携带 `x-omytree-user-id` header，参考 `07_AUTH_AND_SECURITY.md`
- 后端 Mobile Auth 端点已部署上线（实现文件：`api/routes/mobile_auth.js`）
- AASA 文件已配置（`web/public/.well-known/apple-app-site-association`），TEAM_ID 待替换
- 后端 API 基础 URL: `https://www.omytree.com/api/` (生产) 或 `http://127.0.0.1:8000/api/` (本地开发)
- 核心交互（对话 Turn）使用 SSE 流式传输，参考 `05_SWIFT_IMPLEMENTATION_GUIDE.md`
