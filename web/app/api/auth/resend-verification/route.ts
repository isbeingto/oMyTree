import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const API_PROXY_TARGET = process.env.API_PROXY_TARGET || 'http://127.0.0.1:8000';

export async function POST(req: NextRequest) {
  try {
    // 从请求体获取 userId（用于未登录场景）
    let body: { userId?: string } = {};
    try {
      body = await req.json();
    } catch {
      // 如果没有 body，从 session 获取
    }

    let userId = body.userId;

    // 如果没有传入 userId，从 session 获取
    if (!userId) {
      const session = await auth();
      if (!session?.user?.id) {
        return NextResponse.json(
          { error: "Unauthorized", code: "unauthorized" },
          { status: 401 }
        );
      }

      // 如果已验证，直接返回
      if (session.user.emailVerified) {
        return NextResponse.json({
          ok: true,
          alreadyVerified: true,
          message: "Email is already verified"
        });
      }

      userId = session.user.id;
    }

    // 调用 API 端重发验证邮件
    const res = await fetch(`${API_PROXY_TARGET}/api/auth/resend-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("[resend-verification] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
