import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin-guard";
import { pool } from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/users/[id]/login-logs
 * 获取用户的登录日志
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { error } = await assertAdmin();
  if (error) return error;

  const { id } = await params;
  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
  const offset = parseInt(searchParams.get("offset") || "0", 10);
  const eventType = searchParams.get("event_type");

  try {
    // 验证用户是否存在
    const userResult = await pool.query(
      "SELECT id, email, created_at, last_login_at, last_login_ip, register_ip FROM users WHERE id = $1",
      [id]
    );

    if (userResult.rowCount === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const user = userResult.rows[0];

    // 构建查询
    let whereClause = "WHERE user_id = $1";
    const queryParams: (string | number)[] = [id];
    let paramIndex = 2;

    if (eventType) {
      whereClause += ` AND event_type = $${paramIndex}`;
      queryParams.push(eventType);
      paramIndex++;
    }

    // 获取登录日志
    const [logsResult, countResult] = await Promise.all([
      pool.query(
        `SELECT id, event_type, ip_address, user_agent, device_type, browser, os,
                auth_method, success, failure_reason, created_at
         FROM user_login_logs
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...queryParams, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*) as total FROM user_login_logs ${whereClause}`,
        queryParams
      ),
    ]);

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        last_login_at: user.last_login_at,
        last_login_ip: user.last_login_ip,
        register_ip: user.register_ip,
      },
      logs: logsResult.rows.map((log) => ({
        id: log.id,
        event_type: log.event_type,
        ip_address: log.ip_address,
        user_agent: log.user_agent,
        device_type: log.device_type,
        browser: log.browser,
        os: log.os,
        auth_method: log.auth_method,
        success: log.success,
        failure_reason: log.failure_reason,
        created_at: log.created_at,
      })),
      total: parseInt(countResult.rows[0]?.total ?? "0", 10),
      limit,
      offset,
    });
  } catch (err) {
    console.error("[admin/users/login-logs] GET error:", err);
    return NextResponse.json(
      { error: "Failed to fetch login logs" },
      { status: 500 }
    );
  }
}
