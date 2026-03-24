import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import PostgresAdapter from "@auth/pg-adapter";
import { pool } from "@/lib/db";
import bcrypt from "bcrypt";
import { getServerSession } from "next-auth";
import { cookies, headers } from "next/headers";
import type { Lang } from "@/lib/i18n";
import { normalizeLang } from "@/lib/i18n";
import { writeAuditLog } from "@/lib/audit-log";
import { writeLoginLog } from "@/lib/login-log";

const DEFAULT_LANG: Lang = "en";
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return UUID_LIKE.test(trimmed) ? trimmed : null;
}

async function resolvePersistedUserId(
  user: { id?: unknown; email?: unknown } | null | undefined,
  account?: { provider?: unknown; providerAccountId?: unknown } | null,
): Promise<string | null> {
  const directUserId = normalizeUuid(user?.id);
  if (directUserId) {
    return directUserId;
  }

  const provider = typeof account?.provider === "string" ? account.provider : null;
  const providerAccountId =
    typeof account?.providerAccountId === "string" ? account.providerAccountId : null;
  const email = typeof user?.email === "string" ? user.email.trim() : null;

  if ((!provider || !providerAccountId) && !email) {
    return null;
  }

  const client = await pool.connect();
  try {
    if (provider && providerAccountId) {
      const accountResult = await client.query(
        `SELECT "userId" FROM accounts WHERE provider = $1 AND "providerAccountId" = $2 LIMIT 1`,
        [provider, providerAccountId],
      );
      const accountUserId = normalizeUuid(accountResult.rows[0]?.userId);
      if (accountUserId) {
        return accountUserId;
      }
    }

    if (email) {
      const userResult = await client.query(
        `SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
        [email],
      );
      const emailUserId = normalizeUuid(userResult.rows[0]?.id);
      if (emailUserId) {
        return emailUserId;
      }
    }

    return null;
  } finally {
    client.release();
  }
}

async function readPersistedUserIsActive(userId: string): Promise<boolean | null> {
  const client = await pool.connect();
  try {
    const result = await client.query(`SELECT is_active FROM users WHERE id = $1 LIMIT 1`, [userId]);
    if (!result.rows[0]) {
      return null;
    }
    return result.rows[0].is_active !== false;
  } catch (err) {
    const code = (err as any)?.code;
    if (code === "42703") {
      return null;
    }
    throw err;
  } finally {
    client.release();
  }
}

async function ensureEmailVerified(userId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE users SET "emailVerified" = COALESCE("emailVerified", NOW()) WHERE id = $1 AND "emailVerified" IS NULL`,
      [userId],
    );
  } finally {
    client.release();
  }
}

function parseLang(raw?: unknown): Lang | null {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return null;
  if (
    normalized === "zh" ||
    normalized === "zh-cn" ||
    normalized === "zh-hans" ||
    normalized === "zh-hans-cn" ||
    normalized.startsWith("zh-")
  ) {
    return "zh-CN";
  }
  if (normalized === "en" || normalized.startsWith("en-")) {
    return "en";
  }
  return null;
}

function detectLangFromAcceptLanguage(acceptLang: string | null): Lang {
  if (!acceptLang) return DEFAULT_LANG;
  const weighted = acceptLang
    .split(",")
    .map((part) => {
      const [lang, qPart] = part.trim().split(";");
      const q = qPart ? Number.parseFloat(qPart.replace("q=", "")) : 1;
      return { lang, q: Number.isFinite(q) ? q : 0 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { lang } of weighted) {
    const parsed = parseLang(lang);
    if (parsed) return parsed;
  }
  return DEFAULT_LANG;
}

async function detectRequestPreferredLanguage(profileLocale?: unknown): Promise<Lang> {
  try {
    const cookieStore = await cookies();
    const localeCookie = cookieStore.get("locale")?.value;
    const fromCookie = parseLang(localeCookie);
    if (fromCookie) return fromCookie;

    const headerStore = await headers();
    const fromSiteHeader = parseLang(headerStore.get("x-site-locale"));
    if (fromSiteHeader) return fromSiteHeader;

    return detectLangFromAcceptLanguage(headerStore.get("accept-language"));
  } catch {
    const fromProfile = parseLang(profileLocale);
    return fromProfile || DEFAULT_LANG;
  }
}

async function readStoredPreferredLanguage(userId: string): Promise<Lang | null> {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT preferred_language FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    return parseLang(res.rows[0]?.preferred_language);
  } catch (err) {
    const code = (err as any)?.code;
    if (code === "42703") {
      return null;
    }
    throw err;
  } finally {
    client.release();
  }
}

async function persistPreferredLanguage(userId: string, lang: Lang): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE users SET preferred_language = $1, updated_at = NOW() WHERE id = $2`,
      [lang, userId]
    );
  } catch (err) {
    const code = (err as any)?.code;
    if (code !== "42703") {
      throw err;
    }
  } finally {
    client.release();
  }
}

// Determine if we're in production (HTTPS) environment
const useSecureCookies = process.env.NEXTAUTH_URL?.startsWith("https://") ?? true;
const cookiePrefix = useSecureCookies ? "__Secure-" : "";

export const authOptions: NextAuthOptions = {
  adapter: PostgresAdapter(pool),
  session: {
    strategy: "jwt",
  },
  events: {
    async signIn(message) {
      // NextAuth events 不提供 request 对象，因此这里仅保证“事件会被审计”。
      // IP/User-Agent 将由后续带 request 上下文的路由（例如 /api/auth/session-init）补齐到登录日志中。

      const account = (message as any)?.account;
      const user = (message as any)?.user;
      const isNewUser = (message as any)?.isNewUser === true;

      const provider = account?.provider;
      if (!provider || provider === "credentials") {
        return;
      }

      let userId: string | null = null;
      try {
        userId = await resolvePersistedUserId(user, account);
      } catch (err) {
        console.error("[auth] Failed to resolve persisted OAuth user id for event:", err);
        return;
      }
      if (!userId) {
        return;
      }

      if (provider === "google") {
        void ensureEmailVerified(userId).catch((err) => {
          console.error("[auth] Failed to set emailVerified for Google user:", err);
        });
      }

      const actorRole = (user as any)?.role || "user";
      const email = user?.email || null;

      // OAuth 登录事件审计
      void writeAuditLog({
        actorUserId: userId,
        actorRole,
        action: "user.login",
        targetType: "user",
        targetId: userId,
        ip: null,
        traceId: null,
        metadata: {
          email,
          provider,
        },
      }).catch((err) => {
        console.error("[auth] Failed to write OAuth audit log", err);
      });

      void writeLoginLog({
        userId,
        eventType: "login",
        ipAddress: null,
        userAgent: null,
        authMethod: provider,
        success: true,
      }).catch((err) => {
        console.error("[auth] Failed to write OAuth login log", err);
      });

      // OAuth 首次创建用户：补一条 register 审计/日志（只在 isNewUser=true 时触发）
      if (isNewUser) {
        void writeAuditLog({
          actorUserId: userId,
          actorRole,
          action: "user.register",
          targetType: "user",
          targetId: userId,
          ip: null,
          traceId: null,
          metadata: {
            email,
            provider,
          },
        }).catch((err) => {
          console.error("[auth] Failed to write OAuth register audit log", err);
        });

        void writeLoginLog({
          userId,
          eventType: "register",
          ipAddress: null,
          userAgent: null,
          authMethod: provider,
          success: true,
        }).catch((err) => {
          console.error("[auth] Failed to write OAuth register login log", err);
        });
      }
    },
  },
  // Cookie configuration optimized for WebView compatibility (Baidu App, WeChat, etc.)
  // Some in-app browsers have stricter cookie handling that can break OAuth flows
  cookies: {
    sessionToken: {
      name: `${cookiePrefix}next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    callbackUrl: {
      name: `${cookiePrefix}next-auth.callback-url`,
      options: {
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    csrfToken: {
      // Use non-host-prefixed cookie name for better WebView compatibility
      // Host-prefixed cookies (__Host-) have stricter requirements that some WebViews don't handle well
      name: `${cookiePrefix}next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    pkceCodeVerifier: {
      name: `${cookiePrefix}next-auth.pkce.code_verifier`,
      options: {
        httpOnly: true,
        sameSite: "lax",  // Changed from 'none' which some WebViews block
        path: "/",
        secure: useSecureCookies,
        maxAge: 900, // 15 minutes
      },
    },
    state: {
      name: `${cookiePrefix}next-auth.state`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
        maxAge: 900, // 15 minutes
      },
    },
    nonce: {
      name: `${cookiePrefix}next-auth.nonce`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      allowDangerousEmailAccountLinking: true,
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, req) {
        console.log("Authorize called with:", credentials?.email);
        if (!credentials?.email || !credentials?.password) {
          console.log("Missing credentials");
          return null;
        }

        const client = await pool.connect();
        try {
          const res = await client.query("SELECT * FROM users WHERE email = $1", [credentials.email]);
          const user = res.rows[0];

          if (!user) {
            console.log("User not found");
            return null;
          }

          // If user has no password_hash (e.g. created via OAuth), return null for credentials login
          if (!user.password_hash) {
            console.log("User has no password hash");
            return null;
          }

          const isValid = await bcrypt.compare(credentials.password, user.password_hash);

          if (!isValid) {
            console.log("Invalid password");
            return null;
          }

          // Check if account is disabled
          if (user.is_active === false) {
            console.log("Account disabled:", user.email);
            // Throw specific error for disabled accounts
            throw new Error("AccountDisabled");
          }

          console.log("User authenticated:", user.id);

          const forwarded = typeof req?.headers?.["x-forwarded-for"] === "string"
            ? req.headers["x-forwarded-for"].split(",")[0]?.trim()
            : undefined;
          const realIp = typeof req?.headers?.["x-real-ip"] === "string" ? req.headers["x-real-ip"] : undefined;
          const ip = forwarded || realIp || null;
          const traceId = typeof req?.headers?.["x-trace-id"] === "string" ? req.headers["x-trace-id"] : null;
          const userAgent = typeof req?.headers?.["user-agent"] === "string" ? req.headers["user-agent"] : null;

          // 异步记录审计日志和登录日志（不阻塞认证流程）
          // 使用Promise.all确保错误被捕获
          Promise.all([
            writeAuditLog({
              actorUserId: user.id,
              actorRole: user.role || "user",
              action: "user.login",
              targetType: "user",
              targetId: user.id,
              ip,
              traceId,
              metadata: {
                email: user.email,
                provider: "credentials",
              },
            }).catch(err => {
              console.error("[auth] Failed to write credentials audit log:", err);
            }),
            writeLoginLog({
              userId: user.id,
              eventType: "login",
              ipAddress: ip,
              userAgent,
              authMethod: "credentials",
              success: true,
            }).catch(err => {
              console.error("[auth] Failed to write credentials login log:", err);
            }),
          ]).catch(() => {
            // Errors already logged above, just ensure they don't break the auth flow
          });

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            preferred_language: normalizeLang(user.preferred_language) || DEFAULT_LANG,
            role: user.role || "user",
            plan: user.plan || "free",
            is_active: user.is_active !== false, // default to true if undefined
            emailVerified: user.emailVerified ? user.emailVerified.toISOString() : null,
            created_at: user.created_at ? user.created_at.toISOString() : null,
            enable_advanced_context: user.enable_advanced_context === true,
          };
        } catch (e) {
          // Re-throw AccountDisabled error so NextAuth can handle it
          if (e instanceof Error && e.message === "AccountDisabled") {
            console.log("Re-throwing AccountDisabled error");
            throw e;
          }
          console.error("Authorize error:", e);
          return null;
        } finally {
          client.release();
        }
      }
    })
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      // Handle OAuth provider sign-in
      if (account?.provider === "google") {
        let isActive =
          user && "is_active" in user
            ? (user as { is_active?: boolean | null }).is_active !== false
            : null;

        let persistedUserId: string | null = null;
        try {
          persistedUserId = await resolvePersistedUserId(user, account);
        } catch (err) {
          console.warn("[auth] Failed to resolve persisted Google user id during sign-in:", err);
        }
        if (persistedUserId) {
          try {
            const persistedIsActive = await readPersistedUserIsActive(persistedUserId);
            if (persistedIsActive !== null) {
              isActive = persistedIsActive;
            }
          } catch (err) {
            console.warn("[auth] Failed to read persisted Google user status:", err);
          }
        }

        if (isActive === false) {
          console.log("Blocked disabled account attempting Google sign-in:", user.email);
          return false;
        }

        console.log("Google sign-in allowed for user:", user?.email);
        return true;
      }

      // Allow credentials sign-in (provider: "credentials")
      if (account?.provider === "credentials") {
        console.log("[signIn] Credentials login allowed for user:", user?.email);
        return true;
      }

      // Default: deny unknown providers
      console.log("[signIn] Unknown provider, denying. Provider:", account?.provider);
      return false;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.sub as string;
        session.user.name = (token as any).name || null;
        session.user.email = (token as any).email || session.user.email;
        session.user.preferred_language = (token as any).preferred_language || DEFAULT_LANG;
        session.user.role = (token as any).role || "user";
        session.user.plan = (token as any).plan || "free";
        session.user.is_active = (token as any).is_active !== false;
        session.user.emailVerified = (token as any).emailVerified || null;
        (session.user as any).created_at = (token as any).created_at || null;
        (session.user as any).enable_advanced_context = (token as any).enable_advanced_context === true;
      }
      return session;
    },
    async jwt({ token, user, account, profile, isNewUser }) {
      if (user) {
        let resolvedUserId = normalizeUuid(user.id);
        if (!resolvedUserId && account?.provider && account.provider !== "credentials") {
          try {
            resolvedUserId = await resolvePersistedUserId(user, account);
          } catch (err) {
            console.warn("[auth] Failed to resolve persisted OAuth user id:", err);
          }
        }
        if (resolvedUserId) {
          token.sub = resolvedUserId;
        }

        (token as any).name = (user as any).name || null;
        (token as any).email = user.email || null;
        (token as any).role = (user as any).role || "user";
        (token as any).plan = (user as any).plan || "free";
        (token as any).is_active = (user as any).is_active !== false;
        const rawEmailVerified = (user as any).emailVerified;
        (token as any).emailVerified =
          rawEmailVerified instanceof Date
            ? rawEmailVerified.toISOString()
            : typeof rawEmailVerified === "string"
              ? rawEmailVerified
              : account?.provider === "google"
                ? new Date().toISOString()
                : null;
        (token as any).created_at = (user as any).created_at || null;
        (token as any).enable_advanced_context = (user as any).enable_advanced_context === true;

        let resolvedLang = parseLang((user as any).preferred_language);
        let storedLang: Lang | null = null;
        if (resolvedUserId) {
          try {
            storedLang = await readStoredPreferredLanguage(resolvedUserId);
          } catch (err) {
            console.warn("[auth] Failed to read stored preferred_language:", err);
          }
          if (!resolvedLang && storedLang) {
            resolvedLang = storedLang;
          }
        }

        const shouldInferFromRequest =
          isNewUser === true && account?.provider && account.provider !== "credentials";
        if (shouldInferFromRequest) {
          const requestLang = await detectRequestPreferredLanguage((profile as any)?.locale);
          resolvedLang = requestLang;
          if (resolvedUserId && storedLang !== requestLang) {
            try {
              await persistPreferredLanguage(resolvedUserId, requestLang);
            } catch (err) {
              console.warn("[auth] Failed to persist preferred_language for new OAuth user:", err);
            }
          }
        }

        (token as any).preferred_language = resolvedLang || DEFAULT_LANG;
        return token;
      }

      if (token.sub) {
        try {
          const client = await pool.connect();
          try {
            const res = await client.query(
              `SELECT name, email, preferred_language, role, plan, is_active, "emailVerified", created_at, enable_advanced_context FROM users WHERE id = $1`,
              [token.sub]
            );
            const row = res.rows[0];
            const lang = normalizeLang(row?.preferred_language);
            (token as any).name = row?.name || null;
            (token as any).email = row?.email || (token as any).email;
            (token as any).preferred_language = lang || (token as any).preferred_language || DEFAULT_LANG;
            (token as any).role = row?.role || (token as any).role || "user";
            (token as any).plan = row?.plan || (token as any).plan || "free";
            (token as any).is_active = row?.is_active !== false;
            (token as any).emailVerified = row?.emailVerified ? row.emailVerified.toISOString() : null;
            (token as any).created_at = row?.created_at ? row.created_at.toISOString() : null;
            (token as any).enable_advanced_context = row?.enable_advanced_context === true;
          } catch (err) {
            const code = (err as any)?.code;
            if (code === "42703") {
              console.warn("[auth] Some user columns missing, falling back to cached values");
              (token as any).preferred_language = (token as any).preferred_language || DEFAULT_LANG;
            } else {
              throw err;
            }
          } finally {
            client.release();
          }
        } catch (err) {
          console.error("Failed to refresh user token", err);
        }
      }

      return token;
    }
  },
  // Custom pages configuration
  pages: {
    signIn: "/auth/login",
    error: "/auth/login", // Redirect OAuth errors to login page with error query param
  },
  secret: process.env.NEXTAUTH_SECRET,
  // Enable debug logging in development for OAuth troubleshooting
  debug: process.env.NODE_ENV === "development",
};

export async function getSafeServerSession() {
  // E2E bypass: allow Playwright/dev flows without real auth/DB
  if (process.env.E2E_AUTH_BYPASS === "1") {
    const lang = normalizeLang(process.env.E2E_PREF_LANG) || DEFAULT_LANG;
    const advanced = process.env.E2E_ADVANCED_CONTEXT === "1";
    return {
      user: {
        id: process.env.E2E_USER_ID || "e2e-user",
        email: process.env.E2E_USER_EMAIL || "e2e@example.com",
        name: process.env.E2E_USER_NAME || "E2E User",
        preferred_language: lang,
        role: "user",
        is_active: true,
        emailVerified: new Date().toISOString(),
        created_at: new Date().toISOString(),
        enable_advanced_context: advanced,
      },
    } as any;
  }

  try {
    return await getServerSession(authOptions);
  } catch (err) {
    if ((err as any)?.digest === 'DYNAMIC_SERVER_USAGE') {
      // Re-throw to let Next.js handle dynamic server usage during build/static generation
      throw err;
    }

    // Handle null/undefined errors safely
    if (!err) {
      console.warn("[auth] getServerSession failed with null/undefined error, treating as unauthenticated");
      return null;
    }

    const digest = (err as any)?.digest;
    const reason = digest
      ? `digest=${digest}`
      : err instanceof Error
        ? err.message
        : String(err);
    console.warn("[auth] getServerSession failed, treating as unauthenticated session:", reason);
    return null;
  }
}

export const auth = () => getSafeServerSession();

import type { Session } from "next-auth";

/**
 * Check if the session user is an active admin.
 * Returns true only if:
 * 1. Session exists and has a user
 * 2. User is_active is true
 * 3. User role is 'admin'
 */
export function isAdmin(session: Session | null | undefined): boolean {
  if (!session?.user) {
    return false;
  }
  // User must be active
  if (session.user.is_active === false) {
    return false;
  }
  // User must have admin role
  return session.user.role === "admin";
}
