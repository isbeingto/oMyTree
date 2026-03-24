#!/bin/bash
# 创建并启用 swap 文件，防止内存不足时 OOM Kill
# 这是一个一次性脚本，运行后会在系统重启时自动挂载 swap

set -e

SWAP_FILE="/swapfile"
SWAP_SIZE="2G"

echo "========== 创建 Swap 文件 =========="

# 检查是否已存在 swap
if swapon --show | grep -q "$SWAP_FILE"; then
    echo "✓ Swap 文件已存在并启用"
    swapon --show
    exit 0
fi

# 检查是否有 root 权限
if [ "$EUID" -ne 0 ]; then
    echo "请使用 sudo 运行此脚本"
    exit 1
fi

# 检查是否已有 swap 文件存在但未启用
if [ -f "$SWAP_FILE" ]; then
    echo "发现已存在的 swap 文件，尝试启用..."
    chmod 600 "$SWAP_FILE"
    swapon "$SWAP_FILE" || true
    swapon --show
    exit 0
fi

echo "创建 $SWAP_SIZE swap 文件..."

# 创建 swap 文件
fallocate -l $SWAP_SIZE $SWAP_FILE || dd if=/dev/zero of=$SWAP_FILE bs=1G count=2

# 设置权限
chmod 600 $SWAP_FILE

# 格式化为 swap
mkswap $SWAP_FILE

# 启用 swap
swapon $SWAP_FILE

# 添加到 fstab（如果不存在）
if ! grep -q "$SWAP_FILE" /etc/fstab; then
    echo "$SWAP_FILE none swap sw 0 0" >> /etc/fstab
    echo "✓ 已添加到 /etc/fstab，重启后自动挂载"
fi

# 调整 swappiness（降低到10，只在必要时使用 swap）
echo 10 > /proc/sys/vm/swappiness
if ! grep -q "vm.swappiness" /etc/sysctl.conf; then
    echo "vm.swappiness=10" >> /etc/sysctl.conf
fi

echo ""
echo "========== Swap 配置完成 =========="
swapon --show
free -h

echo ""
echo "✓ Swap 已启用。这将作为内存不足时的安全网。"
