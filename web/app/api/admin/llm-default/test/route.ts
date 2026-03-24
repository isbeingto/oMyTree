import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin-guard";

const API_URL = process.env.API_PROXY_TARGET || "http://127.0.0.1:8000";

export async function POST() {
  const { error, session } = await assertAdmin();
  if (error) return error;

  try {
    const response = await fetch(`${API_URL}/api/admin/llm-default/test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-omytree-admin-email": session?.user?.email || "unknown",
        "x-omytree-user-id": session?.user?.id || "",
      },
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err) {
    console.error("[admin/llm-default/test] Backend error:", err);
    return NextResponse.json(
      { ok: false, error: { code: "backend_error", message: "Backend unavailable" } },
      { status: 502 }
    );
  }
}
