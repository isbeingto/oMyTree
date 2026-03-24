"use client";

/**
 * T25-5: Forgot Password Page (Unified UI)
 * 忘记密码 - 输入邮箱获取重置链接
 * 使用统一的 Auth UI 组件
 */

import { useState } from "react";
import Link from "next/link";
import { Mail, CheckCircle } from "lucide-react";
import {
  AuthLayout,
  AuthCard,
  AuthInput,
  AuthPrimaryButton,
  useAuthLang,
} from "@/app/auth/_components/AuthLayout";
import { t } from "@/lib/i18n";

export default function ForgotPasswordPage() {
  const { lang } = useAuthLang();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      // Always show success to prevent email enumeration
      // Backend returns 200 even if email doesn't exist
      if (res.ok) {
        setSuccess(true);
      } else {
        // Only show error for server/network issues
        setError(typeof data?.error === "string" ? data.error : t(lang, "auth_error_generic"));
      }
    } catch (err) {
      setError(t(lang, "auth_error_network"));
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <AuthLayout>
        <AuthCard
          title={t(lang, "auth_forgot_success")}
          description={t(lang, "auth_forgot_success_desc")}
        >
          <div className="flex flex-col items-center py-4">
            <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-4">
              <CheckCircle className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
              {t(lang, "auth_forgot_link_expires")}
            </p>
            <Link
              href="/auth/login"
              className="text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              {t(lang, "auth_forgot_back_to_login")}
            </Link>
          </div>
        </AuthCard>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <AuthCard
        title={t(lang, "auth_forgot_title")}
        description={t(lang, "auth_forgot_desc")}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <AuthInput
            id="email"
            label={t(lang, "auth_email")}
            type="email"
            placeholder={t(lang, "auth_email_placeholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            autoComplete="email"
            required
            autoFocus
            icon={<Mail className="w-4 h-4" />}
          />

          <div className="pt-2">
            <AuthPrimaryButton
              type="submit"
              disabled={loading || !email}
            >
              {loading ? t(lang, "auth_forgot_sending") : t(lang, "auth_forgot_send_link")}
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
    </AuthLayout>
  );
}
