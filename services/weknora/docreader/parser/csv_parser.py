"""
CSV Parser Module

This module provides a parser for CSV (Comma-Separated Values) files.
It converts CSV data into a Document with structured chunks, where each row
becomes a separate chunk with key-value pairs.
"""
import logging
from io import BytesIO
from typing import List

# Note: pandas is imported lazily in parse_into_text() to reduce memory footprint
# when this module is loaded but CSV parsing is not needed (e.g., during OCR subprocess spawn).

from docreader.models.document import Chunk, Document
from docreader.parser.base_parser import BaseParser

logger = logging.getLogger(__name__)


class CSVParser(BaseParser):
    """
    Parser for CSV files that converts tabular data into structured text.
    
    This parser reads CSV content and transforms each row into a formatted string
    with column-value pairs. Each row is stored as a separate Chunk in the Document,
    allowing for granular access to individual records.
    
    The output format for each row is:
        "column1: value1, column2: value2, column3: value3\n"
    
    Usage:
        parser = CSVParser()
        with open("data.csv", "rb") as f:
            document = parser.parse_into_text(f.read())
    """
    
    def parse_into_text(self, content: bytes) -> Document:
        """Parse CSV content into a Document with structured chunks.
        
        Each row in the CSV is converted into a formatted string and stored as
        a separate Chunk. The chunks maintain sequential order and track their
        position in the overall document.
        
        Args:
            content: Raw bytes content of the CSV file
            
        Returns:
            Document: A Document object containing:
                - content: Full text with all rows concatenated
                - chunks: List of Chunk objects, one per CSV row
                
        Note:
            Bad lines in the CSV are automatically skipped using pandas'
            on_bad_lines="skip" parameter.
        """
        # Lazy import pandas to reduce memory footprint at module load time
        import pandas as pd

        chunks: List[Chunk] = []
        text: List[str] = []
        start, end = 0, 0

        # Read CSV content into a pandas DataFrame, skipping malformed lines
        df = pd.read_csv(BytesIO(content), on_bad_lines="skip")

        # Process each row in the DataFrame
        for i, (idx, row) in enumerate(df.iterrows()):
            # Format row as "column: value" pairs separated by commas
            content_row = (
                ",".join(
                    f"{col.strip()}: {str(row[col]).strip()}" for col in df.columns
                )
                + "\n"
            )
            # Update end position for this chunk
            end += len(content_row)
            text.append(content_row)
            
            # Create a chunk for this row with position tracking
            chunks.append(Chunk(content=content_row, seq=i, start=start, end=end))
            # Update start position for next chunk
            start = end

        return Document(
            content="".join(text),
            chunks=chunks,
        )


if __name__ == "__main__":
    # Example usage: Parse a CSV file and display its content
    logging.basicConfig(level=logging.DEBUG)

    your_file = "/path/to/your/file.csv"
    parser = CSVParser()
    with open(your_file, "rb") as f:
        content = f.read()
        document = parser.parse_into_text(content)
        # Display full document content
        logger.error(document.content)

        # Display individual chunks (rows)
        for chunk in document.chunks:
            logger.error(chunk.content)
