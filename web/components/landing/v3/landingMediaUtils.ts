export interface LandingMediaCandidate {
  mimeType?: string;
  sortOrder?: number;
}

export const LANDING_MEDIA_ASPECT_RATIO = "2880 / 1560";
export const LANDING_HERO_MAIN_ASPECT_RATIO = "2026 / 1080";

export function sortMediaByOrder<T extends LandingMediaCandidate>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

export function pickPreferredMedia<T extends LandingMediaCandidate>(
  items: T[],
  index = 0,
): T | undefined {
  const ordered = sortMediaByOrder(items);
  const videos = ordered.filter((item) => item.mimeType?.startsWith("video/"));
  if (videos.length > index) return videos[index];
  return ordered[index];
}
