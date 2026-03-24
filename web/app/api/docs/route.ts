import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

/**
 * GET /api/docs
 * List all published documents (public)
 * Query params: lang
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const lang = searchParams.get("lang");

  try {
    let query = `
      SELECT id, title, slug, summary, lang, doc_type, version, created_at, updated_at
      FROM site_docs
      WHERE status = 'published'
    `;
    const params: any[] = [];
    let paramIndex = 1;

    // Support doc_type filter; default to 'article' for backwards compat
    const docType = searchParams.get("doc_type");
    if (docType === "changelog") {
      query += ` AND doc_type = $${paramIndex++}`;
      params.push("changelog");
    } else {
      query += ` AND doc_type = $${paramIndex++}`;
      params.push("article");
    }

    if (lang) {
      query += ` AND lang = $${paramIndex++}`;
      params.push(lang);
    }

    query += " ORDER BY updated_at DESC";

    const result = await pool.query(query, params);

    return NextResponse.json({
      docs: result.rows,
      total: result.rowCount,
    });
  } catch (err) {
    console.error("[api/docs] GET error:", err);
    return NextResponse.json(
      { error: "Failed to fetch documents" },
      { status: 500 }
    );
  }
}
