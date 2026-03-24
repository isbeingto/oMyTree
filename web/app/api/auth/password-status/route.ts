import { NextResponse } from "next/server";
import { getSafeServerSession } from "@/lib/auth";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * GET /api/auth/password-status
 * Returns whether the signed-in user has a password set (password_hash exists).
 */
export async function GET() {
  const session = await getSafeServerSession();

  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT password_hash IS NOT NULL AS has_password
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [session.user.id]
    );

    const hasPassword = Boolean(res.rows[0]?.has_password);
    return NextResponse.json({ ok: true, hasPassword });
  } catch (err) {
    console.error("[api/auth/password-status] Failed to load status", err);
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR" }, { status: 500 });
  } finally {
    client.release();
  }
}
