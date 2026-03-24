/**
 * Site Metadata Service
 * 
 * Fetches site metadata (favicon) from the backend API.
 * Used by generateMetadata in layout.tsx and page.tsx for SEO.
 */

// Default values if API is unavailable
const DEFAULT_META = {
  favicon: "",
};

export interface SiteMeta {
  favicon: string;
}

/**
 * Fetch site metadata from backend API
 * Uses server-side internal URL for SSR, falls back to defaults on error
 */
export async function getSiteMeta(): Promise<SiteMeta> {
  try {
    // Use internal API URL for server-side requests
    const apiUrl = process.env.API_PROXY_TARGET || "http://127.0.0.1:8000";
    
    const response = await fetch(`${apiUrl}/api/site/meta`, {
      next: { revalidate: 60 }, // Cache for 60 seconds
    });

    if (!response.ok) {
      console.error("[getSiteMeta] API returned", response.status);
      return DEFAULT_META;
    }

    const data = await response.json();
    return {
      favicon: data.favicon || DEFAULT_META.favicon,
    };
  } catch (error) {
    console.error("[getSiteMeta] Error fetching metadata:", error);
    return DEFAULT_META;
  }
}
