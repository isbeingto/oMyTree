// geoip-lite has compatibility issues with Next.js bundling
// Use a lazy-load approach to avoid build-time data file resolution
let geoipModule: typeof import("geoip-lite") | null = null;

async function getGeoip() {
  if (!geoipModule) {
    try {
      geoipModule = await import("geoip-lite");
    } catch {
      return null;
    }
  }
  return geoipModule;
}

const COUNTRY_HEADER_CANDIDATES = [
  "x-vercel-ip-country",
  "x-country",
  "cf-ipcountry",
  "x-geo-country",
  "x-real-country",
];

/**
 * Try to derive a coarse country code (ISO 3166-1 alpha-2) from the request.
 * Falls back to GeoIP lookup on the first forwarded IP if headers are absent.
 */
export function getCountryFromRequest(req: Request): string | null {
  for (const header of COUNTRY_HEADER_CANDIDATES) {
    const value = req.headers.get(header);
    if (value) return value.toUpperCase();
  }

  // Skip GeoIP lookup during build to avoid data file issues
  // In production, headers should provide the country code
  const forwardedFor = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
  const ip = forwardedFor?.split(",")[0]?.trim();
  if (!ip) return null;

  // For runtime, we skip synchronous geoip lookup as it causes bundling issues
  // Rely on upstream headers (e.g., cloudflare, nginx) for country detection
  return null;
}
