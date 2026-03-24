"use client";

/**
 * 设置密码页面
 * 用于Google-only用户设置首个密码
 * 重定向自设置页面中的"设置密码"选项
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, CheckCircle, AlertTriangle, ArrowLeft } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import {
  AuthLayout,
  AuthCard,
  AuthInput,
  AuthPrimaryButton,
  useAuthLang,
} from "@/app/auth/_components/AuthLayout";
import { t } from "@/lib/i18n";
import { useSession } from "next-auth/react";

export default function SetPasswordPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { lang } = useAuthLang();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [userHasPassword, setUserHasPassword] = useState(false);
  const [checking, setChecking] = useState(true);

  // 检查用户是否已有密码
  useEffect(() => {
    const checkPasswordStatus = async () => {
      try {
        const res = await fetch("/api/auth/password-status");
        if (res.ok) {
          const data = await res.json();
          if (data.hasPassword) {
            // 用户已有密码，应该使用change-password
            setUserHasPassword(true);
            router.push("/app/settings");
          }
        }
      } catch (err) {
        console.error("Failed to check password status:", err);
      } finally {
        setChecking(false);
      }
    };

    if (status === "authenticated") {
      checkPasswordStatus();
    } else if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // 前端验证
    if (password.length < 8) {
      setError(
        lang === "zh-CN"
          ? "密码至少需要8个字符"
          : "Password must be at least 8 characters long"
      );
      return;
    }

    if (password.length > 128) {
      setError(
        lang === "zh-CN"
          ? "密码最多128个字符"
          : "Password must be at most 128 characters long"
      );
      return;
    }

    // 检查是否包含数字和字母
    const hasNumber = /\d/.test(password);
    const hasLetter = /[a-zA-Z]/.test(password);

    if (!(hasNumber && hasLetter)) {
      setError(
        lang === "zh-CN"
          ? "密码必须包含至少一个数字和至少一个字母"
          : "Password must contain at least one number and one letter"
      );
      return;
    }

    if (password !== confirmPassword) {
      setError(
        lang === "zh-CN" ? "两次密码输入不一致" : "Passwords do not match"
      );
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === "password_already_exists") {
          setUserHasPassword(true);
          setError(
            lang === "zh-CN"
              ? "你已经有密码了，请使用修改密码选项。"
              : "You already have a password. Use the change password option."
          );
        } else {
          setError(
            data.message ||
              (lang === "zh-CN" ? "设置密码失败" : "Failed to set password")
          );
        }
        return;
      }

      setSuccess(true);
      // 3秒后重定向回设置页面
      setTimeout(() => {
        router.push("/app/settings");
      }, 3000);
    } catch (err) {
      console.error("Set password error:", err);
      setError(
        lang === "zh-CN"
          ? "设置密码失败，请重试"
          : "Failed to set password. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <AuthLayout>
        <AuthCard title={lang === "zh-CN" ? "检查中..." : "Checking..."}>
          <div className="flex justify-center py-8">
            <Spinner size="md" />
          </div>
        </AuthCard>
      </AuthLayout>
    );
  }

  if (success) {
    return (
      <AuthLayout>
        <AuthCard
          title={lang === "zh-CN" ? "密码已设置！" : "Password Set!"}
          description={lang === "zh-CN" ? "正在返回设置..." : "Redirecting..."}
        >
          <div className="flex flex-col items-center py-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <Spinner size="md" />
          </div>
        </AuthCard>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <AuthCard
        title={lang === "zh-CN" ? "设置密码" : "Set Password"}
        description={
          lang === "zh-CN"
            ? "为你的账户设置一个安全密码，这样你就可以使用邮箱和密码登录。"
            : "Set a secure password for your account so you can sign in with email and password."
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            {/* Password Input */}
            <AuthInput
              type="password"
              label={lang === "zh-CN" ? "新密码" : "New Password"}
              placeholder={lang === "zh-CN" ? "输入新密码" : "Enter new password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(""); // 清除错误
              }}
              disabled={loading}
              autoComplete="new-password"
            />

            {/* Confirm Password Input */}
            <AuthInput
              type="password"
              label={lang === "zh-CN" ? "确认密码" : "Confirm Password"}
              placeholder={
                lang === "zh-CN" ? "再次输入密码" : "Confirm password"
              }
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setError(""); // 清除错误
              }}
              disabled={loading}
              autoComplete="new-password"
            />

            {/* Password Requirements */}
            <div className="rounded-lg bg-slate-100/60 dark:bg-slate-800/60 p-3 space-y-1">
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {lang === "zh-CN" ? "密码要求：" : "Password requirements:"}
              </p>
              <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                <li>
                  • {lang === "zh-CN" ? "至少8个字符" : "At least 8 characters"}
                </li>
                <li>
                  •{" "}
                  {lang === "zh-CN"
                    ? "必须包含数字和字母"
                    : "Must contain numbers and letters"}
                </li>
                <li>
                  • {lang === "zh-CN" ? "最多128个字符" : "At most 128 characters"}
                </li>
              </ul>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 flex gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <AuthPrimaryButton type="submit" disabled={loading || !password}>
            {loading
              ? lang === "zh-CN"
                ? "设置中..."
                : "Setting..."
              : lang === "zh-CN"
              ? "设置密码"
              : "Set Password"}
          </AuthPrimaryButton>

          {/* Back Link */}
          <div className="text-center">
            <Link
              href="/app/settings"
              className="inline-flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              {lang === "zh-CN" ? "返回设置" : "Back to Settings"}
            </Link>
          </div>
        </form>
      </AuthCard>
    </AuthLayout>
  );
}
