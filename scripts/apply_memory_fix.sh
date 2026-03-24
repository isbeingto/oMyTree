#!/bin/bash
# 内存溢出问题修复脚本
# 执行此脚本以应用所有内存优化配置

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   oMyTree OCR 内存问题修复脚本${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 1. 设置 swap（需要 sudo）
echo -e "${YELLOW}[1/5] 检查并设置 Swap...${NC}"
if swapon --show | grep -q "/swapfile"; then
    echo -e "${GREEN}✓ Swap 已启用${NC}"
else
    echo -e "${YELLOW}Swap 未启用。请手动执行以下命令设置 swap：${NC}"
    echo "   sudo bash /srv/oMyTree/scripts/setup_swap.sh"
fi
echo ""

# 2. 删除旧的 PM2 进程配置缓存
echo -e "${YELLOW}[2/5] 清理 PM2 配置缓存...${NC}"
pm2 delete omytree-docreader 2>/dev/null || true
echo -e "${GREEN}✓ 已清理 docreader 进程${NC}"
echo ""

# 3. 重新启动所有服务（使用新配置）
echo -e "${YELLOW}[3/5] 使用新配置重启服务...${NC}"
cd /srv/oMyTree
pm2 start ecosystem.config.js --only omytree-docreader
echo -e "${GREEN}✓ docreader 服务已重启${NC}"
echo ""

# 4. 验证环境变量已正确应用
echo -e "${YELLOW}[4/5] 验证配置是否正确应用...${NC}"
sleep 3

# 获取 docreader 进程 ID
DOCREADER_ID=$(pm2 id omytree-docreader 2>/dev/null | head -1)

if [ -n "$DOCREADER_ID" ]; then
    echo "检查关键环境变量："
    
    # 检查关键配置
    WORKERS=$(pm2 env "$DOCREADER_ID" 2>/dev/null | grep "DOCREADER_GRPC_MAX_WORKERS" | cut -d: -f2 | tr -d ' ')
    OMP=$(pm2 env "$DOCREADER_ID" 2>/dev/null | grep "OMP_NUM_THREADS" | cut -d: -f2 | tr -d ' ')
    MAX_TASKS=$(pm2 env "$DOCREADER_ID" 2>/dev/null | grep "DOCREADER_OCR_WORKER_MAX_TASKS" | cut -d: -f2 | tr -d ' ')
    MAX_PIXELS=$(pm2 env "$DOCREADER_ID" 2>/dev/null | grep "DOCREADER_IMAGE_MAX_PIXELS" | cut -d: -f2 | tr -d ' ')
    
    echo "  DOCREADER_GRPC_MAX_WORKERS: ${WORKERS:-未设置}"
    echo "  OMP_NUM_THREADS: ${OMP:-未设置}"
    echo "  DOCREADER_OCR_WORKER_MAX_TASKS: ${MAX_TASKS:-未设置}"
    echo "  DOCREADER_IMAGE_MAX_PIXELS: ${MAX_PIXELS:-未设置}"
    
    # 验证
    if [ "$WORKERS" = "1" ] && [ "$OMP" = "1" ]; then
        echo -e "${GREEN}✓ 配置已正确应用${NC}"
    else
        echo -e "${RED}✗ 配置可能未正确应用，请检查 ecosystem.config.js${NC}"
    fi
else
    echo -e "${RED}✗ 无法获取 docreader 进程 ID${NC}"
fi
echo ""

# 5. 显示当前状态
echo -e "${YELLOW}[5/5] 当前系统状态...${NC}"
echo ""
echo "内存使用情况："
free -h
echo ""
echo "PM2 进程状态："
pm2 list
echo ""

echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}修复完成！${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "修复内容总结："
echo "  1. 降低 gRPC 工作线程数到 1（串行处理）"
echo "  2. 每次 OCR 任务后回收 worker 进程"
echo "  3. 限制图片最大尺寸到 1280px / 800万像素"
echo "  4. 启用主动内存回收和 malloc_trim"
echo "  5. 降低 PM2 内存重启阈值到 350MB"
echo "  6. 使用轻量级 OCR worker 减少内存占用"
echo ""
echo "如果问题仍然存在，请："
echo "  1. 执行 'sudo bash /srv/oMyTree/scripts/setup_swap.sh' 添加 swap"
echo "  2. 考虑升级服务器内存到 16GB"
echo "  3. 查看日志：tail -f /srv/oMyTree/logs/docreader-out-*.log"
