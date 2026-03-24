"""Isolated OCR execution to mitigate native memory leaks.

PaddleOCR (and its native deps) can grow RSS over time in long-lived processes.
This module runs OCR in a dedicated subprocess and can periodically recycle it.

Design goals:
- Keep the main gRPC server process stable.
- Reuse the OCR model within the worker for performance.
- Auto-restart the worker after N jobs or on failure.

Env vars:
- DOCREADER_OCR_ISOLATE_PROCESS: default "1". When false, fall back to in-process OCR.
- DOCREADER_OCR_WORKER_MAX_TASKS: default "1". Restart worker after this many requests (aggressive recycling).
- DOCREADER_OCR_WORKER_TIMEOUT_S: default "90". Timeout for one OCR request.
- DOCREADER_OCR_WORKER_START_METHOD: default "spawn" for safety.
- DOCREADER_OCR_USE_LIGHTWEIGHT_WORKER: default "1". Use minimal worker entry to reduce memory.
"""

from __future__ import annotations

import io
import logging
import os
import traceback
import threading
import time
from dataclasses import dataclass
from multiprocessing.connection import Connection
from typing import Optional, Tuple

from PIL import Image

logger = logging.getLogger(__name__)


def _env_bool(key: str, default: bool) -> bool:
    v = os.getenv(key)
    if v is None or str(v).strip() == "":
        return default
    return str(v).strip().lower() in {"1", "true", "yes", "y", "on"}


def is_isolation_enabled() -> bool:
    return _env_bool("DOCREADER_OCR_ISOLATE_PROCESS", True)


def _env_int(key: str, default: int) -> int:
    v = os.getenv(key)
    if v is None or str(v).strip() == "":
        return default
    try:
        return int(str(v).strip())
    except Exception:
        return default


def _env_float(key: str, default: float) -> float:
    v = os.getenv(key)
    if v is None or str(v).strip() == "":
        return default
    try:
        return float(str(v).strip())
    except Exception:
        return default


@dataclass
class _WorkerState:
    proc: object
    conn: Connection
    started_at: float
    task_count: int


def _serialize_image(img: Image.Image) -> bytes:
    # Use PNG to preserve text sharpness.
    if img.mode != "RGB":
        img = img.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _worker_main(conn: Connection, backend_type: str):
    """Worker process entry - legacy version.
    
    For better memory efficiency, use the lightweight worker in worker_entry.py.
    """
    try:
        # Import inside subprocess so native libs don't live in the main server.
        from docreader.ocr import OCREngine
        import gc

        engine = OCREngine.get_instance(backend_type)
        conn.send(("ready", backend_type))

        while True:
            msg = conn.recv()
            if not msg:
                continue
            op = msg[0]
            if op == "close":
                conn.send(("closed", None))
                break
            if op != "predict":
                conn.send(("error", f"unknown op: {op}"))
                continue

            img_bytes = msg[1]
            try:
                img = Image.open(io.BytesIO(img_bytes))
                if img.mode not in ("RGB", "L"):
                    img = img.convert("RGB")
                text = (engine.predict(img) or "").strip()
                try:
                    img.close()
                except Exception:
                    pass
                conn.send(("ok", text))
                # Force GC after each prediction
                gc.collect()
            except Exception as e:
                conn.send(("error", f"{e}\n{traceback.format_exc()}"))
                gc.collect()

    except Exception as e:
        # Best-effort report init failure.
        try:
            conn.send(("fatal", f"{e}\n{traceback.format_exc()}"))
        except Exception:
            pass


def _get_worker_target(backend_type: str):
    """Get the appropriate worker target function.
    
    Uses lightweight worker for paddle backend to reduce memory footprint.
    """
    use_lightweight = _env_bool("DOCREADER_OCR_USE_LIGHTWEIGHT_WORKER", True)
    
    if use_lightweight and backend_type.lower() == "paddle":
        try:
            from docreader.ocr.worker_entry import worker_main
            logger.info("Using lightweight OCR worker for reduced memory footprint")
            return worker_main
        except ImportError:
            logger.warning("Lightweight worker not available, falling back to default")
    
    return _worker_main


