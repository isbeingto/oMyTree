// Common JSON Schemas for Gemini Structured Output (Phase 3.2)
// Keep schemas small and compatible with Gemini's supported JSON Schema subset.

export const RELEVANCE_SCHEMA = {
  type: 'object',
  properties: {
    classification: {
      type: 'string',
      enum: ['in', 'side', 'new'],
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
    },
    reason: {
      type: 'string',
    },
  },
  required: ['classification', 'confidence'],
};
