/**
 * Retrieves the canonical base URL for the frontend application.
 *
 * Priority:
 * 1. NEXT_PUBLIC_SITE_URL (Canonical public URL)
 * 2. NEXTAUTH_URL (NextAuth fallback)
 * 3. http://127.0.0.1:3000 (Development fallback)
 */
export function getBaseUrl(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }

  if (process.env.NEXTAUTH_URL) {
    return process.env.NEXTAUTH_URL;
  }

  // Fallback for development
  return "http://127.0.0.1:3000";
}

/**
 * Helper to construct a full URL from a path.
 */
export function absoluteUrl(path: string): string {
  const base = getBaseUrl();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

/**
 * Retrieves the backend API base URL.
 *
 * Priority:
 * 1. API_PROXY_TARGET (Explicit backend URL)
 * 2. http://127.0.0.1:8000 (Development fallback)
 */
export function getBackendUrl(): string {
  if (process.env.API_PROXY_TARGET) {
    return process.env.API_PROXY_TARGET;
  }
  return "http://127.0.0.1:8000";
}
