#!/usr/bin/env python3
"""Minimal entry point for isolated OCR worker subprocess.

This module is designed to be the entry for `spawn`-based multiprocessing.
It deliberately avoids importing heavy modules (pandas, docx, etc.) that
are not needed for pure OCR work, thus reducing memory footprint.

The worker receives image bytes via a Pipe, runs PaddleOCR, and returns text.
"""

from __future__ import annotations

import gc
import io
import logging
import os
import sys
import traceback
import warnings
from multiprocessing.connection import Connection

# Minimal logging setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

# Reduce noisy Paddle warnings that spam PM2 stderr logs.
# This does NOT affect correctness and keeps real errors visible.
warnings.filterwarnings(
    "ignore",
    message=r".*No ccache found\..*",
    category=UserWarning,
)


def _get_paddle_ocr():
    """Initialize PaddleOCR with memory-optimized settings."""
    # Limit thread pools BEFORE importing paddle
    os.environ.setdefault("OMP_NUM_THREADS", "1")
    os.environ.setdefault("MKL_NUM_THREADS", "1")
    os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
    os.environ.setdefault("NUMEXPR_NUM_THREADS", "1")
    os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")

    try:
        # Ensure warning filters are applied before importing paddle (the warning is emitted on import).
        warnings.filterwarnings(
            "ignore",
            message=r".*No ccache found\..*",
            category=UserWarning,
        )
        import paddle
        paddle.device.set_device("cpu")
    except Exception as e:
        logger.warning(f"Failed to set paddle device: {e}")

    from paddleocr import PaddleOCR

    model_size = (os.getenv("DOCREADER_PADDLE_OCR_MODEL_SIZE") or "mobile").strip().lower()
    if model_size not in {"mobile", "server"}:
        model_size = "mobile"

    det_side_len = int(os.getenv("DOCREADER_PADDLE_OCR_DET_SIDE_LEN") or ("640" if model_size == "mobile" else "960"))
    det_side_len = max(256, min(det_side_len, 1280))

    rec_model = "PP-OCRv4_mobile_rec" if model_size == "mobile" else "PP-OCRv4_server_rec"
    det_model = "PP-OCRv4_mobile_det" if model_size == "mobile" else "PP-OCRv4_server_det"

    ocr_config = {
        "use_gpu": False,
        "text_det_limit_type": "max",
        "text_det_limit_side_len": det_side_len,
        "use_doc_orientation_classify": False,
        "use_doc_unwarping": False,
        "use_textline_orientation": False,
        "text_recognition_model_name": rec_model,
        "text_detection_model_name": det_model,
        "text_det_thresh": 0.3,
        "text_det_box_thresh": 0.6,
        "text_det_unclip_ratio": 1.5,
        "text_rec_score_thresh": 0.0,
        "ocr_version": "PP-OCRv4",
        "lang": "ch",
        "show_log": False,
        "use_dilation": False,
        "det_db_score_mode": "fast",
    }

    ocr = PaddleOCR(**ocr_config)
    logger.info(f"PaddleOCR initialized (model_size={model_size}, det_side_len={det_side_len})")
    return ocr


def _predict(ocr, img_bytes: bytes) -> str:
    """Run OCR on image bytes."""
    from PIL import Image
    import numpy as np

    img = Image.open(io.BytesIO(img_bytes))
    if img.mode != "RGB":
        img = img.convert("RGB")

    image_array = np.array(img)
    
    # Close PIL image immediately after conversion
    try:
        img.close()
    except Exception:
        pass
    del img

    ocr_result = ocr.ocr(image_array, cls=False)
    
    # Clear numpy array immediately
    del image_array
    gc.collect()

    if not ocr_result or not ocr_result[0]:
        return ""

    texts = []
    for line in ocr_result[0]:
        if line and len(line) >= 2 and line[1]:
            t = line[1][0]
            if t:
                texts.append(t.strip())

    return " ".join(texts)


def worker_main(conn: Connection, backend_type: str):
    """Worker process entry point.

    Args:
        conn: Pipe connection for communication with parent.
        backend_type: OCR backend type (only "paddle" supported here).
    """
    ocr = None
    try:
        logger.info(f"OCR worker starting (backend={backend_type}, pid={os.getpid()})")
        
        if backend_type.lower() != "paddle":
            conn.send(("fatal", f"Unsupported backend: {backend_type}"))
            return

        ocr = _get_paddle_ocr()
        conn.send(("ready", backend_type))
        logger.info("OCR worker ready")

        while True:
            try:
                msg = conn.recv()
            except EOFError:
                logger.info("Connection closed, worker exiting")
                break

            if not msg:
                continue

            op = msg[0]

            if op == "close":
                conn.send(("closed", None))
                logger.info("Worker received close signal")
                break

            if op != "predict":
                conn.send(("error", f"unknown op: {op}"))
                continue

            img_bytes = msg[1]
            try:
                text = _predict(ocr, img_bytes)
                conn.send(("ok", text))
                # Force GC after each prediction
                gc.collect()
            except Exception as e:
                logger.error(f"Prediction error: {e}")
                conn.send(("error", f"{e}\n{traceback.format_exc()}"))
                gc.collect()

    except Exception as e:
        logger.error(f"Worker fatal error: {e}")
        try:
            conn.send(("fatal", f"{e}\n{traceback.format_exc()}"))
        except Exception:
            pass
    finally:
        # Cleanup
        if ocr is not None:
            del ocr
        gc.collect()
        logger.info(f"OCR worker exiting (pid={os.getpid()})")


if __name__ == "__main__":
    # This allows the worker to be run directly for testing
    print("This module should be used via multiprocessing, not run directly.")
