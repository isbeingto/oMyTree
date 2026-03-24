#!/usr/bin/env bash
# 热更新脚本 - 零停机部署
# 用法: ./hot-reload.sh {api|web|all}

set -euo pipefail

SERVICE="${1:-all}"
WORKSPACE="/srv/oMyTree"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; exit 1; }

# 检查是否使用集群模式
check_cluster_mode() {
  local app_name=$1
  local exec_mode=$(pm2 jlist | jq -r ".[] | select(.name==\"$app_name\") | .pm2_env.exec_mode" | head -1)
  
  if [[ "$exec_mode" == "cluster_mode" ]]; then
    return 0  # true
  else
    return 1  # false
  fi
}

# 优雅重载
graceful_reload() {
  local app_name=$1
  
  log_info "重载 $app_name..."
  
  if check_cluster_mode "$app_name"; then
    log_info "集群模式，使用 reload (零停机)"
    pm2 reload "$app_name" --update-env
  else
    log_warn "单实例模式，使用 restart (有短暂停机)"
    log_warn "提示: 修改 ecosystem.config.js 添加 instances: 2, exec_mode: 'cluster' 实现零停机"
    pm2 restart "$app_name"
  fi
}

# 部署 API
deploy_api() {
  log_info "部署 API..."
  graceful_reload "omytree-api"
  log_info "API 部署完成"
}

# 部署 Web
deploy_web() {
  log_info "部署 Web..."
  
  # 构建
  log_info "构建 Next.js..."
  cd "$WORKSPACE/web"
  pnpm run build || log_error "构建失败"
  
  # 重载
  graceful_reload "omytree-web"
  log_info "Web 部署完成"
}

# 主逻辑
case "$SERVICE" in
  api)
    deploy_api
    ;;
  web)
    deploy_web
    ;;
  all)
    deploy_api
    deploy_web
    ;;
  *)
    log_error "用法: $0 {api|web|all}"
    ;;
esac

# 显示状态
echo ""
log_info "当前服务状态:"
pm2 list | grep linzhi

echo ""
log_info "查看日志: pm2 logs omytree-api --lines 30"
