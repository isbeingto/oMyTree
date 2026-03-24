"use client";

/**
 * T25-5: Reset Password Page (Unified UI)
 * 重置密码 - 通过 token 设置新密码
 * 使用统一的 Auth UI 组件
 */

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, CheckCircle, AlertTriangle } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import {
  AuthLayout,
  AuthCard,
  AuthInput,
  AuthPrimaryButton,
  useAuthLang,
} from "@/app/auth/_components/AuthLayout";
import { t } from "@/lib/i18n";

function ResetPasswordFallback() {
  const { lang } = useAuthLang();
  return (
    <AuthCard title={t(lang, "context_capsule_loading")} description="">
      <div className="flex items-center justify-center py-8">
        <Spinner size="md" />
      </div>
    </AuthCard>
  );
}

function ResetPasswordFormInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { lang } = useAuthLang();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [tokenInvalid, setTokenInvalid] = useState(false);

  useEffect(() => {
    if (!token) {
      setTokenInvalid(true);
    }
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // Frontend validation
    if (password.length < 8) {
      setError(t(lang, "auth_reset_password_too_short"));
      return;
    }

    if (password !== confirmPassword) {
      setError(t(lang, "auth_reset_password_mismatch"));
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });

      const data = await res.json();

      if (!res.ok) {
        // Check if token is invalid/expired
        if (res.status === 400 || res.status === 404) {
          setTokenInvalid(true);
        } else {
          setError(t(lang, "auth_error_generic"));
        }
        return;
      }

      setSuccess(true);
      // Redirect to login after 3 seconds
      setTimeout(() => {
        router.push("/auth/login");
      }, 3000);
    } catch (err) {
      setError(t(lang, "auth_error_network"));
    } finally {
      setLoading(false);
    }
  }

  // Token invalid/expired state
  if (tokenInvalid) {
    return (
      <AuthCard
        title={t(lang, "auth_reset_invalid_link")}
        description={t(lang, "auth_reset_invalid_desc")}
      >
        <div className="flex flex-col items-center py-4">
          <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
            <AlertTriangle className="w-7 h-7 text-red-600 dark:text-red-400" />
          </div>
          <Link
            href="/auth/forgot-password"
            className="inline-flex items-center justify-center w-full h-11 rounded-xl font-semibold text-white bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all duration-200"
          >
            {t(lang, "auth_reset_request_new")}
          </Link>
        </div>
      </AuthCard>
    );
  }

  // Success state
  if (success) {
    return (
      <AuthCard
        title={t(lang, "auth_reset_success")}
        description={t(lang, "auth_reset_success_desc")}
      >
        <div className="flex flex-col items-center py-4">
          <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-4">
            <CheckCircle className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
          </div>
          <Spinner size="md" />
        </div>
      </AuthCard>
    );
  }

  // Reset form
  return (
    <AuthCard
      title={t(lang, "auth_reset_title")}
      description={t(lang, "auth_reset_desc")}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <AuthInput
          id="password"
          label={t(lang, "auth_reset_new_password")}
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          autoComplete="new-password"
          minLength={8}
          required
          autoFocus
          icon={<Lock className="w-4 h-4" />}
        />

        <div>
          <AuthInput
            id="confirmPassword"
            label={t(lang, "auth_reset_confirm_password")}
            type="password"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={loading}
            autoComplete="new-password"
            minLength={8}
            required
            icon={<Lock className="w-4 h-4" />}
          />
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            {t(lang, "auth_password_hint")}
          </p>
        </div>

        <div className="pt-2">
          <AuthPrimaryButton
            type="submit"
            disabled={loading || !password || !confirmPassword}
          >
            {loading ? t(lang, "auth_reset_loading") : t(lang, "auth_reset_button")}
          </AuthPrimaryButton>
        </div>

        <p className="text-center text-sm text-slate-500 dark:text-slate-400 pt-2">
          <Link
            href="/auth/login"
            className="font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            {t(lang, "auth_forgot_back_to_login")}
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthLayout>
      <Suspense
        fallback={
          <ResetPasswordFallback />
        }
      >
        <ResetPasswordFormInner />
      </Suspense>
    </AuthLayout>
  );
}
