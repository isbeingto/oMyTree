import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin-guard";

/**
 * GET /api/admin/llm-config
 * Get LLM configuration (kill switch status) - admin only
 */
export async function GET(request: NextRequest) {
  const { error } = await assertAdmin();
  if (error) return error;

  const API_URL = process.env.API_PROXY_TARGET || "http://127.0.0.1:8000";
  
  try {
    const response = await fetch(`${API_URL}/api/admin/llm-config`, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err) {
    console.error("[admin/llm-config] Backend error:", err);
    return NextResponse.json(
      { error: "Backend unavailable", code: "backend_error" },
      { status: 502 }
    );
  }
}

/**
 * POST /api/admin/llm-config
 * Update LLM configuration (kill switch) - admin only
 */
export async function POST(request: NextRequest) {
  const { error, session } = await assertAdmin();
  if (error) return error;

  const API_URL = process.env.API_PROXY_TARGET || "http://127.0.0.1:8000";
  
  try {
    const body = await request.json();
    
    const response = await fetch(`${API_URL}/api/admin/llm-config`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Pass admin user info for audit logging
        "x-omytree-admin-email": session?.user?.email || "unknown",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err) {
    console.error("[admin/llm-config] Backend error:", err);
    return NextResponse.json(
      { error: "Backend unavailable", code: "backend_error" },
      { status: 502 }
    );
  }
}
