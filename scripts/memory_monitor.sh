#!/bin/bash
# 内存泄漏监控脚本 - 持续监控docreader内存并在达到阈值时告警

set -e

ALERT_THRESHOLD_MB=400  # 告警阈值
CRITICAL_THRESHOLD_MB=500  # 严重告警阈值
CHECK_INTERVAL=10  # 检查间隔（秒）

# 颜色定义
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========== docreader 内存监控系统启动 ==========${NC}"
echo "告警阈值: ${ALERT_THRESHOLD_MB}MB"
echo "严重阈值: ${CRITICAL_THRESHOLD_MB}MB"
echo "检查间隔: ${CHECK_INTERVAL}秒"
echo ""

# 日志文件
MONITOR_LOG="/srv/oMyTree/logs/memory_monitor.log"
touch "$MONITOR_LOG"

log_event() {
    local level=$1
    local message=$2
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message" | tee -a "$MONITOR_LOG"
}

check_memory() {
    local pid=$1
    local process_name=$2
    
    # 获取内存（MB）
    local memory_kb=$(ps -p "$pid" -o rss= 2>/dev/null || echo "0")
    local memory_mb=$((memory_kb / 1024))
    
    echo "$memory_mb"
}

# 主监控循环
echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] 开始持续监控...${NC}"
log_event "INFO" "内存监控启动"

restart_count=0

while true; do
    # 获取docreader进程
    local pids=$(pgrep -f "docreader.main" || true)
    
    if [ -z "$pids" ]; then
        echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] docreader 进程未运行${NC}"
        log_event "WARN" "docreader 进程未运行"
        sleep $CHECK_INTERVAL
        continue
    fi
    
    # 检查每个 docreader 进程
    for pid in $pids; do
        local memory_mb=$(check_memory "$pid" "docreader")
        local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
        
        if [ "$memory_mb" -ge $CRITICAL_THRESHOLD_MB ]; then
            # 严重告警
            echo -e "${RED}[$timestamp] ⚠️ 严重告警: docreader (PID $pid) 内存达到 ${memory_mb}MB (严重阈值: ${CRITICAL_THRESHOLD_MB}MB)${NC}"
            log_event "CRITICAL" "docreader (PID $pid) 内存达到 ${memory_mb}MB - 触发严重告警"
            
            # 触发自动重启
            echo -e "${RED}[$timestamp] 🔄 触发自动重启...${NC}"
            log_event "ACTION" "触发自动重启 docreader"
            pm2 restart omytree-docreader 2>&1 | tee -a "$MONITOR_LOG"
            restart_count=$((restart_count + 1))
            log_event "INFO" "自动重启次数: $restart_count"
            
        elif [ "$memory_mb" -ge $ALERT_THRESHOLD_MB ]; then
            # 告警
            echo -e "${YELLOW}[$timestamp] ⚠️ 告警: docreader (PID $pid) 内存达到 ${memory_mb}MB (告警阈值: ${ALERT_THRESHOLD_MB}MB)${NC}"
            log_event "WARN" "docreader (PID $pid) 内存达到 ${memory_mb}MB - 接近限制"
            
        else
            # 正常
            echo -e "${GREEN}[$timestamp] ✓ docreader (PID $pid) 内存正常: ${memory_mb}MB${NC}"
        fi
    done
    
    sleep $CHECK_INTERVAL
done
