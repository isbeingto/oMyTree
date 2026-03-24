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

const AUTH_ERROR_KEYS: Record<string, Parameters<typeof t>[1]> = {
  CredentialsSignin: "auth_error_credentials",
  CredentialsSigninCallbackError: "auth_error_credentials",
  AccessDenied: "auth_error_access_denied",
  AccountDisabled: "auth_error_account_disabled",
  Configuration: "auth_error_configuration",
  default: "auth_error_signin_failed",
};

const getFriendlyAuthErrorKey = (code?: string | null) => {
  if (!code) return AUTH_ERROR_KEYS.default;
  if (code === "AccountDisabled" || code.toLowerCase().includes("disabled")) {
    return AUTH_ERROR_KEYS.AccountDisabled;
  }
  return AUTH_ERROR_KEYS[code] ?? AUTH_ERROR_KEYS.default;
};

function LoginFallback() {
  const { lang } = useAuthLang();
  return (
    <AuthCard title={t(lang, "auth_login_title")}>
      <div className="flex items-center justify-center py-8">
        <Spinner size="md" />
      </div>
    </AuthCard>
  );
}

function sanitizeFromPath(raw?: string | null) {
  if (raw && raw.startsWith("/")) {
    return raw;
  }
  return "/app";
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { lang } = useAuthLang();

  const registeredSuccess = searchParams.get("registered") === "1";
  const verifiedSuccess = searchParams.get("verified") === "1";
  const queryError = searchParams.get("error");
  const fromParam = searchParams.get("from");
  const callbackUrl = searchParams.get("callbackUrl");
  const skipEmailCheck = searchParams.get("skipEmailCheck") === "1"; // 允许用户跳过验证检查直接访问登录页面
  const targetPath = sanitizeFromPath(fromParam || callbackUrl);

  useEffect(() => {
    if (queryError) {
      setErrorMessage(t(lang, getFriendlyAuthErrorKey(queryError)));
    }
  }, [queryError, lang]);

  useEffect(() => {
    // 如果设置了 skipEmailCheck，不要自动重定向
    // 这允许未验证邮箱的用户从 verify-email 页面返回到登录页面
    if (skipEmailCheck) {
      return;
    }
    
    if (status === "authenticated" && session?.user?.id) {
      router.replace(targetPath);
    }
  }, [status, session, router, targetPath, skipEmailCheck]);

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

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (!result?.error) {
        router.push(targetPath);
        return;
      }

      setErrorMessage(t(lang, getFriendlyAuthErrorKey(result.error)));
    } catch (error) {
      console.error("[auth/login]", error);
      setErrorMessage(t(lang, "auth_error_generic"));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status === "loading") {
    return (
      <AuthCard title={t(lang, "auth_login_title")}>
        <div className="flex items-center justify-center py-8">
          <Spinner size="md" />
        </div>
      </AuthCard>
    );
  }

  // If user is authenticated but NOT skipping email check, show the "already signed in" message
  // If skipEmailCheck=1, allow the user to stay on the login page even though they're authenticated
  if (status === "authenticated" && !skipEmailCheck) {
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
      title={t(lang, "auth_login_title")}
      description={t(lang, "auth_login_desc")}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {verifiedSuccess && !errorMessage && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
            {t(lang, "auth_verified_success")}
          </div>
        )}

        {registeredSuccess && !errorMessage && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
            {t(lang, "auth_registered_success")}
          </div>
        )}

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
          autoComplete="current-password"
          minLength={8}
          required
          icon={<Lock className="w-4 h-4" />}
        />

        <div className="text-right">
          <Link
            href="/auth/forgot-password"
            className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            {t(lang, "auth_forgot_password")}
          </Link>
        </div>

        <div className="pt-2">
          <AuthPrimaryButton
            type="submit"
            disabled={isSubmitting || !email || !password}
          >
            {isSubmitting ? t(lang, "auth_login_loading") : t(lang, "auth_login_button")}
          </AuthPrimaryButton>
        </div>

        <SocialLoginSection googleEnabled={true} disabled={false} />

        <p className="text-center text-sm text-slate-500 dark:text-slate-400 pt-2">
          {t(lang, "auth_no_account")}{" "}
          <Link
            href={`/auth/register${fromParam ? `?from=${encodeURIComponent(fromParam)}` : ""}`}
            className="text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
          >
            {t(lang, "auth_create_one")}
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <AuthLayout>
          <LoginFallback />
        </AuthLayout>
      }
    >
      <AuthLayout>
        <LoginForm />
      </AuthLayout>
    </Suspense>
  );
}
