import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin-guard";

/**
 * GET /api/admin/health
 * Health check endpoint for admin API.
 * Only accessible by authenticated admin users.
 */
export async function GET() {
  const { session, error } = await assertAdmin();
  
  if (error) {
    return error;
  }
  
  return NextResponse.json({
    ok: true,
    user: {
      id: session.user.id,
      email: session.user.email,
      role: session.user.role,
    },
    timestamp: new Date().toISOString(),
  });
}
