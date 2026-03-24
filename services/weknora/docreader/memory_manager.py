"""docreader 内存管理工具。

目标：在 PaddleOCR / PDF 处理等可能产生原生内存膨胀的场景下，
提供一个低侵入、可配置的“阈值触发 GC + 可选 malloc_trim”机制，
并避免多线程并发触发 GC 导致抖动。
"""

import gc
import logging
import os
import threading
import time

logger = logging.getLogger(__name__)


class MemoryManager:
    """内存管理工具 - 防止泄漏"""

    def __init__(self, max_memory_mb=300):
        """
        初始化内存管理器
        max_memory_mb: 超过该值时触发垃圾回收（单位：MB）
        """
        # Feature switch
        self.enabled = str(os.getenv("DOCREADER_MEMORY_GC_ENABLED", "1")).strip().lower() not in {
            "0",
            "false",
            "no",
            "off",
        }

        # Threshold (MB)
        env_threshold = os.getenv("DOCREADER_MEMORY_GC_THRESHOLD_MB")
        self.max_memory_mb = int(env_threshold) if env_threshold else int(max_memory_mb)

        # Avoid frequent GC in multi-thread server
        env_min_interval = os.getenv("DOCREADER_MEMORY_GC_MIN_INTERVAL_S")
        self.min_interval_s = float(env_min_interval) if env_min_interval else 15.0

        # Optional: return freed memory to OS on Linux/glibc.
        self.enable_malloc_trim = str(
            os.getenv("DOCREADER_MEMORY_MALLOC_TRIM", "0")
        ).strip().lower() in {"1", "true", "yes", "on"}

        self._lock = threading.Lock()
        self._last_gc_ts = 0.0
        self._has_psutil = False

        try:
            import psutil

            self.psutil = psutil
            self.process = psutil.Process(os.getpid())
            self._has_psutil = True
        except ImportError:
            # 仍然允许 force_cleanup()；只是无法基于 RSS 做阈值判断。
            logger.warning(
                "psutil not available; memory threshold checks disabled (force cleanup still works)"
            )

    def _maybe_malloc_trim(self) -> bool:
        if not self.enable_malloc_trim:
            return False
        if os.name != "posix":
            return False

        try:
            import ctypes

            libc = ctypes.CDLL("libc.so.6")
            libc.malloc_trim(0)
            return True
        except Exception:
            # malloc_trim 不是所有系统都有；失败时静默即可。
            return False

    def _should_run_gc(self, force: bool) -> bool:
        if force:
            return True
        now = time.time()
        return (now - self._last_gc_ts) >= self.min_interval_s

    def _run_cleanup(self, operation_name: str, force: bool) -> bool:
        if not self.enabled:
            return False

        with self._lock:
            if not self._should_run_gc(force=force):
                return False

            before_mb = self.get_memory_mb()
            gc.collect()
            trimmed = self._maybe_malloc_trim()
            after_mb = self.get_memory_mb()

            self._last_gc_ts = time.time()

            # 只有在能拿到 RSS 的时候，才输出“释放了多少”的日志。
            if before_mb and after_mb:
                freed_mb = before_mb - after_mb
                logger.info(
                    f"[{operation_name}] Cleanup done: {before_mb:.1f}MB → {after_mb:.1f}MB "
                    f"(freed {freed_mb:.1f}MB, malloc_trim={trimmed})"
                )
            else:
                logger.info(
                    f"[{operation_name}] Cleanup done (malloc_trim={trimmed})"
                )
            return True

    def get_memory_mb(self):
        """获取当前进程内存占用（MB）"""
        if not self.enabled or not self._has_psutil:
            return 0

        try:
            return self.process.memory_info().rss / 1024 / 1024
        except Exception as e:
            logger.error(f"Error getting memory info: {e}")
            return 0

    def check_and_cleanup(self, operation_name="unknown"):
        """
        检查内存，超过阈值则强制垃圾回收

        Args:
            operation_name: 操作名称（用于日志）

        Returns:
            bool: 是否执行了垃圾回收
        """
        if not self.enabled or not self._has_psutil:
            return False

        try:
            memory_mb = self.get_memory_mb()
            if memory_mb <= 0:
                return False

            if memory_mb > self.max_memory_mb:
                logger.warning(
                    f"[{operation_name}] Memory HIGH: {memory_mb:.1f}MB (threshold {self.max_memory_mb}MB)"
                )
                return self._run_cleanup(operation_name, force=False)

            logger.debug(f"[{operation_name}] Memory OK: {memory_mb:.1f}MB")
            return False
        except Exception as e:
            logger.error(f"Error checking memory: {e}")
            return False

    def force_cleanup(self, operation_name="unknown"):
        """强制执行垃圾回收，不管内存是否超过阈值"""
        try:
            self._run_cleanup(operation_name, force=True)
        except Exception as e:
            logger.error(f"Error during force cleanup: {e}")


# 全局实例 - 在模块导入时创建
memory_manager = MemoryManager(max_memory_mb=300)
