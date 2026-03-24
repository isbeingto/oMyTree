import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pool } from "@/lib/db";
import { parseUserAgent } from "@/lib/login-log";
import { headers } from "next/headers";

/**
 * 这个路由在客户端初始化会话时被调用
 * 用于在Google OAuth登录时补充IP地址和User-Agent信息
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // 获取当前请求的IP和User-Agent
    const headersList = await headers();
    const forwarded = headersList.get("x-forwarded-for");
    const realIp = headersList.get("x-real-ip");
    const ip = forwarded?.split(",")[0]?.trim() || realIp;
    const userAgent = headersList.get("user-agent");

    // 解析设备信息
    const deviceInfo = parseUserAgent(userAgent);

    // 尝试为 OAuth 登录/注册审计补齐真实 IP（NextAuth events 缺少 request 上下文时会先写入 ip=null）
    // 仅回填 provider!=credentials 的登录/注册事件，避免误改 credentials 的已有审计。
    try {
      if (ip) {
        const recent = await pool.query(
          `SELECT id
           FROM audit_logs
           WHERE actor_user_id = $1
             AND action IN ('user.login', 'user.register')
             AND ip IS NULL
             AND (metadata->>'provider') IS NOT NULL
             AND (metadata->>'provider') <> 'credentials'
             AND created_at > NOW() - INTERVAL '10 minutes'
           ORDER BY created_at DESC
           LIMIT 5`,
          [session.user.id]
        );

        for (const row of recent.rows) {
          await pool.query(
            `UPDATE audit_logs
             SET ip = $1,
                 metadata = CASE
                   WHEN $2::text IS NULL THEN metadata
                   ELSE metadata || jsonb_build_object('user_agent', $2)
                 END
             WHERE id = $3`,
            [ip, userAgent, row.id]
          );
        }
      }
    } catch (err) {
      console.error("[session-init] Failed to backfill audit ip", err);
    }

    // 直接更新最近的登录日志（缺少IP的），而不是创建新记录
    // 同时更新 register 和 login 事件
    try {
      const updateResult = await pool.query(
        `UPDATE user_login_logs
         SET ip_address = $1,
             user_agent = $2,
             device_type = $3,
             browser = $4,
             os = $5
         WHERE user_id = $6
           AND ip_address IS NULL
           AND COALESCE(auth_method, '') <> 'credentials'
           AND created_at > NOW() - INTERVAL '10 minutes'`,
        [
          ip,
          userAgent,
          deviceInfo.deviceType,
          deviceInfo.browser,
          deviceInfo.os,
          session.user.id,
        ]
      );

      // 同步更新 users 表的 last_login_ip 和 register_ip
      if (ip && updateResult.rowCount && updateResult.rowCount > 0) {
        await pool.query(
          `UPDATE users 
           SET last_login_ip = COALESCE(last_login_ip, $1),
               register_ip = COALESCE(register_ip, $1)
           WHERE id = $2`,
          [ip, session.user.id]
        );
      }

      console.log(`[session-init] Updated ${updateResult.rowCount} login logs for user ${session.user.id}`);
    } catch (err) {
      console.error("[session-init] Failed to backfill login logs", err);
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("[session-init] Error:", error);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
