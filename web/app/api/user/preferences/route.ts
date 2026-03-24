import { NextResponse } from "next/server";
import { getSafeServerSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { normalizeLang, Lang } from "@/lib/i18n";

export async function PATCH(req: Request) {
  const session = await getSafeServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    
    // 准备更新字段和值
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // 处理 name 字段
    if (typeof body?.name === "string") {
      const trimmedName = body.name.trim();
      updates.push(`name = $${paramIndex++}`);
      values.push(trimmedName || null);
    }

    // 处理 preferred_language 字段
    if (typeof body?.preferred_language === "string") {
      const preferredLanguage: Lang = normalizeLang(body.preferred_language);
      updates.push(`preferred_language = $${paramIndex++}`);
      values.push(preferredLanguage);
    }

    // 如果没有更新字段，直接返回
    if (updates.length === 0) {
      return NextResponse.json({ ok: true, error: "No fields to update" }, { status: 400 });
    }

    // 添加 updated_at 和 user id
    updates.push(`updated_at = NOW()`);
    values.push(session.user.id);

    const client = await pool.connect();
    try {
      try {
        const query = `UPDATE users SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING name, preferred_language`;
        const result = await client.query(query, values);
        
        if (result.rows.length === 0) {
          return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const updatedUser = result.rows[0];
        return NextResponse.json({ 
          ok: true, 
          name: updatedUser.name,
          preferred_language: updatedUser.preferred_language 
        });
      } catch (err) {
        const code = (err as any)?.code;
        if (code === "42703") {
          console.warn("[user/preferences] Some columns missing");
          // 回退处理：仅更新支持的字段
          if (body?.preferred_language) {
            await client.query(
              "UPDATE users SET preferred_language = $1, updated_at = NOW() WHERE id = $2",
              [normalizeLang(body.preferred_language), session.user.id]
            );
            return NextResponse.json({ ok: true, preferred_language: normalizeLang(body.preferred_language) });
          }
        }
        throw err;
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Failed to update user preferences", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
