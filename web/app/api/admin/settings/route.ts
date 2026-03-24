import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin-guard";

/**
 * GET /api/admin/settings
 * Get all system settings - admin only
 */
export async function GET(request: NextRequest) {
  const { error } = await assertAdmin();
  if (error) return error;

  const API_URL = process.env.API_PROXY_TARGET || "http://127.0.0.1:8000";
  
  try {
    const response = await fetch(`${API_URL}/api/admin/settings`, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err) {
    console.error("[admin/settings] Backend error:", err);
    return NextResponse.json(
      { error: "Backend unavailable", code: "backend_error" },
      { status: 502 }
    );
  }
}

/**
 * POST /api/admin/settings
 * Update system settings - admin only
 */
export async function POST(request: NextRequest) {
  const { error, session } = await assertAdmin();
  if (error) return error;

  const API_URL = process.env.API_PROXY_TARGET || "http://127.0.0.1:8000";
  
  try {
    const body = await request.json();
    
    const response = await fetch(`${API_URL}/api/admin/settings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-omytree-admin-email": session?.user?.email || "unknown",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err) {
    console.error("[admin/settings] Backend error:", err);
    return NextResponse.json(
      { error: "Backend unavailable", code: "backend_error" },
      { status: 502 }
    );
  }
}
