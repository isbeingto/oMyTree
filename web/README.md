# oMyTree Web

> **📢 品牌更名通知 (2026-01-22)**: 项目从 LinZhi 更名为 oMyTree

Frontend for oMyTree (www.omytree.com). Next.js App Router with tree visualization.

## ⚠️ 统一生产模式开发

本项目**不使用开发模式** (`pnpm run dev`)，统一通过 PM2 生产模式开发。

### 开发工作流

```bash
# 1. 修改代码

# 2. 构建并重启
cd /srv/linzhi && pnpm --filter omytree-web run build && pm2 reload omytree-web

# 3. 浏览器刷新验证
# https://www.omytree.com 或 http://localhost:3000
```

### 首次安装

```bash
corepack enable
cd /srv/linzhi && pnpm install --frozen-lockfile
pnpm --filter omytree-web run gen:types   # 从 OpenAPI 生成类型
pnpm --filter omytree-web run build
pm2 reload omytree-web
```

## 环境变量

**所有环境变量在 `/srv/linzhi/ecosystem.config.js` 中配置**，不使用 `.env.local`。

关键变量：
- `API_PROXY_TARGET` - API 代理目标 (http://127.0.0.1:8000)
- `NEXTAUTH_URL` - NextAuth 回调 URL
- `DATABASE_URL` - PostgreSQL 连接

## 常用命令

```bash
# 构建并重启
cd /srv/linzhi && pnpm --filter omytree-web run build && pm2 reload omytree-web

# 查看日志
pm2 logs omytree-web --lines 30

# 生成 OpenAPI 类型
pnpm --filter omytree-web run gen:types

# TypeScript 检查
pnpm --filter omytree-web exec tsc --noEmit
```

## Feature Flags

`config/features.json` 控制功能开关：

```json
{
  "treeMvp": true,
  "undoUx": true,
  "observability": true
}
```

## 常见问题

### 端口被占用
```bash
ss -tlnp | grep 3000
pm2 reload omytree-web
```

### 修改后页面没变化
```bash
# 必须重新构建
pnpm --filter omytree-web run build && pm2 reload omytree-web
```

### 权限错误
```bash
rm -rf .next
pnpm --filter omytree-web run build
pm2 reload omytree-web
```

## 技术栈

- Next.js 16 (App Router)
- React 19
- TypeScript 5.x
- Tailwind CSS 4
- NextAuth.js (PostgreSQL adapter)
