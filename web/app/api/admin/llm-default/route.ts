import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin-guard";

const API_URL = process.env.API_PROXY_TARGET || "http://127.0.0.1:8000";

export async function GET() {
  const { error } = await assertAdmin();
  if (error) return error;

  try {
    const response = await fetch(`${API_URL}/api/admin/llm-default`, {
      headers: { "Content-Type": "application/json" },
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err) {
    console.error("[admin/llm-default] Backend error:", err);
    return NextResponse.json(
      { ok: false, error: { code: "backend_error", message: "Backend unavailable" } },
      { status: 502 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const { error, session } = await assertAdmin();
  if (error) return error;

  try {
    const body = await request.json();
    const response = await fetch(`${API_URL}/api/admin/llm-default`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-omytree-admin-email": session?.user?.email || "unknown",
        "x-omytree-user-id": session?.user?.id || "",
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err) {
    console.error("[admin/llm-default] Backend error:", err);
    return NextResponse.json(
      { ok: false, error: { code: "backend_error", message: "Backend unavailable" } },
      { status: 502 }
    );
  }
}