class IsolatedOCRClient:
    def __init__(self, backend_type: str):
        self.backend_type = (backend_type or "dummy").lower()
        self._lock = threading.Lock()
        self._state: Optional[_WorkerState] = None

        # Default to 1 task per worker for aggressive memory recycling
        self.max_tasks = max(1, _env_int("DOCREADER_OCR_WORKER_MAX_TASKS", 1))
        self.timeout_s = max(5.0, _env_float("DOCREADER_OCR_WORKER_TIMEOUT_S", 90.0))

    def _start(self) -> _WorkerState:
        import multiprocessing as mp

        # Default to spawn for safety (avoid fork + native/OpenMP deadlocks).
        # Allow override for special environments.
        requested = (os.getenv("DOCREADER_OCR_WORKER_START_METHOD") or "").strip().lower()
        if not requested:
            requested = "spawn"

        try:
            ctx = mp.get_context(requested)
        except Exception:
            ctx = mp.get_context("spawn")
        parent_conn, child_conn = ctx.Pipe(duplex=True)
        
        # Use lightweight worker target if available
        worker_target = _get_worker_target(self.backend_type)
        
        proc = ctx.Process(
            target=worker_target,
            args=(child_conn, self.backend_type),
            daemon=True,
            name=f"docreader-ocr-{self.backend_type}",
        )
        proc.start()

        # Wait for worker ready (short grace period)
        t0 = time.time()
        while time.time() - t0 < 60:  # Increased timeout for model loading
            if parent_conn.poll(0.5):
                kind, payload = parent_conn.recv()
                if kind == "ready":
                    logger.info(
                        "Isolated OCR worker ready: backend=%s pid=%s start_method=%s max_tasks=%d",
                        self.backend_type,
                        getattr(proc, "pid", None),
                        requested,
                        self.max_tasks,
                    )
                    return _WorkerState(proc=proc, conn=parent_conn, started_at=time.time(), task_count=0)
                if kind in {"fatal", "error"}:
                    raise RuntimeError(f"OCR worker init failed: {payload}")
        raise TimeoutError("OCR worker did not become ready")

    def _stop(self, state: _WorkerState):
        proc = state.proc

        # Ask the worker to exit cleanly.
        try:
            state.conn.send(("close", None))
            if state.conn.poll(2.0):
                _ = state.conn.recv()
        except Exception:
            pass

        # Give it a moment to stop gracefully.
        try:
            if getattr(proc, "join", None) is not None:
                proc.join(timeout=2.0)  # Reduced from 3s to 2s
        except Exception:
            pass

        # Force terminate (SIGTERM) if still alive.
        try:
            if getattr(proc, "is_alive", lambda: False)():
                logger.warning("OCR worker still alive after graceful shutdown, sending SIGTERM (pid=%s)", getattr(proc, 'pid', None))
                getattr(proc, "terminate", lambda: None)()
                if getattr(proc, "join", None) is not None:
                    proc.join(timeout=1.0)
        except Exception:
            pass

        # CRITICAL: Force kill (SIGKILL) if STILL alive after SIGTERM
        # This prevents memory leaks from zombie OCR workers
        try:
            if getattr(proc, "is_alive", lambda: False)():
                pid = getattr(proc, 'pid', None)
                logger.error("OCR worker STILL alive after SIGTERM, force killing with SIGKILL (pid=%s)", pid)
                getattr(proc, "kill", lambda: None)()  # SIGKILL
                if getattr(proc, "join", None) is not None:
                    proc.join(timeout=0.5)
        except Exception:
            logger.exception("Failed to SIGKILL OCR worker")

    def _ensure(self) -> _WorkerState:
        if self._state is None:
            self._state = self._start()
            return self._state

        proc = self._state.proc
        alive = False
        try:
            alive = getattr(proc, "is_alive", lambda: False)()
        except Exception:
            alive = False

        if not alive or self._state.task_count >= self.max_tasks:
            try:
                self._stop(self._state)
            except Exception:
                pass
            self._state = self._start()

        return self._state

    def predict(self, image: Image.Image) -> str:
        with self._lock:
            img_bytes = _serialize_image(image)

            # One automatic retry: if worker dies (e.g. OOM-killed) we restart and try again.
            for attempt in (1, 2):
                state = self._ensure()
                proc = state.proc
                if not getattr(proc, "is_alive", lambda: False)():
                    try:
                        self._stop(state)
                    except Exception:
                        pass
                    self._state = None
                    continue

                try:
                    state.conn.send(("predict", img_bytes))

                    # Wait in small increments so we can notice a dead worker quickly
                    # (e.g. OOM-killed) instead of burning the full timeout.
                    deadline = time.time() + self.timeout_s
                    kind = payload = None
                    while time.time() < deadline:
                        if state.conn.poll(0.25):
                            kind, payload = state.conn.recv()
                            break
                        if not getattr(proc, "is_alive", lambda: False)():
                            raise RuntimeError(
                                f"OCR worker exited (pid={getattr(proc, 'pid', None)} exitcode={getattr(proc, 'exitcode', None)})"
                            )

                    if kind is None:
                        raise TimeoutError(
                            f"OCR worker timeout (pid={getattr(proc, 'pid', None)} timeout_s={self.timeout_s})"
                        )

                    state.task_count += 1

                    if kind == "ok":
                        return payload or ""

                    logger.warning(
                        "Isolated OCR error(kind=%s pid=%s exitcode=%s): %s",
                        kind,
                        getattr(proc, "pid", None),
                        getattr(proc, "exitcode", None),
                        payload,
                    )
                    # restart worker
                    self._stop(state)
                    self._state = None
                except Exception as e:
                    logger.warning(
                        "Isolated OCR request failed (attempt=%s): %r",
                        attempt,
                        e,
                    )
                    try:
                        self._stop(state)
                    except Exception:
                        pass
                    self._state = None

                if attempt == 2:
                    return ""

            return ""


_singletons: dict[str, IsolatedOCRClient] = {}
_singletons_lock = threading.Lock()


def get_isolated_client(backend_type: str) -> IsolatedOCRClient:
    backend_type = (backend_type or "dummy").lower()
    with _singletons_lock:
        inst = _singletons.get(backend_type)
        if inst is None:
            inst = IsolatedOCRClient(backend_type)
            _singletons[backend_type] = inst
        return inst
