/**
 * T87: Text Parser Module
 * T88: Added PDF parsing support
 * 
 * Zero-token deterministic parsing for v0 file formats:
 * - .txt/.md: UTF-8 text (encoding validation)
 * - .json: Parse and pretty print (truncate if too large)
 * - .csv/.tsv: Convert to markdown table with metadata
 * - .yaml/.yml: Safe parse and pretty print
 * - .pdf: Extract text from PDF documents
 * 
 * All parsers are pure functions that return { text, meta, error }.
 */

import yaml from 'js-yaml';
import { createRequire } from 'module';

// T88: pdf-parse v2.x - uses PDFParse class instead of function
const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

// Maximum bytes for normalized output
const MAX_OUTPUT_BYTES = 64 * 1024; // 64KB
// Maximum rows for CSV/TSV preview
const MAX_CSV_ROWS = 100;
// Maximum keys to show for large JSON objects
const MAX_JSON_KEYS = 500;

/**
 * @typedef {Object} ParseResult
 * @property {string|null} text - Normalized text output
 * @property {Object|null} meta - Metadata about parsing
 * @property {string|null} error - Error message if parsing failed
 */

/**
 * Parse raw buffer based on file extension
 * @param {Buffer} buffer - Raw file content
 * @param {string} ext - File extension (lowercase, with dot)
 * @param {string} fileName - Original filename for error messages
 * @returns {ParseResult}
 */
export function parseContent(buffer, ext, fileName) {
  try {
    switch (ext) {
      case '.txt':
      case '.md':
      case '.log':
      case '.cfg':
      case '.ini':
      case '.conf':
        return parseTextFile(buffer, fileName);
      
      case '.json':
        return parseJsonFile(buffer, fileName);
      
      case '.csv':
        return parseCsvFile(buffer, fileName, ',');
      
      case '.tsv':
        return parseCsvFile(buffer, fileName, '\t');
      
      case '.yaml':
      case '.yml':
        return parseYamlFile(buffer, fileName);
      
      case '.xml':
        return parseTextFile(buffer, fileName); // XML as plain text for v0
      
      case '.pdf':
        return parsePdfFile(buffer, fileName);
      
      default:
        return {
          text: null,
          meta: null,
          error: `Unsupported file extension: ${ext}`,
        };
    }
  } catch (err) {
    return {
      text: null,
      meta: null,
      error: `Parse error: ${err.message}`,
    };
  }
}

/**
 * Parse text file (UTF-8 validation)
 * @param {Buffer} buffer
 * @param {string} fileName
 * @returns {ParseResult}
 */
function parseTextFile(buffer, fileName) {
  // Validate UTF-8 by attempting decode
  let text;
  try {
    text = buffer.toString('utf8');
    
    // Check for replacement character (indicates invalid UTF-8)
    if (text.includes('\uFFFD')) {
      return {
        text: null,
        meta: null,
        error: 'Encoding error: File contains invalid UTF-8 sequences',
      };
    }
  } catch (err) {
    return {
      text: null,
      meta: null,
      error: `Encoding error: ${err.message}`,
    };
  }

  // Truncate if too large
  const truncated = text.length > MAX_OUTPUT_BYTES;
  if (truncated) {
    text = text.slice(0, MAX_OUTPUT_BYTES) + '\n\n…truncated';
  }

  const lineCount = (text.match(/\n/g) || []).length + 1;
  const charCount = text.length;

  return {
    text,
    meta: {
      type: 'text',
      lines: lineCount,
      chars: charCount,
      truncated,
      originalBytes: buffer.length,
    },
    error: null,
  };
}

/**
 * Parse JSON file
 * @param {Buffer} buffer
 * @param {string} fileName
 * @returns {ParseResult}
 */
