import { NextResponse } from "next/server";

const API_BASE = process.env.API_PROXY_TARGET || "http://127.0.0.1:8000";

export async function POST() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/llm-default/models/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: { code: "PROXY_ERROR", message: String(err) } },
      { status: 502 }
    );
  }
}
