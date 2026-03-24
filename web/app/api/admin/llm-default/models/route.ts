import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin-guard";

const API_URL = process.env.API_PROXY_TARGET || "http://127.0.0.1:8000";

export async function GET() {
  const { error } = await assertAdmin();
  if (error) return error;

  try {
    const response = await fetch(`${API_URL}/api/admin/llm-default/models`, {
      headers: { "Content-Type": "application/json" },
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err) {
    console.error("[admin/llm-default/models] Backend error:", err);
    return NextResponse.json(
      { ok: false, error: { code: "backend_error", message: "Backend unavailable" } },
      { status: 502 }
    );
  }
}
