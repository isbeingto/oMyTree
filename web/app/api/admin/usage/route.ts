import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin-guard";

/**
 * GET /api/admin/usage
 * Proxy to backend API for user LLM usage statistics (admin only)
 */
export async function GET(request: NextRequest) {
  const { error } = await assertAdmin();
  if (error) return error;

  const API_URL = process.env.API_PROXY_TARGET || "http://127.0.0.1:8000";
  
  try {
    const response = await fetch(`${API_URL}/api/admin/usage`, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err) {
    console.error("[admin/usage] Backend error:", err);
    return NextResponse.json(
      { error: "Backend unavailable", code: "backend_error" },
      { status: 502 }
    );
  }
}
