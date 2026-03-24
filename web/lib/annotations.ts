export type InlineAnnotationAnchor = {
  type: 'text-offset' | 'legacy';
  start?: number;
  end?: number;
  prefix?: string;
  suffix?: string;
};

export type InlineAnnotation = {
  id: string;
  quote: string;
  anchor: InlineAnnotationAnchor;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type InlineAnnotationSelection = {
  messageId: string;
  quote: string;
  anchor: InlineAnnotationAnchor;
  note?: string;
};

export type KeyframeAnnotation = string | InlineAnnotation[] | null;

export function createAnnotationId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `anno_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

export function parseKeyframeAnnotation(value: string | null): KeyframeAnnotation {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed as InlineAnnotation[];
      }
    } catch {
      return value;
    }
  }
  return value;
}

export function normalizeKeyframeAnnotations(value: KeyframeAnnotation, nowIso = new Date().toISOString()): InlineAnnotation[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  const legacyText = value.trim();
  if (!legacyText) return [];
  return [
    {
      id: `legacy_${nowIso}`,
      quote: '',
      anchor: { type: 'legacy' },
      note: legacyText,
      created_at: nowIso,
      updated_at: nowIso,
    },
  ];
}

export function serializeKeyframeAnnotation(value: KeyframeAnnotation): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export function formatKeyframeAnnotation(value: KeyframeAnnotation): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  const parts = value
    .map((item) => (item.note || item.quote || '').trim())
    .filter(Boolean);
  return parts.join(' / ');
}