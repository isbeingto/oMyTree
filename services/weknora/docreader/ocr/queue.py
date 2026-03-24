"""OCR 任务队列管理器。

确保 OCR 任务按顺序一个一个处理，防止并发导致内存溢出。
使用简单的内存队列 + 信号量实现，无需外部依赖（如 Redis）。
"""

from __future__ import annotations

import logging
import os
import queue
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class OCRTask:
    """OCR 任务"""
    task_id: str
    image_data: bytes
    callback: Optional[Callable[[str], None]] = None
    created_at: datetime = field(default_factory=datetime.now)
    result: Optional[str] = None
    error: Optional[str] = None
    completed: threading.Event = field(default_factory=threading.Event)
    cancelled: bool = False


class OCRQueue:
    """OCR 任务队列管理器。
    
    特性:
    - 限制并发数为 1，确保任务串行执行
    - 任务队列有最大长度限制，防止无限堆积
    - 支持超时等待
    - 自动任务统计和日志
    """
    
    _instance: Optional["OCRQueue"] = None
    _lock = threading.Lock()
    
    def __new__(cls):
        """单例模式"""
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._initialized = False
            return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        # 配置
        self.max_queue_size = int(os.getenv("DOCREADER_OCR_QUEUE_SIZE", "10"))
        self.task_timeout = float(os.getenv("DOCREADER_OCR_TASK_TIMEOUT", "120"))
        
        # 任务队列（由单一后台线程 FIFO 消费）
        self._queue: queue.Queue[OCRTask] = queue.Queue(maxsize=self.max_queue_size)
        
        # 统计
        self._total_tasks = 0
        self._completed_tasks = 0
        self._failed_tasks = 0
        self._abandoned_tasks = 0
        self._start_time = time.time()
        
        # 状态
        self._current_task: Optional[OCRTask] = None
        self._current_task_started_at: Optional[float] = None

        # Enqueue behavior
        # If >0, submit() will wait up to this duration for a free slot instead of failing immediately.
        self.enqueue_timeout = float(os.getenv("DOCREADER_OCR_QUEUE_ENQUEUE_TIMEOUT", "0"))

        # 后台 worker
        self._worker_thread = threading.Thread(
            target=self._worker_loop,
            name="docreader-ocr-queue-worker",
            daemon=True,
        )
        self._worker_thread.start()
        
        self._initialized = True
        logger.info(
            "OCR Queue initialized: max_queue_size=%d, task_timeout=%.1fs, enqueue_timeout=%.1fs",
            self.max_queue_size,
            self.task_timeout,
            self.enqueue_timeout,
        )

    def _worker_loop(self):
        """后台线程：按 FIFO 顺序逐个执行 OCR 任务。"""
        while True:
            task: OCRTask = self._queue.get()
            self._current_task = task
            self._current_task_started_at = time.time()
            start_time = time.time()

            try:
                if task.cancelled:
                    logger.info("[Queue] Task %s cancelled before start", task.task_id)
                    self._failed_tasks += 1
                    task.error = task.error or "cancelled"
                    continue

                ocr_func: Callable[[bytes], str]
                ocr_func = getattr(task, "_ocr_func")  # set by submit()

                logger.info("[Queue] Task %s started processing", task.task_id)
                result = ocr_func(task.image_data)
                if task.cancelled:
                    # Caller has already timed out; drop result to save memory and keep stats honest.
                    self._abandoned_tasks += 1
                    task.result = None
                    task.error = task.error or "cancelled"
                    logger.info(
                        "[Queue] Task %s finished in %.2fs but was cancelled; result discarded",
                        task.task_id,
                        time.time() - start_time,
                    )
                    continue

                task.result = result
                self._completed_tasks += 1

                elapsed = time.time() - start_time
                logger.info(
                    "[Queue] Task %s completed in %.2fs, result_len=%d",
                    task.task_id,
                    elapsed,
                    len(result) if result else 0,
                )

                if task.callback:
                    try:
                        task.callback(result)
                    except Exception:
                        # callback failure should not fail the task
                        logger.exception("[Queue] Task %s callback failed", task.task_id)

            except Exception as e:
                task.error = str(e)
                self._failed_tasks += 1
                logger.exception("[Queue] Task %s failed", task.task_id)
            finally:
                self._current_task = None
                self._current_task_started_at = None
                task.completed.set()
                try:
                    self._queue.task_done()
                except Exception:
                    pass
    
    def get_status(self) -> dict:
        """获取队列状态"""
        now = time.time()
        current_task_age = (
            (now - self._current_task_started_at)
            if self._current_task_started_at is not None
            else None
        )
        return {
            "queue_size": self._queue.qsize(),
            "max_queue_size": self.max_queue_size,
            "is_processing": self._current_task is not None,
            "current_task_id": self._current_task.task_id if self._current_task else None,
            "current_task_age_s": current_task_age,
            "total_tasks": self._total_tasks,
            "completed_tasks": self._completed_tasks,
            "failed_tasks": self._failed_tasks,
            "abandoned_tasks": self._abandoned_tasks,
            "uptime_seconds": time.time() - self._start_time,
        }
    
    def submit(
        self,
        task_id: str,
        image_data: bytes,
        ocr_func: Callable[[bytes], str],
        timeout: Optional[float] = None,
    ) -> str:
        """提交 OCR 任务并等待结果。
        
        Args:
            task_id: 任务唯一标识
            image_data: 图片数据
            ocr_func: OCR 处理函数
            timeout: 超时时间（秒），None 使用默认值
            
        Returns:
            OCR 识别结果文本
            
        Raises:
            queue.Full: 队列已满
            TimeoutError: 任务超时
            RuntimeError: OCR 处理失败
        """
        timeout = timeout or self.task_timeout
        task = OCRTask(task_id=task_id, image_data=image_data)
        # Store the callable on the task to keep queue payload minimal.
        setattr(task, "_ocr_func", ocr_func)
        
        # 尝试加入队列
        try:
            if self.enqueue_timeout and self.enqueue_timeout > 0:
                self._queue.put(task, timeout=self.enqueue_timeout)
            else:
                self._queue.put_nowait(task)
            self._total_tasks += 1
            logger.info(
                "[Queue] Task %s added, queue_size=%d/%d",
                task_id, self._queue.qsize(), self.max_queue_size
            )
        except queue.Full:
            logger.warning("[Queue] Queue full, rejecting task %s", task_id)
            raise queue.Full(f"OCR queue is full ({self.max_queue_size} tasks pending)")
        
        # 等待完成
        if not task.completed.wait(timeout=timeout):
            # Mark cancelled so worker can skip if it hasn't started.
            task.cancelled = True
            task.error = task.error or f"timeout after {timeout}s"
            raise TimeoutError(f"OCR task {task_id} timed out after {timeout}s")
        
        if task.error:
            raise RuntimeError(f"OCR task {task_id} failed: {task.error}")
        
        return task.result or ""


# 全局队列实例
_ocr_queue: Optional[OCRQueue] = None
_queue_lock = threading.Lock()


def get_ocr_queue() -> OCRQueue:
    """获取全局 OCR 队列实例"""
    global _ocr_queue
    with _queue_lock:
        if _ocr_queue is None:
            _ocr_queue = OCRQueue()
        return _ocr_queue


def is_queue_enabled() -> bool:
    """检查是否启用队列"""
    v = os.getenv("DOCREADER_OCR_QUEUE_ENABLED", "1")
    return str(v).strip().lower() in {"1", "true", "yes", "on"}
