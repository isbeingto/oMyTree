// Common JSON Schemas for Gemini Structured Output (Phase 3.2)

export const SUMMARIES_SCHEMA = {
  type: 'object',
  properties: {
    path_summary: { type: 'string' },
    parent_summary: { type: 'string' },
  },
  required: ['path_summary', 'parent_summary'],
};
