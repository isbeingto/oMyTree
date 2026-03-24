import base64
import io
import logging
import os

from PIL import Image

from docreader.models.document import Document
from docreader.parser.base_parser import BaseParser

# Set up logger for this module
logger = logging.getLogger(__name__)


class ImageParser(BaseParser):
    """
    Parser for image files with OCR capability.
    Extracts text from images and generates captions.

    This parser handles image processing by:
    1. Uploading the image to storage
    2. Generating a descriptive caption
    3. Performing OCR to extract text content
    4. Returning a combined result with both text and image reference
    """

    def parse_into_text(self, content: bytes) -> Document:
        """
        Parse image content into markdown text
        :param content: bytes content of the image
        :return: Document object
        """
        logger.info(f"Parsing image content, size: {len(content)} bytes")

        # Get file extension
        ext = os.path.splitext(self.file_name)[1].lower()

        # Best-effort upload to storage (not required for OCR)
        image_url = ""
        try:
            image_url = self.storage.upload_bytes(content, file_ext=ext) or ""
            if image_url:
                logger.info(f"Successfully uploaded image, URL: {image_url[:80]}...")
            else:
                logger.warning(
                    f"Image upload returned empty URL (storage_type may be disabled): {self.file_name}"
                )
        except Exception as e:
            logger.warning(f"Failed to upload image to storage: {self.file_name}, err={e}")
            image_url = ""

        # Perform OCR locally (does not depend on enable_multimodal)
        ocr_text = ""
        img = None
        try:
            img = Image.open(io.BytesIO(content))
            logger.info(
                "Loaded image for OCR: %s, mode=%s, size=%sx%s",
                self.file_name,
                getattr(img, "mode", "?"),
                getattr(img, "size", ("?", "?"))[0],
                getattr(img, "size", ("?", "?"))[1],
            )

            # Normalize mode to improve OCR stability
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")

            ocr_text = (self.perform_ocr(img) or "").strip()
        except Exception as e:
            logger.warning(f"Failed to OCR image: {self.file_name}, err={e}")
            ocr_text = ""
        finally:
            try:
                if img is not None:
                    img.close()
            except Exception:
                pass
            img = None

        parts: list[str] = []
        if ocr_text:
            parts.append(ocr_text)

        if image_url:
            parts.append(f"![{self.file_name}]({image_url})")

        # If OCR produced no text, still return something meaningful for chunking.
        if not parts:
            parts.append(f"{self.file_name}")

        doc_images = {}
        if self.enable_multimodal and image_url and not image_url.startswith("data:"):
            # Only include base64 when explicitly requested (multimodal mode)
            doc_images = {image_url: base64.b64encode(content).decode()}

        return Document(content="\n\n".join(parts), images=doc_images)
