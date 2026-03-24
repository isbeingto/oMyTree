#!/bin/bash
# LinZhi 服务快速管理脚本

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

show_status() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}         LinZhi 服务状态${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    echo -e "${YELLOW}PM2 进程:${NC}"
    pm2 list
    echo ""
    
    echo -e "${YELLOW}系统服务:${NC}"
    for service in postgresql redis-server nginx; do
        status=$(systemctl is-active $service)
        if [ "$status" = "active" ]; then
            echo -e "  ✅ $service: ${GREEN}$status${NC}"
        else
            echo -e "  ❌ $service: ${RED}$status${NC}"
        fi
    done
    echo ""
    
    echo -e "${YELLOW}服务健康检查:${NC}"
    
    # API 健康检查
    api_status=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/readyz)
    if [ "$api_status" = "200" ]; then
        echo -e "  ✅ API (8000): ${GREEN}健康${NC}"
    else
        echo -e "  ❌ API (8000): ${RED}状态码 $api_status${NC}"
    fi
    
    # Web 健康检查
    web_status=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000)
    if [ "$web_status" = "200" ] || [ "$web_status" = "307" ]; then
        echo -e "  ✅ Web (3000): ${GREEN}健康${NC}"
    else
        echo -e "  ❌ Web (3000): ${RED}状态码 $web_status${NC}"
    fi
    
    # PostgreSQL 检查
    if PGPASSWORD="${PGPASSWORD:-omytree}" psql -h 127.0.0.1 -U omytree -d omytree -c "SELECT 1" > /dev/null 2>&1; then
        echo -e "  ✅ PostgreSQL: ${GREEN}连接成功${NC}"
    else
        echo -e "  ❌ PostgreSQL: ${RED}连接失败${NC}"
    fi
    
    # Redis 检查
    if redis-cli ping > /dev/null 2>&1; then
        echo -e "  ✅ Redis: ${GREEN}连接成功${NC}"
    else
        echo -e "  ❌ Redis: ${RED}连接失败${NC}"
    fi
    
    echo ""
}

restart_api() {
    echo -e "${BLUE}重启 API 服务...${NC}"
    pm2 restart omytree-api
}

restart_web() {
    echo -e "${BLUE}重启 Web 服务...${NC}"
    pm2 restart omytree-web
}

restart_all() {
    echo -e "${BLUE}重启所有服务...${NC}"
    pm2 restart all
}

rebuild_web() {
    echo -e "${BLUE}重新构建 Web 应用...${NC}"
    cd /srv/oMyTree/web
    pnpm run build
    pm2 restart omytree-web
    cd -
}

show_logs() {
    local service=$1
    local lines=${2:-50}
    
    if [ -z "$service" ]; then
        echo -e "${YELLOW}请指定服务: api 或 web${NC}"
        return
    fi
    
    case $service in
        api)
            pm2 logs omytree-api --lines $lines
            ;;
        web)
            pm2 logs omytree-web --lines $lines
            ;;
        *)
            echo -e "${RED}未知服务: $service${NC}"
            ;;
    esac
}

show_help() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}        LinZhi 快速管理脚本${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "用法: $0 [命令]"
    echo ""
    echo "命令:"
    echo "  status          - 显示所有服务状态"
    echo "  restart-api     - 重启 API 服务"
    echo "  restart-web     - 重启 Web 服务"
    echo "  restart-all     - 重启所有服务"
    echo "  rebuild-web     - 重新构建并重启 Web"
    echo "  logs api [n]    - 查看 API 日志 (默认50行)"
    echo "  logs web [n]    - 查看 Web 日志 (默认50行)"
    echo "  help            - 显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 status"
    echo "  $0 restart-api"
    echo "  $0 logs api 100"
    echo "  $0 rebuild-web"
    echo ""
}

# 主逻辑
case "${1:-status}" in
    status)
        show_status
        ;;
    restart-api)
        restart_api
        ;;
    restart-web)
        restart_web
        ;;
    restart-all)
        restart_all
        ;;
    rebuild-web)
        rebuild_web
        ;;
    logs)
        show_logs $2 $3
        ;;
    help|-h|--help)
        show_help
        ;;
    *)
        echo -e "${RED}未知命令: $1${NC}"
        echo ""
        show_help
        exit 1
        ;;
esac
