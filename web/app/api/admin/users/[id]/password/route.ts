import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin-guard";
import { pool } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit-log";
import { writeLoginLog } from "@/lib/login-log";
import bcrypt from "bcryptjs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function getRequestIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() || null;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp && realIp.length > 0) {
    return realIp.trim();
  }

  return null;
}

/**
 * POST /api/admin/users/[id]/password
 * 管理员修改用户密码
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { session, error } = await assertAdmin();
  if (error) return error;

  const { id: userId } = await params;

  try {
    const body = await request.json();
    const { password } = body;

    // 验证密码
    if (!password || typeof password !== "string") {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // 检查用户是否存在
    const userResult = await pool.query(
      "SELECT id, email FROM users WHERE id = $1",
      [userId]
    );

    if (userResult.rowCount === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const user = userResult.rows[0];

    // 加密新密码
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 更新密码
    await pool.query(
      "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2",
      [passwordHash, userId]
    );

    // 记录审计日志
    const ip = getRequestIp(request);
    const traceId = request.headers.get("x-trace-id");
    const actorUserId = session.user.id;

    await writeAuditLog({
      actorUserId,
      actorRole: "admin",
      action: "admin.user.password_change",
      targetType: "user",
      targetId: userId,
      ip,
      traceId,
      metadata: {
        email: user.email,
        changed_by_admin: true,
      },
    });

    // 记录登录日志
    await writeLoginLog({
      userId,
      eventType: "password_change",
      ipAddress: ip,
      userAgent: request.headers.get("user-agent"),
      authMethod: "admin",
      success: true,
      metadata: {
        changed_by_admin_id: actorUserId,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (err) {
    console.error("[admin/users/password] POST error:", err);
    return NextResponse.json(
      { error: "Failed to update password" },
      { status: 500 }
    );
  }
}
