"""
Parser module for WeKnora document processing system.

This module provides document parsers for various file formats including:
- Microsoft Word documents (.doc, .docx)
- PDF documents
- Markdown files
- Plain text files
- Images with text content
- Web pages

The parsers extract content from documents and can split them into
meaningful chunks for further processing and indexing.

NOTE: Parsers are now imported lazily via __getattr__ to reduce memory
footprint at module load time (important for OCR subprocesses).
"""


def __getattr__(name: str):
    """Lazy import parsers only when accessed to reduce startup memory."""
    _lazy_imports = {
        "CSVParser": ".csv_parser",
        "DocParser": ".doc_parser",
        "Docx2Parser": ".docx2_parser",
        "ExcelParser": ".excel_parser",
        "ImageParser": ".image_parser",
        "MarkdownParser": ".markdown_parser",
        "Parser": ".parser",
        "PDFParser": ".pdf_parser",
        "TextParser": ".text_parser",
        "WebParser": ".web_parser",
    }
    if name in _lazy_imports:
        import importlib

        module = importlib.import_module(_lazy_imports[name], __package__)
        return getattr(module, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


# Export public classes and modules
__all__ = [
    "Docx2Parser",  # Parser for .docx files (modern Word documents)
    "DocParser",  # Parser for .doc files (legacy Word documents)
    "PDFParser",  # Parser for PDF documents
    "MarkdownParser",  # Parser for Markdown text files
    "TextParser",  # Parser for plain text files
    "ImageParser",  # Parser for images with text content
    "WebParser",  # Parser for web pages
    "Parser",  # Main parser factory that selects the appropriate parser
    "CSVParser",  # Parser for CSV files
    "ExcelParser",  # Parser for Excel files
]
