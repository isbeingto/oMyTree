import { Pool, PoolClient } from "pg";
import { pool } from "@/lib/db";

export type LoginEventType = 
  | "register" 
  | "login" 
  | "logout" 
  | "password_change" 
  | "password_reset";

export interface LoginLogInput {
  userId: string;
  eventType: LoginEventType;
  ipAddress?: string | null;
  userAgent?: string | null;
  authMethod?: string;
  success?: boolean;
  failureReason?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface DeviceInfo {
  deviceType: string;
  browser: string;
  os: string;
}

/**
 * 解析 User-Agent 获取设备信息
 */
export function parseUserAgent(userAgent?: string | null): DeviceInfo {
  if (!userAgent) {
    return { deviceType: "unknown", browser: "unknown", os: "unknown" };
  }

  const ua = userAgent.toLowerCase();

  // 设备类型检测
  let deviceType = "desktop";
  if (/mobile|android|iphone|ipod|blackberry|opera mini|iemobile/i.test(ua)) {
    deviceType = "mobile";
  } else if (/ipad|tablet|playbook|silk/i.test(ua)) {
    deviceType = "tablet";
  }

  // 浏览器检测
  let browser = "unknown";
  if (ua.includes("edg/") || ua.includes("edge/")) {
    browser = "Edge";
  } else if (ua.includes("chrome") && !ua.includes("edg")) {
    browser = "Chrome";
  } else if (ua.includes("firefox")) {
    browser = "Firefox";
  } else if (ua.includes("safari") && !ua.includes("chrome")) {
    browser = "Safari";
  } else if (ua.includes("opera") || ua.includes("opr/")) {
    browser = "Opera";
  } else if (ua.includes("trident") || ua.includes("msie")) {
    browser = "IE";
  }

  // 操作系统检测
  let os = "unknown";
  if (ua.includes("windows")) {
    os = "Windows";
  } else if (ua.includes("mac os x") || ua.includes("macos")) {
    os = "macOS";
  } else if (ua.includes("linux") && !ua.includes("android")) {
    os = "Linux";
  } else if (ua.includes("android")) {
    os = "Android";
  } else if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) {
    os = "iOS";
  }

  return { deviceType, browser, os };
}

/**
 * 写入用户登录日志
 */
export async function writeLoginLog(
  input: LoginLogInput,
  client?: Pool | PoolClient
): Promise<void> {
  const runner = client ?? pool;
  const deviceInfo = parseUserAgent(input.userAgent);

  try {
    await runner.query(
      `INSERT INTO user_login_logs 
       (user_id, event_type, ip_address, user_agent, device_type, browser, os, auth_method, success, failure_reason, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        input.userId,
        input.eventType,
        input.ipAddress ?? null,
        input.userAgent ?? null,
        deviceInfo.deviceType,
        deviceInfo.browser,
        deviceInfo.os,
        input.authMethod ?? "credentials",
        input.success !== false,
        input.failureReason ?? null,
        input.metadata ?? {},
      ]
    );

    // 如果是登录事件且成功，更新用户的 last_login_at 和 last_login_ip
    if (input.eventType === "login" && input.success !== false) {
      await runner.query(
        `UPDATE users SET last_login_at = now(), last_login_ip = $1 WHERE id = $2`,
        [input.ipAddress ?? null, input.userId]
      );
    }

    // 如果是注册事件，更新 register_ip
    if (input.eventType === "register") {
      await runner.query(
        `UPDATE users SET register_ip = $1 WHERE id = $2 AND register_ip IS NULL`,
        [input.ipAddress ?? null, input.userId]
      );
    }
  } catch (err) {
    console.error("[login-log] failed to persist login log", err);
  }
}

/**
 * 获取用户的登录日志
 */
export async function getUserLoginLogs(
  userId: string,
  options?: { limit?: number; offset?: number; eventType?: LoginEventType }
): Promise<{
  logs: Array<{
    id: string;
    event_type: LoginEventType;
    ip_address: string | null;
    user_agent: string | null;
    device_type: string | null;
    browser: string | null;
    os: string | null;
    auth_method: string | null;
    success: boolean;
    failure_reason: string | null;
    created_at: string;
  }>;
  total: number;
}> {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  let whereClause = "WHERE user_id = $1";
  const params: (string | number)[] = [userId];
  let paramIndex = 2;

  if (options?.eventType) {
    whereClause += ` AND event_type = $${paramIndex}`;
    params.push(options.eventType);
    paramIndex++;
  }

  const [logsResult, countResult] = await Promise.all([
    pool.query(
      `SELECT id, event_type, ip_address, user_agent, device_type, browser, os, 
              auth_method, success, failure_reason, created_at
       FROM user_login_logs
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    ),
    pool.query(
      `SELECT COUNT(*) as total FROM user_login_logs ${whereClause}`,
      params
    ),
  ]);

  return {
    logs: logsResult.rows,
    total: parseInt(countResult.rows[0]?.total ?? "0", 10),
  };
}
