import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin-guard";

/**
 * POST /api/admin/settings/favicon
 * Upload favicon - admin only
 */
export async function POST(request: NextRequest) {
  const { error, session } = await assertAdmin();
  if (error) return error;

  const API_URL = process.env.API_PROXY_TARGET || "http://127.0.0.1:8000";
  
  try {
    // Forward the form data to backend
    const formData = await request.formData();
    
    const response = await fetch(`${API_URL}/api/admin/settings/favicon`, {
      method: "POST",
      headers: {
        "x-omytree-admin-email": session?.user?.email || "unknown",
      },
      body: formData,
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err) {
    console.error("[admin/settings/favicon] Backend error:", err);
    return NextResponse.json(
      { error: "Backend unavailable", code: "backend_error" },
      { status: 502 }
    );
  }
}
