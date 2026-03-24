/**
 * T25-2: Forgot Password API Proxy
 * Proxies forgot password requests to backend
 */

import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_PROXY_TARGET || "http://127.0.0.1:8000";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch(`${API_URL}/api/auth/forgot-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("[forgot-password] Proxy error:", error);
    return NextResponse.json(
      { error: "发送重置邮件失败，请稍后重试" },
      { status: 500 }
    );
  }
}