function parseJsonFile(buffer, fileName) {
  let text;
  try {
    text = buffer.toString('utf8');
  } catch (err) {
    return {
      text: null,
      meta: null,
      error: `Encoding error: ${err.message}`,
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return {
      text: null,
      meta: null,
      error: `JSON parse error: ${err.message}`,
    };
  }

  // Compute metadata
  const meta = {
    type: 'json',
    originalBytes: buffer.length,
  };

  if (Array.isArray(parsed)) {
    meta.isArray = true;
    meta.length = parsed.length;
  } else if (parsed && typeof parsed === 'object') {
    meta.isObject = true;
    meta.keysCount = Object.keys(parsed).length;
  }

  // Pretty print
  let prettyText = JSON.stringify(parsed, null, 2);

  // Truncate if too large
  if (prettyText.length > MAX_OUTPUT_BYTES) {
    // Try to truncate at a reasonable point
    prettyText = prettyText.slice(0, MAX_OUTPUT_BYTES) + '\n\n…truncated';
    meta.truncated = true;
  }

  return {
    text: prettyText,
    meta,
    error: null,
  };
}

/**
 * Parse CSV/TSV file to markdown table
 * @param {Buffer} buffer
 * @param {string} fileName
 * @param {string} delimiter
 * @returns {ParseResult}
 */
function parseCsvFile(buffer, fileName, delimiter) {
  let text;
  try {
    text = buffer.toString('utf8');
    
    if (text.includes('\uFFFD')) {
      return {
        text: null,
        meta: null,
        error: 'Encoding error: File contains invalid UTF-8 sequences',
      };
    }
  } catch (err) {
    return {
      text: null,
      meta: null,
      error: `Encoding error: ${err.message}`,
    };
  }

  // Split into lines
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
  
  if (lines.length === 0) {
    return {
      text: '',
      meta: {
        type: delimiter === '\t' ? 'tsv' : 'csv',
        rows: 0,
        cols: 0,
        originalBytes: buffer.length,
      },
      error: null,
    };
  }

  // Parse CSV (simple parser, handles basic quoting)
  const rows = lines.map(line => parseCSVLine(line, delimiter));
  
  const totalRows = rows.length;
  const maxCols = Math.max(...rows.map(r => r.length));
  
  // Determine if first row is header (heuristic: no numeric values)
  const hasHeader = rows.length > 1 && rows[0].every(cell => 
    isNaN(Number(cell)) || cell.trim() === ''
  );

  // Limit rows for preview
  const previewRows = rows.slice(0, MAX_CSV_ROWS);
  const truncated = totalRows > MAX_CSV_ROWS;

  // Generate markdown table
  let markdown = '';
  
  if (hasHeader && previewRows.length > 0) {
    // Use first row as header
    const header = previewRows[0];
    markdown += '| ' + header.map(escapeMarkdown).join(' | ') + ' |\n';
    markdown += '| ' + header.map(() => '---').join(' | ') + ' |\n';
    
    for (let i = 1; i < previewRows.length; i++) {
      const row = previewRows[i];
      // Pad row to match header length
      while (row.length < header.length) row.push('');
      markdown += '| ' + row.map(escapeMarkdown).join(' | ') + ' |\n';
    }
  } else {
    // No header, generate generic headers
    const header = Array.from({ length: maxCols }, (_, i) => `Col${i + 1}`);
    markdown += '| ' + header.join(' | ') + ' |\n';
    markdown += '| ' + header.map(() => '---').join(' | ') + ' |\n';
    
    for (const row of previewRows) {
      while (row.length < maxCols) row.push('');
      markdown += '| ' + row.map(escapeMarkdown).join(' | ') + ' |\n';
    }
  }

  if (truncated) {
    markdown += `\n_…showing ${MAX_CSV_ROWS} of ${totalRows} rows_\n`;
  }

  // Truncate final output if still too large
  if (markdown.length > MAX_OUTPUT_BYTES) {
    markdown = markdown.slice(0, MAX_OUTPUT_BYTES) + '\n\n…truncated';
  }

  return {
    text: markdown,
    meta: {
      type: delimiter === '\t' ? 'tsv' : 'csv',
      rows: totalRows,
      cols: maxCols,
      hasHeader,
      truncated,
      originalBytes: buffer.length,
    },
    error: null,
  };
}

/**
 * Parse a single CSV line (handles quoting)
 */
function parseCSVLine(line, delimiter) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }
  
  result.push(current.trim());
  return result;
}

/**
 * Escape markdown special characters in table cells
 */
function escapeMarkdown(text) {
  if (typeof text !== 'string') text = String(text);
  // Escape pipe characters and newlines
  return text
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '');
}

/**
 * Parse YAML file (safe mode, no executing tags)
 * @param {Buffer} buffer
 * @param {string} fileName
 * @returns {ParseResult}
 */
