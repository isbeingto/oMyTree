import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin-guard";
import { pool } from "@/lib/db";

/**
 * GET /api/admin/users
 * List all users (admin only)
 * Query params: q (email search)
 */
export async function GET(request: NextRequest) {
  const { error } = await assertAdmin();
  if (error) return error;

  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get("q")?.trim();

  try {
    let query = `
      SELECT 
        id, 
        email, 
        name,
        plan,
        role, 
        is_active,
        "emailVerified",
        created_at,
        updated_at
      FROM users
    `;
    const params: any[] = [];

    if (q) {
      query += " WHERE email ILIKE $1";
      params.push(`%${q}%`);
    }

    query += " ORDER BY created_at DESC";

    const result = await pool.query(query, params);

    // Calculate stats
    const users = result.rows;
    const totalUsers = users.length;
    const adminCount = users.filter((u: any) => u.role === "admin").length;
    const activeCount = users.filter((u: any) => u.is_active).length;

    return NextResponse.json({
      users: users.map((u: any) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role || "user",
        plan: u.plan || "free",
        is_active: u.is_active !== false,
        email_verified: u.emailVerified ? u.emailVerified.toISOString() : null,
        created_at: u.created_at,
        last_login_at: null, // No last_login_at in current schema
      })),
      total: totalUsers,
      stats: {
        admins: adminCount,
        active: activeCount,
      },
    });
  } catch (err) {
    console.error("[admin/users] GET error:", err);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}
