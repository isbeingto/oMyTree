# 运维与工具脚本

本目录包含所有项目级运维、部署、诊断和开发工具脚本。

## 📁 文件夹结构

```
scripts/
├── deploy/                      # 部署相关
│   ├── hot-reload.sh           # 零停机热更新: bash hot-reload.sh {api|web|all}
│   └── enable-cluster.sh      # 启用 PM2 集群模式 (一次性操作)
│
├── docker/                      # Docker 容器编排
│   ├── up.sh                   # 启动 Docker 容器栈
│   └── down.sh                 # 停止 Docker 容器栈
│
├── dev/                         # 开发工具
│   └── safe-rebuild-web.sh     # 安全重建 Web (清理 .next → 重装 → 构建)
│
├── maintenance/                 # 运维与维护
│   ├── rotate_weknora_logs.sh  # WeKnora 日志轮转 (适合 cron)
│   ├── weknora_guard.sh        # WeKnora 健康检查哨兵
│   ├── cleanup_deleted_data.sh # 清理已标记删除的数据库记录
│   ├── db_cleanup_audit.sh     # 数据库表/索引清理审计（只读）
│   └── bench_weknora_retrieval.js # WeKnora 检索性能基准测试
│
├── diagnostics/                 # 诊断工具
│   ├── upload_debug_monitor.sh # 上传功能调试监控
│   ├── diag_memo_truth.sh      # Memo 系统真值检查
│   └── doc_gate.sh             # 文档质量门禁检查
│
├── manage.sh                    # PM2 服务管理 (启动/停止/重启/状态)
├── memory_monitor.sh            # docreader 内存监控
├── setup_swap.sh                # Linux swap 配置 (一次性)
├── apply_memory_fix.sh          # docreader OOM 修复应用
└── backfill_branch_summaries.js # 分支摘要批量回填
```

## 🚀 常用命令

### 部署

```bash
# 零停机热更新 (推荐)
bash scripts/deploy/hot-reload.sh web   # 仅更新 Web
bash scripts/deploy/hot-reload.sh api   # 仅更新 API
bash scripts/deploy/hot-reload.sh all   # 全部更新

# 首次启用集群模式
bash scripts/deploy/enable-cluster.sh
```

### Docker

```bash
bash scripts/docker/up.sh               # 启动容器栈
bash scripts/docker/down.sh             # 停止容器栈
```

### 维护

```bash
bash scripts/maintenance/rotate_weknora_logs.sh   # 日志轮转
bash scripts/maintenance/weknora_guard.sh          # 健康检查
bash scripts/maintenance/cleanup_deleted_data.sh   # 清理删除数据
bash scripts/maintenance/db_cleanup_audit.sh "$PG_DSN" omytree # DB 清理审计（只读）
```

### 诊断

```bash
bash scripts/diagnostics/diag_memo_truth.sh       # Memo 真值诊断
bash scripts/diagnostics/doc_gate.sh              # 文档门禁检查
```

## 📋 其他脚本位置

各子项目保留各自专属脚本：

| 位置 | 用途 |
|------|------|
| `api/tools/tree_rollback.sh` | 树数据回滚工具 |
| `api/scripts/p6_verify.sh` | API 审计功能验证 |
| `web/tools/verify-ui.sh` | Web UI 验证 (`pnpm verify-ui`) |
| `services/weknora/scripts/` | WeKnora 服务脚本 (构建、迁移、开发) |
