import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin-guard";
import { pool } from "@/lib/db";

type DocLang = "en" | "zh-CN";

function parsePublishAtOrNull(publish_at: unknown): Date | null {
  if (publish_at === undefined || publish_at === null || publish_at === "") return null;
  if (typeof publish_at !== "string") return null;
  const parsed = new Date(publish_at);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

/**
 * GET /api/admin/docs
 * List all documents (admin only)
 * Query params: status (all/draft/published), lang
 */
export async function GET(request: NextRequest) {
  const { error } = await assertAdmin();
  if (error) return error;

  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get("status") || "published";
  const lang = searchParams.get("lang");

  try {
    let query = `
      SELECT DISTINCT ON (slug, doc_type)
        id, title, slug, summary, status, lang, doc_type, version, created_at, updated_at
      FROM site_docs
    `;
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (status !== "all") {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    if (lang) {
      conditions.push(`lang = $${paramIndex++}`);
      params.push(lang);
    }

    const docType = searchParams.get("doc_type");
    if (docType && (docType === "article" || docType === "changelog")) {
      conditions.push(`doc_type = $${paramIndex++}`);
      params.push(docType);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    // Prefer English row for each (slug, doc_type) group when present.
    query += " ORDER BY slug ASC, doc_type ASC, (lang = 'en') DESC, updated_at DESC";

    const result = await pool.query(query, params);

    return NextResponse.json({
      docs: result.rows,
      total: result.rowCount,
    });
  } catch (err) {
    console.error("[admin/docs] GET error:", err);
    return NextResponse.json(
      { error: "Failed to fetch documents" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/docs
 * Create a new document (admin only)
 */
export async function POST(request: NextRequest) {
  const { session, error } = await assertAdmin();
  if (error) return error;

  try {
    const body = await request.json();
    const { slug, doc_type, version, publish_at, translations } = body;

    if (!slug || typeof slug !== "string" || slug.trim() === "") {
      return NextResponse.json({ error: "Slug is required" }, { status: 400 });
    }

    const docDocType: "article" | "changelog" = doc_type === "changelog" ? "changelog" : "article";
    const docVersion = docDocType === "changelog" ? (typeof version === "string" ? version.trim() : "") : "";
    if (docDocType === "changelog" && !docVersion) {
      return NextResponse.json({ error: "Version is required for changelog" }, { status: 400 });
    }

    const t = translations as
      | {
          en?: { title?: unknown; summary?: unknown; content?: unknown };
          "zh-CN"?: { title?: unknown; summary?: unknown; content?: unknown };
        }
      | undefined;

    const en = t?.en;
    const zh = t?.["zh-CN"];

    const enTitle = typeof en?.title === "string" ? en.title.trim() : "";
    const zhTitle = typeof zh?.title === "string" ? zh.title.trim() : "";
    const enContent = typeof en?.content === "string" ? en.content.trim() : "";
    const zhContent = typeof zh?.content === "string" ? zh.content.trim() : "";
    const enSummary = typeof en?.summary === "string" ? en.summary.trim() : "";
    const zhSummary = typeof zh?.summary === "string" ? zh.summary.trim() : "";

    if (!enTitle) return NextResponse.json({ error: "English title is required" }, { status: 400 });
    if (!zhTitle) return NextResponse.json({ error: "Chinese title is required" }, { status: 400 });
    if (!enSummary) return NextResponse.json({ error: "English summary is required" }, { status: 400 });
    if (!zhSummary) return NextResponse.json({ error: "Chinese summary is required" }, { status: 400 });
    if (!enContent) return NextResponse.json({ error: "English content is required" }, { status: 400 });
    if (!zhContent) return NextResponse.json({ error: "Chinese content is required" }, { status: 400 });

    const publishAt = parsePublishAtOrNull(publish_at);
    if (publish_at !== undefined && publish_at !== null && publish_at !== "" && !publishAt) {
      return NextResponse.json({ error: "publish_at is invalid" }, { status: 400 });
    }

    const createdAt = (publishAt ?? new Date()).toISOString();
    const updatedAt = createdAt;
    const docStatus = "published";

    // Create both docs in one transaction.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (const lang of ["en", "zh-CN"] as DocLang[]) {
        const existing = await client.query(
          "SELECT id FROM site_docs WHERE slug = $1 AND lang = $2",
          [slug.trim(), lang]
        );
        if (existing.rowCount && existing.rowCount > 0) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            { error: `A document with this slug already exists for ${lang}` },
            { status: 409 }
          );
        }
      }

      const insertSql = `INSERT INTO site_docs (title, slug, summary, status, lang, content, created_by, doc_type, version, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`;

      const enRow = await client.query(insertSql, [
        enTitle,
        slug.trim(),
        enSummary || null,
        docStatus,
        "en",
        enContent,
        session.user.id,
        docDocType,
        docDocType === "changelog" ? docVersion : null,
        createdAt,
        updatedAt,
      ]);

      await client.query(insertSql, [
        zhTitle,
        slug.trim(),
        zhSummary || null,
        docStatus,
        "zh-CN",
        zhContent,
        session.user.id,
        docDocType,
        docDocType === "changelog" ? docVersion : null,
        createdAt,
        updatedAt,
      ]);

      await client.query("COMMIT");
      return NextResponse.json({ doc: enRow.rows[0] }, { status: 201 });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[admin/docs] POST error:", err);
    return NextResponse.json(
      { error: "Failed to create document" },
      { status: 500 }
    );
  }
}
