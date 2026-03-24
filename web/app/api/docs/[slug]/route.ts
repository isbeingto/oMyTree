import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

/**
 * GET /api/docs/[slug]
 * Get a single published document by slug (public)
 * Query params: lang (optional, defaults to 'en')
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { slug } = await params;
  const searchParams = request.nextUrl.searchParams;
  const lang = searchParams.get("lang") || "en";

  try {
    const result = await pool.query(
      `SELECT id, title, slug, summary, content, lang, created_at, updated_at
       FROM site_docs
       WHERE slug = $1 AND lang = $2 AND status = 'published'`,
      [slug, lang]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ doc: result.rows[0] });
  } catch (err) {
    console.error("[api/docs/[slug]] GET error:", err);
    return NextResponse.json(
      { error: "Failed to fetch document" },
      { status: 500 }
    );
  }
}
