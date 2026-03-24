import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { normalizeLang } from "@/lib/i18n";
import { getCountryFromRequest } from "@/lib/geoip";
import { writeAuditLog } from "@/lib/audit-log";
import { writeLoginLog } from "@/lib/login-log";
import bcrypt from "bcrypt";

const API_PROXY_TARGET = process.env.API_PROXY_TARGET || 'http://127.0.0.1:8000';
const RECAPTCHA_ACTION = "submit";
const RECAPTCHA_PROJECT_ID = process.env.RECAPTCHA_PROJECT_ID;
const RECAPTCHA_API_KEY = process.env.RECAPTCHA_API_KEY;
const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

async function verifyRecaptchaToken(token?: string | null, expectedAction = RECAPTCHA_ACTION) {
  // 1. 如果没有配置 Enterprise 凭据，跳过验证 (开发模式或未配置)
  if (!RECAPTCHA_PROJECT_ID || !RECAPTCHA_API_KEY || !RECAPTCHA_SITE_KEY) {
    console.warn("[auth/register] reCAPTCHA Enterprise credentials missing, skipping verification");
    return { ok: true as const, score: 1.0 };
  }

  if (!token) {
    return { ok: false as const, reason: "missing_token" };
  }

  try {
    // 2. 构建 Enterprise API 请求
    const url = `https://recaptchaenterprise.googleapis.com/v1/projects/${RECAPTCHA_PROJECT_ID}/assessments?key=${RECAPTCHA_API_KEY}`;
    const body = {
      event: {
        token: token,
        siteKey: RECAPTCHA_SITE_KEY,
        expectedAction: expectedAction,
      },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error("[auth/register] Enterprise API request failed:", response.status);
      // 失败时允许通过 (Fail Open)，避免阻断用户
      return { ok: true as const, score: 1.0, warning: "api_failed" };
    }

    const data = await response.json();
    console.log("[auth/register] Enterprise response:", JSON.stringify(data, null, 2));

    // 3. 检查 Token 有效性
    if (!data.tokenProperties?.valid) {
      console.error(`[auth/register] Invalid token: ${data.tokenProperties?.invalidReason}`);
      // 暂时允许 BROWSER_ERROR 通过，以便排查问题，但记录日志
      if (data.tokenProperties?.invalidReason === "BROWSER_ERROR") {
        console.warn("[auth/register] Allowing BROWSER_ERROR for debugging");
        return { ok: true as const, score: 0.5, warning: "browser_error_bypassed" };
      }
      return { ok: false as const, reason: data.tokenProperties?.invalidReason || "invalid_token" };
    }

    // 4. 检查 Action
    if (data.tokenProperties.action !== expectedAction) {
      console.warn(`[auth/register] Action mismatch: expected=${expectedAction}, got=${data.tokenProperties.action}`);
      // Action 不匹配通常是攻击或配置错误，建议拦截
      return { ok: false as const, reason: "action_mismatch" };
    }

    // 5. 返回分数
    const score = data.riskAnalysis?.score ?? 0;
    console.log(`[auth/register] Score: ${score}`);
    return { ok: true as const, score };

  } catch (err) {
    console.error("[auth/register] Network error calling Enterprise API:", err);
    // 网络错误允许通过 (Fail Open)
    return { ok: true as const, score: 1.0, warning: "network_error" };
  }
}

export async function POST(req: NextRequest) {
  try {
    const { email, password, preferred_language, recaptchaToken, recaptchaAction } = await req.json();
    const registrationCountry = getCountryFromRequest(req);

    // 获取请求 IP 和 User-Agent
    const forwarded = req.headers.get("x-forwarded-for");
    const realIp = req.headers.get("x-real-ip");
    const requestIp = forwarded
      ? forwarded.split(",")[0]?.trim()
      : realIp?.trim() ?? null;
    const userAgent = req.headers.get("user-agent");
    const traceId = req.headers.get("x-trace-id");

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    // Temporarily disabled due to China network block
    /*
    const recaptchaResult = await verifyRecaptchaToken(recaptchaToken, recaptchaAction || RECAPTCHA_ACTION);
    if (recaptchaResult.ok === false) {
      return NextResponse.json(
        { error: "reCAPTCHA verification failed", code: recaptchaResult.reason },
        { status: 400 }
      );
    }
    */

    const client = await pool.connect();
    try {
      // Check if user exists
      const existingUser = await client.query(
        "SELECT id FROM users WHERE email = $1",
        [email]
      );

      if (existingUser.rows.length > 0) {
        return NextResponse.json(
          { error: "User already exists" },
          { status: 400 }
        );
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      const lang = normalizeLang(preferred_language);

      // Create user
      let result;
      try {
        result = await client.query(
          `INSERT INTO users (email, password_hash, preferred_language, registration_country, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())
           RETURNING id, email, preferred_language, registration_country`,
          [email, hashedPassword, lang, registrationCountry]
        );
      } catch (err) {
        const code = (err as any)?.code;
        if (code === "42703") {
          console.warn("[auth/register] optional columns missing, retrying without registration_country");
          try {
            result = await client.query(
              `INSERT INTO users (email, password_hash, preferred_language, created_at, updated_at)
               VALUES ($1, $2, $3, NOW(), NOW())
               RETURNING id, email, preferred_language`,
              [email, hashedPassword, lang]
            );
          } catch (langErr) {
            const langErrCode = (langErr as any)?.code;
            if (langErrCode === "42703") {
              console.warn("[auth/register] preferred_language column missing, retrying with minimal insert");
              result = await client.query(
                `INSERT INTO users (email, password_hash, created_at, updated_at)
                 VALUES ($1, $2, NOW(), NOW())
                 RETURNING id, email`,
                [email, hashedPassword]
              );
            } else {
              throw langErr;
            }
          }
        } else {
          throw err;
        }
      }

      const newUser = result.rows[0];

      // 注册成功：写入审计日志
      void writeAuditLog({
        actorUserId: newUser.id,
        actorRole: "user",
        action: "user.register",
        targetType: "user",
        targetId: newUser.id,
        ip: requestIp,
        traceId,
        metadata: {
          email: newUser.email,
          provider: "credentials",
          registration_country: registrationCountry,
        },
      }).catch((err) => {
        console.error("[auth/register] failed to write audit log", err);
      });

      // 记录注册日志
      void writeLoginLog({
        userId: newUser.id,
        eventType: "register",
        ipAddress: requestIp,
        userAgent,
        authMethod: "credentials",
        success: true,
        metadata: {
          registration_country: registrationCountry,
        },
      }).catch((err) => {
        console.error("[auth/register] failed to write login log", err);
      });

      // Send verification email via API
      try {
        const verifyRes = await fetch(`${API_PROXY_TARGET}/api/auth/send-verification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: newUser.id })
        });
        
        if (!verifyRes.ok) {
          console.warn('[auth/register] Failed to send verification email:', await verifyRes.text());
        } else {
          console.log('[auth/register] Verification email sent for user:', newUser.id);
        }
      } catch (mailErr) {
        // Don't fail registration if email sending fails
        console.error('[auth/register] Error sending verification email:', mailErr);
      }

      return NextResponse.json({
        ok: true,
        userId: newUser.id,
        email: newUser.email,
        preferred_language: newUser.preferred_language || "en",
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
