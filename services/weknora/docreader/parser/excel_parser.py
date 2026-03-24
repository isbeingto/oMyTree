"""
Excel Parser Module

This module provides functionality to parse Excel files (.xlsx, .xls) into
structured Document objects with text content and chunks. It supports multiple
sheets and handles various Excel formats using pandas.
"""
import logging
from io import BytesIO
from typing import List

# Note: pandas is imported lazily in parse_into_text() to reduce memory footprint
# when this module is loaded but Excel parsing is not needed (e.g., during OCR subprocess spawn).

from docreader.models.document import Chunk, Document
from docreader.parser.base_parser import BaseParser

logger = logging.getLogger(__name__)


class ExcelParser(BaseParser):
    """Parser for Excel files (.xlsx, .xls).
    
    This parser extracts text content from Excel files by processing all sheets
    and converting each row into a structured text format. Each row becomes a
    separate chunk with key-value pairs.
    
    Features:
        - Supports multiple sheets in a single Excel file
        - Automatically removes completely empty rows
        - Converts each row to "column: value" format
        - Creates individual chunks for each row for better granularity
        
    Example:
        >>> parser = ExcelParser()
        >>> with open("data.xlsx", "rb") as f:
        ...     content = f.read()
        ...     document = parser.parse_into_text(content)
        >>> print(document.content)
        Name: John,Age: 30,City: NYC
        Name: Jane,Age: 25,City: LA
    """
    
    def parse_into_text(self, content: bytes) -> Document:
        """Parse Excel file bytes into a Document object.
        
        Args:
            content: Raw bytes of the Excel file
            
        Returns:
            Document: Parsed document containing:
                - content: Full text with all rows from all sheets
                - chunks: List of Chunk objects, one per row
                
        Note:
            - Empty rows (all NaN values) are automatically skipped
            - Each row is formatted as: "col1: val1,col2: val2,..."
            - Chunks maintain sequential ordering across all sheets
        """
        # Lazy import pandas to reduce memory footprint at module load time
        import pandas as pd

        chunks: List[Chunk] = []
        text: List[str] = []
        start, end = 0, 0

        # Load Excel file from bytes into pandas ExcelFile object
        excel_file = pd.ExcelFile(BytesIO(content))
        
        # Process each sheet in the Excel file
        for excel_sheet_name in excel_file.sheet_names:
            # Parse the sheet into a DataFrame
            df = excel_file.parse(sheet_name=excel_sheet_name)
            # Remove rows where all values are NaN (completely empty rows)
            df.dropna(how="all", inplace=True)

            # Process each row in the DataFrame
            for _, row in df.iterrows():
                page_content = []
                # Build key-value pairs for non-null values
                for k, v in row.items():
                    if pd.notna(v):  # Skip NaN/null values
                        page_content.append(f"{k}: {v}")
                
                # Skip rows with no valid content
                if not page_content:
                    continue
                
                # Format row as comma-separated key-value pairs
                content_row = ",".join(page_content) + "\n"
                end += len(content_row)
                text.append(content_row)
                
                # Create a chunk for this row with position tracking
                chunks.append(
                    Chunk(content=content_row, seq=len(chunks), start=start, end=end)
                )
                start = end

        # Combine all text and return as Document
        return Document(content="".join(text), chunks=chunks)


if __name__ == "__main__":
    # Example usage: Parse an Excel file and display results
    logging.basicConfig(level=logging.DEBUG)

    # Specify the path to your Excel file
    your_file = "/path/to/your/file.xlsx"
    parser = ExcelParser()
    
    # Read and parse the Excel file
    with open(your_file, "rb") as f:
        content = f.read()
        document = parser.parse_into_text(content)
        
        # Display the full document content
        logger.error(document.content)

        # Display the first chunk as an example
        for chunk in document.chunks:
            logger.error(chunk.content)
            break  # Only show the first chunk
