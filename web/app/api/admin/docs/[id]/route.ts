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

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/docs/[id]
 * Get a single document by ID (admin only)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { error } = await assertAdmin();
  if (error) return error;

  const { id } = await params;

  try {
    const base = await pool.query(
      "SELECT id, slug, COALESCE(doc_type, 'article') AS doc_type, version, created_at FROM site_docs WHERE id = $1",
      [id]
    );

    if (base.rowCount === 0) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const { slug, doc_type, version, created_at } = base.rows[0] as {
      slug: string;
      doc_type: "article" | "changelog" | null;
      version: string | null;
      created_at: string;
    };

    const docType: "article" | "changelog" = doc_type === "changelog" ? "changelog" : "article";

    const translationsResult = await pool.query(
      `SELECT id, lang, title, summary, content, created_at, updated_at
       FROM site_docs
       WHERE slug = $1 AND COALESCE(doc_type, 'article') = $2 AND lang IN ('en', 'zh-CN')
       ORDER BY (lang = 'en') DESC, updated_at DESC`,
      [slug, docType]
    );

    const translations: Partial<Record<DocLang, any>> = {};
    for (const row of translationsResult.rows) {
      if (row.lang === "en" || row.lang === "zh-CN") {
        translations[row.lang as DocLang] = {
          id: row.id,
          title: row.title,
          summary: row.summary,
          content: row.content,
        };
      }
    }

    return NextResponse.json({
      slug,
      doc_type: docType,
      version: version || "",
      publish_at: created_at,
      translations,
    });
  } catch (err) {
    console.error("[admin/docs/[id]] GET error:", err);
    return NextResponse.json(
      { error: "Failed to fetch document" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/docs/[id]
 * Update a document (admin only)
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { error } = await assertAdmin();
  if (error) return error;

  const { id } = await params;

  try {
    const body = await request.json();
    const { slug, doc_type, version, publish_at, translations } = body;

    const base = await pool.query(
      "SELECT id, slug, COALESCE(doc_type, 'article') AS doc_type FROM site_docs WHERE id = $1",
      [id]
    );
    if (base.rowCount === 0) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const current = base.rows[0] as { slug: string; doc_type: "article" | "changelog" | null };
    const currentDocType: "article" | "changelog" = current.doc_type === "changelog" ? "changelog" : "article";

    const newSlug = typeof slug === "string" ? slug.trim() : current.slug;
    if (!newSlug) return NextResponse.json({ error: "Slug is required" }, { status: 400 });

    const newDocType: "article" | "changelog" = doc_type === "changelog" ? "changelog" : currentDocType;
    const newVersion = newDocType === "changelog" ? (typeof version === "string" ? version.trim() : "") : "";
    if (newDocType === "changelog" && !newVersion) {
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

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const existingGroup = await client.query(
        `SELECT id, lang FROM site_docs WHERE slug = $1 AND COALESCE(doc_type, 'article') = $2 AND lang IN ('en', 'zh-CN')`,
        [current.slug, currentDocType]
      );
      const currentIds = existingGroup.rows.map((r) => r.id);
      if (currentIds.length === 0) currentIds.push(id);

      // Uniqueness check for new slug across both languages.
      for (const lang of ["en", "zh-CN"] as DocLang[]) {
        const conflict = await client.query(
          `SELECT id FROM site_docs WHERE slug = $1 AND lang = $2 AND NOT (id = ANY($3::uuid[]))`,
          [newSlug, lang, currentIds]
        );
        if (conflict.rowCount && conflict.rowCount > 0) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            { error: `A document with this slug already exists for ${lang}` },
            { status: 409 }
          );
        }
      }

      const createdAtSql = publishAt ? publishAt.toISOString() : null;
      const status = "published";

      const upsertOne = async (lang: DocLang) => {
        const row = existingGroup.rows.find((r) => r.lang === lang);
        const title = lang === "en" ? enTitle : zhTitle;
        const summary = lang === "en" ? enSummary : zhSummary;
        const content = lang === "en" ? enContent : zhContent;

        if (row?.id) {
          return client.query(
            `UPDATE site_docs
             SET title = $1, slug = $2, summary = $3, status = $4, lang = $5, content = $6,
                 doc_type = $7, version = $8, created_at = COALESCE($9, created_at), updated_at = NOW()
             WHERE id = $10
             RETURNING *`,
            [
              title,
              newSlug,
              summary || null,
              status,
              lang,
              content,
              newDocType,
              newDocType === "changelog" ? newVersion : null,
              createdAtSql,
              row.id,
            ]
          );
        }

        return client.query(
          `INSERT INTO site_docs (title, slug, summary, status, lang, content, doc_type, version, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, NOW()), NOW())
           RETURNING *`,
          [
            title,
            newSlug,
            summary || null,
            status,
            lang,
            content,
            newDocType,
            newDocType === "changelog" ? newVersion : null,
            createdAtSql,
          ]
        );
      };

      const enUpdated = await upsertOne("en");
      await upsertOne("zh-CN");

      // If slug/doc_type changed, we should also remove any old leftover rows in group.
      // (Kept intentionally minimal: current index ensures no duplicates per lang.)

      await client.query("COMMIT");
      return NextResponse.json({ doc: enUpdated.rows[0] });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[admin/docs/[id]] PUT error:", err);
    return NextResponse.json(
      { error: "Failed to update document" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/docs/[id]
 * Delete a document (admin only) - hard delete
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { error } = await assertAdmin();
  if (error) return error;

  const { id } = await params;

  try {
    const base = await pool.query(
      "SELECT slug, COALESCE(doc_type, 'article') AS doc_type FROM site_docs WHERE id = $1",
      [id]
    );

    if (base.rowCount === 0) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const { slug, doc_type } = base.rows[0] as { slug: string; doc_type: "article" | "changelog" | null };
    const docType: "article" | "changelog" = doc_type === "changelog" ? "changelog" : "article";

    const result = await pool.query(
      "DELETE FROM site_docs WHERE slug = $1 AND COALESCE(doc_type, 'article') = $2 AND lang IN ('en', 'zh-CN') RETURNING id",
      [slug, docType]
    );

    return NextResponse.json({ deleted: true, ids: result.rows.map((r) => r.id) });
  } catch (err) {
    console.error("[admin/docs/[id]] DELETE error:", err);
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 }
    );
  }
}
