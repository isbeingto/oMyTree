"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Lock } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { 
  AuthLayout, 
  AuthCard, 
  AuthInput, 
  AuthPrimaryButton, 
  SocialLoginSection,
  useAuthLang
} from "@/app/auth/_components/AuthLayout";
import { t } from "@/lib/i18n";

// 声明 grecaptcha 类型 (支持 Enterprise 和 v3)
declare global {
  interface Window {
    grecaptcha?: {
      enterprise?: {
        ready: (callback: () => void) => void;
        execute: (siteKey: string, options: { action: string }) => Promise<string>;
      };
      ready?: (callback: () => void) => void;
      execute?: (siteKey: string, options: { action: string }) => Promise<string>;
    };
  }
}

const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "";
const RECAPTCHA_ACTION = "submit";
const SHOULD_USE_RECAPTCHA = false; // Boolean(RECAPTCHA_SITE_KEY); // temporarily disabled due to network block in mainland China

function RegisterFallback() {
  const { lang } = useAuthLang();
  return (
    <AuthCard title={t(lang, "auth_register_title")}>
      <div className="flex items-center justify-center py-8">
        <Spinner size="md" />
      </div>
    </AuthCard>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recaptchaReady, setRecaptchaReady] = useState(!SHOULD_USE_RECAPTCHA);
  const { lang } = useAuthLang();

  const fromParam = searchParams.get("from");

  const sanitizeFromPath = (raw?: string | null) => {
    if (raw && raw.startsWith("/")) {
      return raw;
    }
    return "/app";
  };

  const targetPath = sanitizeFromPath(fromParam);

  // 初始化 reCAPTCHA 脚本 (Enterprise)
  useEffect(() => {
    if (!SHOULD_USE_RECAPTCHA) {
      return;
    }
    if (typeof window === "undefined") return;

    if (window.grecaptcha?.enterprise?.ready) {
      setRecaptchaReady(true);
      return;
    }

    const script = document.createElement("script");
    // 使用 Enterprise 脚本
    script.src = `https://www.google.com/recaptcha/enterprise.js?render=${RECAPTCHA_SITE_KEY}`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      console.log("[auth/register] reCAPTCHA Enterprise loaded");
      setRecaptchaReady(true);
    };
    script.onerror = () => {
      console.error("[auth/register] reCAPTCHA Enterprise failed to load");
      setRecaptchaReady(false);
    };
    document.head.appendChild(script);
  }, []);

  const executeRecaptcha = async (): Promise<string | null> => {
    if (!SHOULD_USE_RECAPTCHA || typeof window === "undefined") return null;
    
    const grecaptcha = window.grecaptcha;
    // 优先使用 Enterprise 方法
    if (grecaptcha?.enterprise?.ready) {
      return new Promise((resolve, reject) => {
        grecaptcha.enterprise!.ready(() => {
          grecaptcha.enterprise!.execute(RECAPTCHA_SITE_KEY, { action: RECAPTCHA_ACTION })
            .then(resolve)
            .catch(reject);
        });
      });
    }
    // 降级兼容
    if (grecaptcha?.ready && grecaptcha?.execute) {
      return new Promise((resolve, reject) => {
        grecaptcha.ready!(() => {
          grecaptcha.execute!(RECAPTCHA_SITE_KEY, { action: RECAPTCHA_ACTION })
            .then(resolve)
            .catch(reject);
        });
      });
    }
    
    return null;
  };

  useEffect(() => {
    if (status === "authenticated" && session?.user?.id) {
      router.replace(targetPath);
    }
  }, [status, session, router, targetPath]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email || !password) {
      setErrorMessage(t(lang, "auth_error_email_password_required"));
      return;
    }

    if (!email.includes("@")) {
      setErrorMessage(t(lang, "auth_error_invalid_email"));
      return;
    }

    if (password.length < 8) {
      setErrorMessage(t(lang, "auth_error_password_too_short"));
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      const recaptchaToken = await executeRecaptcha().catch((err) => {
        console.error("[auth/register] reCAPTCHA execute failed:", err);
        return null;
      });

      if (SHOULD_USE_RECAPTCHA && !recaptchaToken) {
        setErrorMessage(t(lang, "auth_error_verification_failed"));
        setIsSubmitting(false);
        return;
      }

      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email, 
          password, 
          preferred_language: lang,
          recaptchaToken,
          recaptchaAction: RECAPTCHA_ACTION,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: unknown;
        code?: unknown;
        userId?: string;
        email?: string;
      };

      if (!response.ok) {
        const apiMessage =
          typeof data?.error === "string" ? data.error : undefined;
        const apiCode = typeof data?.code === "string" ? data.code : undefined;
        const normalizedMessage =
          (apiMessage ?? apiCode ?? "").toLowerCase() || undefined;

        if (response.status === 409 || normalizedMessage?.includes("exists")) {
          setErrorMessage(t(lang, "auth_error_email_exists"));
        } else if (normalizedMessage?.includes("recaptcha")) {
          setErrorMessage(t(lang, "auth_error_recaptcha_failed"));
        } else if (apiMessage) {
          setErrorMessage(apiMessage);
        } else {
          setErrorMessage(t(lang, "auth_error_generic"));
        }
        return;
      }

      // 注册成功，跳转到邮箱验证页面
      const verifyParams = new URLSearchParams({
        userId: data.userId || "",
        email: email,
      });
      if (fromParam) {
        verifyParams.set("from", fromParam);
      }
      router.push(`/auth/verify-email?${verifyParams.toString()}`);
    } catch (error) {
      console.error("[auth/register]", error);
      setErrorMessage(t(lang, "auth_error_generic"));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status === "loading") {
    return (
      <AuthCard title={t(lang, "auth_register_title")}>
        <div className="flex items-center justify-center py-8">
          <Spinner size="md" />
        </div>
      </AuthCard>
    );
  }

  if (status === "authenticated") {
    return (
      <AuthCard 
        title={t(lang, "auth_already_signed_in_title")}
        description={t(lang, "auth_already_signed_in_desc")}
      >
        <div className="flex items-center justify-center py-4">
          <Spinner size="md" />
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard 
      title={t(lang, "auth_register_title")}
      description={t(lang, "auth_register_desc")}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMessage && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {errorMessage}
          </div>
        )}

        <AuthInput
          id="email"
          label={t(lang, "auth_email")}
          type="email"
          placeholder={t(lang, "auth_email_placeholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isSubmitting}
          autoComplete="email"
          required
          autoFocus
          icon={<Mail className="w-4 h-4" />}
        />

        <AuthInput
          id="password"
          label={t(lang, "auth_password")}
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isSubmitting}
          autoComplete="new-password"
          minLength={8}
          required
          icon={<Lock className="w-4 h-4" />}
        />
        <p className="text-xs text-slate-500 dark:text-slate-400 -mt-2">
          {t(lang, "auth_password_hint")}
        </p>

        {/* Legal consent notice */}
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          {t(lang, "auth_legal_consent_prefix")}{" "}
          <Link href="/terms" target="_blank" className="text-emerald-600 dark:text-emerald-400 hover:underline">
            {t(lang, "auth_legal_consent_terms")}
          </Link>{" "}
          {t(lang, "auth_legal_consent_and")}{" "}
          <Link href="/privacy" target="_blank" className="text-emerald-600 dark:text-emerald-400 hover:underline">
            {t(lang, "auth_legal_consent_privacy")}
          </Link>
          {lang === "zh-CN" ? "。" : "."}
        </p>

        <div className="pt-2">
          <AuthPrimaryButton
            type="submit"
            disabled={isSubmitting || !email || !password || (SHOULD_USE_RECAPTCHA && !recaptchaReady)}
          >
            {isSubmitting ? t(lang, "auth_register_loading") : t(lang, "auth_register_button")}
          </AuthPrimaryButton>
        </div>

        <SocialLoginSection googleEnabled={true} disabled={false} />

        <p className="text-center text-sm text-slate-500 dark:text-slate-400 pt-2">
          {t(lang, "auth_have_account")}{" "}
          <Link
            href={`/auth/login${fromParam ? `?from=${encodeURIComponent(fromParam)}` : ""}`}
            className="text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
          >
            {t(lang, "auth_sign_in")}
          </Link>
        </p>

        {/* reCAPTCHA 声明 (Google 要求隐藏 badge 时需要显示此声明) */}
        {SHOULD_USE_RECAPTCHA && (
          <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center mt-2">
            {lang === "zh-CN" 
              ? "此页面受 reCAPTCHA 保护，适用 Google 隐私政策和服务条款。"
              : "This site is protected by reCAPTCHA and the Google Privacy Policy and Terms of Service apply."}
          </p>
        )}
      </form>
    </AuthCard>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <AuthLayout>
          <RegisterFallback />
        </AuthLayout>
      }
    >
      <AuthLayout>
        <RegisterForm />
      </AuthLayout>
    </Suspense>
  );
}