function parseYamlFile(buffer, fileName) {
  let text;
  try {
    text = buffer.toString('utf8');
    
    if (text.includes('\uFFFD')) {
      return {
        text: null,
        meta: null,
        error: 'Encoding error: File contains invalid UTF-8 sequences',
      };
    }
  } catch (err) {
    return {
      text: null,
      meta: null,
      error: `Encoding error: ${err.message}`,
    };
  }

  let parsed;
  try {
    // Use safeLoad (or load with safe schema in newer versions)
    parsed = yaml.load(text, { schema: yaml.FAILSAFE_SCHEMA });
  } catch (err) {
    return {
      text: null,
      meta: null,
      error: `YAML parse error: ${err.message}`,
    };
  }

  // Compute metadata
  const meta = {
    type: 'yaml',
    originalBytes: buffer.length,
  };

  if (Array.isArray(parsed)) {
    meta.isArray = true;
    meta.length = parsed.length;
  } else if (parsed && typeof parsed === 'object') {
    meta.isObject = true;
    meta.keysCount = Object.keys(parsed).length;
  }

  // Pretty print as YAML
  let prettyText;
  try {
    prettyText = yaml.dump(parsed, { 
      indent: 2, 
      lineWidth: 120,
      noRefs: true,
    });
  } catch (err) {
    // Fallback to JSON
    prettyText = JSON.stringify(parsed, null, 2);
  }

  // Truncate if too large
  if (prettyText.length > MAX_OUTPUT_BYTES) {
    prettyText = prettyText.slice(0, MAX_OUTPUT_BYTES) + '\n\n…truncated';
    meta.truncated = true;
  }

  return {
    text: prettyText,
    meta,
    error: null,
  };
}

/**
 * Get snippet from normalized text for preview
 * @param {string} normalizedText
 * @param {number} maxLength - Maximum length of snippet
 * @returns {string}
 */
export function getSnippet(normalizedText, maxLength = 500) {
  if (!normalizedText) return '';
  
  if (normalizedText.length <= maxLength) {
    return normalizedText;
  }
  
  // Try to cut at a word boundary
  const snippet = normalizedText.slice(0, maxLength);
  const lastSpace = snippet.lastIndexOf(' ');
  
  if (lastSpace > maxLength * 0.8) {
    return snippet.slice(0, lastSpace) + '…';
  }
  
  return snippet + '…';
}

/**
 * T88: Parse PDF file using pdf-parse
 * Note: This is an async operation but parseContent expects sync
 * We return a promise marker that gets resolved in the caller
 * @param {Buffer} buffer
 * @param {string} fileName
 * @returns {ParseResult}
 */
function parsePdfFile(buffer, fileName) {
  // pdf-parse is async, so we return a special marker
  // The actual parsing happens in parseContentAsync
  return {
    text: null,
    meta: { type: 'pdf', requiresAsync: true },
    error: null,
    _asyncBuffer: buffer,
    _asyncFileName: fileName,
  };
}

/**
 * T88: Async content parser for formats that require async parsing (like PDF)
 * @param {Buffer} buffer - Raw file content
 * @param {string} ext - File extension (lowercase, with dot)
 * @param {string} fileName - Original filename for error messages
 * @returns {Promise<ParseResult>}
 */
export async function parseContentAsync(buffer, ext, fileName) {
  // For PDF, use async parsing
  if (ext === '.pdf') {
    return await parsePdfFileAsync(buffer, fileName);
  }
  
  // For other formats, use sync parser
  return parseContent(buffer, ext, fileName);
}

/**
 * T88: Async PDF parsing using pdf-parse v2 API
 * T70: Added timeout to prevent hanging
 * @param {Buffer} buffer
 * @param {string} fileName
 * @returns {Promise<ParseResult>}
 */
async function parsePdfFileAsync(buffer, fileName) {
  // T70: Add timeout to prevent hanging on large/complex PDFs
  const PDF_PARSE_TIMEOUT = 30000; // 30 seconds
  
  const parsePromise = (async () => {
    // pdf-parse v2 uses PDFParse class with data option
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result;
    } finally {
      // Always destroy parser to free resources
      try {
        await parser.destroy();
      } catch (e) {
        // Ignore destroy errors
      }
    }
  })();
  
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('PDF parsing timed out after 30 seconds')), PDF_PARSE_TIMEOUT);
  });

  try {
    const result = await Promise.race([parsePromise, timeoutPromise]);
    
    let text = result.text || '';
    
    // Clean up common PDF extraction artifacts
    text = text
      .replace(/\r\n/g, '\n')           // Normalize line endings
      .replace(/\n{3,}/g, '\n\n')       // Collapse multiple blank lines
      .replace(/\t+/g, ' ')             // Replace tabs with spaces
      .trim();
    
    // Truncate if too large
    const truncated = text.length > MAX_OUTPUT_BYTES;
    if (truncated) {
      text = text.slice(0, MAX_OUTPUT_BYTES) + '\n\n…truncated';
    }

    const meta = {
      type: 'pdf',
      pages: result.total || 0,
      chars: text.length,
      truncated,
      originalBytes: buffer.length,
    };

    return {
      text,
      meta,
      error: null,
    };
  } catch (err) {
    return {
      text: null,
      meta: { type: 'pdf' },
      error: `PDF parse error: ${err.message}`,
    };
  }
}
