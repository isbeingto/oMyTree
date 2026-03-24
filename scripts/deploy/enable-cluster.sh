#!/usr/bin/env bash
# 启用集群模式脚本 - 实现零停机热更新能力

set -euo pipefail

ECOSYSTEM_FILE="/srv/oMyTree/ecosystem.config.js"
BACKUP_FILE="/srv/oMyTree/ecosystem.config.js.backup.$(date +%Y%m%d_%H%M%S)"

echo "🔄 启用 PM2 集群模式以支持零停机部署"
echo ""

# 备份
echo "📦 备份配置文件..."
cp "$ECOSYSTEM_FILE" "$BACKUP_FILE"
echo "   备份到: $BACKUP_FILE"
echo ""

# 检查当前模式
echo "📊 当前 PM2 状态:"
pm2 list | grep linzhi || true
echo ""

# 提示手动修改
cat <<'EOF'
📝 请手动修改 ecosystem.config.js，为每个应用添加集群配置:

{
  name: "omytree-api",
  cwd: "/srv/oMyTree/api",
  script: "index.js",
  // 添加以下配置 👇
  instances: 2,              // CPU 核心数 或 固定数量
  exec_mode: "cluster",      // 集群模式
  wait_ready: true,          // 等待应用发送 ready 信号
  listen_timeout: 10000,     // 监听超时
  kill_timeout: 5000,        // 优雅关闭超时
  // 原有 env 配置 ...
}

对于 omytree-web 同样添加这些配置。

EOF

read -p "是否现在打开编辑器? (y/N) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  ${EDITOR:-nano} "$ECOSYSTEM_FILE"
fi

echo ""
read -p "配置已修改完成? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ 取消操作"
  exit 1
fi

# 重启 PM2 应用集群
echo "🔄 应用新配置..."
pm2 delete omytree-api omytree-web || true
pm2 start "$ECOSYSTEM_FILE"

echo ""
echo "✅ 集群模式已启用!"
echo ""
echo "📊 当前状态:"
pm2 list | grep linzhi

echo ""
echo "🎯 现在可以使用零停机部署:"
echo "   bash tools/scripts/deploy/hot-reload.sh web"
echo "   bash tools/scripts/deploy/hot-reload.sh api"
echo ""
echo "   或直接使用: pm2 reload omytree-api"
