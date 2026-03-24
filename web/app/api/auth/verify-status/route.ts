import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";


/**
 * GET /api/auth/verify-status
 * 
 * Returns current user's email verification status.
 * Used by Google OAuth login to determine if email verification is needed.
 * 
 * Returns:
 * {
 *   userId: string (user ID),
 *   email: string (user email),
 *   emailVerified: boolean (is email verified),
 * }
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // User must be authenticated
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized", code: "unauthorized" },
        { status: 401 }
      );
    }

    const client = await pool.connect();
    try {
      const res = await client.query(
        'SELECT id, email, "emailVerified" FROM users WHERE id = $1',
        [session.user.id]
      );

      const user = res.rows[0];

      if (!user) {
        return NextResponse.json(
          { error: "User not found", code: "user_not_found" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        userId: user.id,
        email: user.email,
        emailVerified: user.emailVerified !== null,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("[verify-status]", error);
    return NextResponse.json(
      { error: "Internal server error", code: "internal_error" },
      { status: 500 }
    );
  }
}
