import gc
import logging
import re
from typing import Optional, Tuple

from PIL import Image

from docreader.config import CONFIG
from docreader.models.document import Document
from docreader.parser.chain_parser import FirstParser
from docreader.parser.markitdown_parser import MarkitdownParser
from docreader.parser.mineru_parser import MinerUParser

try:
    import fitz  # type: ignore
except Exception:  # pragma: no cover
    fitz = None


logger = logging.getLogger(__name__)

# Maximum rendered image pixels to prevent memory explosion.
# A 4000x5600 image = 22.4 Mpx at 8-bit RGB ≈ 67 MB in memory.
PDF_RENDER_MAX_PIXELS = int(getattr(CONFIG, "pdf_render_max_pixels", 16_000_000))  # 16 Mpx default


class PDFParser(FirstParser):
    """PDF Parser with quality-aware OCR fallback.

    Order:
    1) MinerUParser
    2) MarkitdownParser
    3) If extracted text is too short / low-quality and OCR is enabled,
       render PDF pages to images and run OCR (PaddleOCR recommended).
    """

    _parser_cls = (MinerUParser, MarkitdownParser)

    def _is_ocr_enabled(self) -> bool:
        backend = (self.ocr_backend or "").strip().lower()
        if backend in {"", "no_ocr", "dummy"}:
            return False
        return True

    @staticmethod
    def _text_quality(text: str) -> Tuple[int, float]:
        """Return (effective_len, unique_ratio) for a text."""
        if not text:
            return 0, 0.0
        compact = re.sub(r"\s+", "", text)
        if not compact:
            return 0, 0.0
        unique_ratio = len(set(compact)) / max(1, len(compact))
        return len(compact), unique_ratio

    def _is_text_good_enough(self, text: str) -> bool:
        effective_len, unique_ratio = self._text_quality(text)

        min_chars = max(0, int(getattr(CONFIG, "pdf_ocr_min_text_chars", 200)))
        min_unique_ratio = float(getattr(CONFIG, "pdf_ocr_min_unique_ratio", 0.12))

        if effective_len < min_chars:
            return False
        # Guard against degenerate outputs like repeated headers/watermarks.
        if effective_len >= min_chars * 2 and unique_ratio < min_unique_ratio:
            return False
        return True

    def _render_pdf_page(self, doc, page_index: int, scale: float) -> Optional[Image.Image]:
        try:
            page = doc.load_page(page_index)
            matrix = fitz.Matrix(scale, scale)
            pix = page.get_pixmap(matrix=matrix, alpha=False)

            # Check pixel count before creating PIL Image to avoid memory blow-up.
            total_pixels = pix.width * pix.height
            if total_pixels > PDF_RENDER_MAX_PIXELS:
                logger.warning(
                    "PDF page %s rendered size %sx%s (%s px) exceeds limit (%s px), skipping",
                    page_index,
                    pix.width,
                    pix.height,
                    total_pixels,
                    PDF_RENDER_MAX_PIXELS,
                )
                del pix
                del page
                return None

            mode = "RGB"
            img = Image.frombytes(mode, (pix.width, pix.height), pix.samples)

            # Help CPython release large intermediates earlier.
            try:
                del pix
                del page
            except Exception:
                pass

            return img
        except Exception:
            logger.exception("Failed to render PDF page %s", page_index)
            return None

    def _ocr_pdf(self, content: bytes) -> Document:
        if fitz is None:
            logger.warning("PyMuPDF (pymupdf) not installed; cannot OCR PDF")
            return Document()

        try:
            doc = fitz.open(stream=content, filetype="pdf")
        except Exception:
            logger.exception("Failed to open PDF for OCR")
            return Document()

        try:
            page_count = int(doc.page_count)
            max_pages = int(getattr(CONFIG, "pdf_ocr_max_pages", 50))
            scale = float(getattr(CONFIG, "pdf_ocr_render_scale", 2.0))

            if max_pages > 0:
                page_limit = min(page_count, max_pages)
            else:
                page_limit = page_count

            logger.info(
                "PDF OCR fallback enabled (backend=%s), pages=%s (limit=%s), scale=%s",
                self.ocr_backend,
                page_count,
                page_limit,
                scale,
            )

            parts = []
            for i in range(page_limit):
                img = self._render_pdf_page(doc, i, scale)
                if img is None:
                    continue

                try:
                    ocr_text = self.perform_ocr(img)
                    if ocr_text:
                        parts.append(f"\n\n--- Page {i + 1} ---\n{ocr_text}")
                finally:
                    # PIL Image may keep large buffers; close promptly.
                    try:
                        img.close()
                    except Exception:
                        pass
                    img = None

                # Explicitly invoke garbage collection after each page to release
                # memory before processing the next page, preventing accumulation.
                gc.collect()

            text = "".join(parts).strip()
            return Document(content=text)
        finally:
            try:
                doc.close()
            except Exception:
                pass

    def parse_into_text(self, content: bytes) -> Document:
        # 1) MinerU
        if len(self._parsers) >= 1:
            p = self._parsers[0]
            logger.info("PDFParser: trying %s", p.__class__.__name__)
            try:
                doc = p.parse_into_text(content)
            except Exception:
                logger.exception("PDFParser: %s failed", p.__class__.__name__)
                doc = Document()

            if doc.is_valid() and self._is_text_good_enough(doc.content):
                logger.info("PDFParser: accepted %s output", p.__class__.__name__)
                return doc

        # 2) MarkItDown
        if len(self._parsers) >= 2:
            p = self._parsers[1]
            logger.info("PDFParser: trying %s", p.__class__.__name__)
            try:
                doc = p.parse_into_text(content)
            except Exception:
                logger.exception("PDFParser: %s failed", p.__class__.__name__)
                doc = Document()

            if doc.is_valid() and self._is_text_good_enough(doc.content):
                logger.info("PDFParser: accepted %s output", p.__class__.__name__)
                return doc

        # 3) OCR fallback
        if self._is_ocr_enabled():
            ocr_doc = self._ocr_pdf(content)
            if ocr_doc.is_valid():
                logger.info("PDFParser: OCR fallback produced %s chars", len(ocr_doc.content))
                return ocr_doc

        # Last resort: keep whatever we got from MarkItDown (even if low quality),
        # otherwise empty.
        for p in self._parsers:
            try:
                doc = p.parse_into_text(content)
                if doc.is_valid():
                    return doc
            except Exception:
                continue

        return Document()
