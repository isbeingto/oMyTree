import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/favicon
 * Serve dynamic favicon from system settings
 */
export async function GET(request: NextRequest) {
  try {
    const origin = request.nextUrl.origin;
    const API_URL = process.env.API_PROXY_TARGET || "http://127.0.0.1:8000";
    
    const response = await fetch(`${API_URL}/api/site/meta`, {
      cache: "no-store",
    });

    if (!response.ok) {
      // Return default favicon redirect
      return NextResponse.redirect(new URL("/favicon.ico", origin));
    }

    const data = await response.json();

    const favicon = data?.favicon;
    if (!favicon || typeof favicon !== "string") {
      return NextResponse.redirect(new URL("/favicon.ico", origin));
    }

    // Backward-compatible: if favicon is a path (e.g. "/favicon.svg") or an absolute URL.
    if (favicon.startsWith("/")) {
      return NextResponse.redirect(new URL(favicon, origin));
    }
    if (favicon.startsWith("http://") || favicon.startsWith("https://")) {
      return NextResponse.redirect(favicon);
    }

    if (!favicon.startsWith("data:image")) {
      return NextResponse.redirect(new URL("/favicon.ico", origin));
    }

    // Parse base64 data URL
    const matches = favicon.match(/^data:image\/([^;]+);base64,(.+)$/);
    if (!matches) {
      return NextResponse.redirect(new URL("/favicon.ico", origin));
    }

    const [, mimeType, base64Data] = matches;
    const buffer = Buffer.from(base64Data, "base64");

    // Return the favicon with appropriate headers
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": `image/${mimeType}`,
        "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("[favicon] Error:", error);
    return NextResponse.redirect(new URL("/favicon.ico", request.nextUrl.origin));
  }
}
