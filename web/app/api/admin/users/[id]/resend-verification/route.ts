import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin-guard";

const API_URL = process.env.API_PROXY_TARGET || "http://127.0.0.1:8000";

/**
 * POST /api/admin/users/[id]/resend-verification
 * Resend email verification for a user (admin only)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await assertAdmin();
  if (error) return error;

  const { id } = await params;

  try {
    const res = await fetch(`${API_URL}/api/admin/users/${id}/resend-verification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[admin/users/resend-verification] Proxy error:", err);
    return NextResponse.json(
      { error: "Failed to send verification email" },
      { status: 500 }
    );
  }
}
