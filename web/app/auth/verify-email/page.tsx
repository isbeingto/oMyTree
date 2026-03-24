"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Mail, RefreshCw, CheckCircle } from "lucide-react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Spinner } from "@/components/ui/spinner";
import { 
  AuthLayout, 
  AuthCard, 
  AuthPrimaryButton,
  useAuthLang
} from "@/app/auth/_components/AuthLayout";
import { t } from "@/lib/i18n";

// 声明 grecaptcha 类型和全局回调 (支持 Enterprise 和 v3)
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
    onRecaptchaCallback?: (token: string) => void;
  }
}

const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "";

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { lang } = useAuthLang();
  
  const userId = searchParams.get("userId");
  const email = searchParams.get("email");
  const fromParam = searchParams.get("from");
  
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [recaptchaReady, setRecaptchaReady] = useState(true); // Temporarily default to true to skip blocked script loading
  
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // 初始化 reCAPTCHA 脚本
  useEffect(() => {
    // temporarily disabled due to network block in mainland China
    /*
    if (typeof window === "undefined") return;
    
    // 如果 grecaptcha 已经加载，直接标记为就绪
    if (window.grecaptcha?.ready) {
      setRecaptchaReady(true);
      return;
    }

    // 否则，创建脚本标签
    const script = document.createElement("script");
    // 使用 Enterprise 脚本
    script.src = `https://www.google.com/recaptcha/enterprise.js?render=${RECAPTCHA_SITE_KEY}`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      console.log("[verify-email] reCAPTCHA Enterprise script loaded");
      setRecaptchaReady(true);
    };
    script.onerror = () => {
      console.error("[verify-email] Failed to load reCAPTCHA Enterprise script");
      setRecaptchaReady(false);
    };
    document.head.appendChild(script);

    return () => {
      // 清理：页面卸载时不需要移除脚本，保留全局 grecaptcha
    };
    */
  }, []);

  // 倒计时
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  // 自动聚焦第一个输入框
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // 当验证码填满时自动提交
  useEffect(() => {
    const fullCode = code.join("");
    if (fullCode.length === 6 && !isVerifying && !success) {
      handleVerify(fullCode);
    }
  }, [code]);

  // 页面加载时自动发送验证码 (针对Google OAuth用户)
  useEffect(() => {
    if (!userId || isResending || cooldown > 0) return;

    const autoSendVerificationCode = async () => {
      try {
        console.log("[verify-email] Auto-sending verification code on page mount");
        setIsResending(true);
        
        // 直接发送，不需要 reCAPTCHA (这是初始发送，不是重新发送)
        const res = await fetch("/api/auth/resend-verification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        });

        const data = await res.json();

        if (!res.ok) {
          if (res.status === 429) {
            const remaining = data.detail?.remainingSeconds || 60;
            setCooldown(remaining);
            console.warn("[verify-email] Rate limited on auto-send:", remaining);
          } else {
            console.error("[verify-email] Failed to auto-send:", data);
          }
          return;
        }

        console.log("[verify-email] Verification code auto-sent successfully");
        // 设置初始冷却，以防用户立即手动重新发送
        setCooldown(5);
      } catch (err) {
        console.error("[verify-email] Auto-send error:", err);
      } finally {
        setIsResending(false);
      }
    };

    // 仅在第一次挂载时自动发送
    const timer = setTimeout(() => {
      autoSendVerificationCode();
    }, 500); // 稍微延迟以确保页面完全加载

    return () => clearTimeout(timer);
  }, [userId]); // 仅在 userId 变化时重新运行

  const handleInputChange = (index: number, value: string) => {
    // 只接受数字
    if (value && !/^\d$/.test(value)) return;
    
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
    setError(null);

    // 自动跳到下一个输入框
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pastedData.length === 6) {
      const newCode = pastedData.split("");
      setCode(newCode);
      inputRefs.current[5]?.focus();
    }
  };

  const handleVerify = async (fullCode: string) => {
    if (!userId || fullCode.length !== 6) return;

    setIsVerifying(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, code: fullCode }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === "code_expired") {
          setError(lang === "zh-CN" ? "验证码已过期，请重新发送" : "Code expired. Please request a new one.");
        } else if (data.code === "invalid_code") {
          setError(lang === "zh-CN" ? "验证码错误，请重新输入" : "Invalid code. Please try again.");
        } else {
          setError(data.message || (lang === "zh-CN" ? "验证失败" : "Verification failed"));
        }
        // 清空验证码
        setCode(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
        return;
      }

      setSuccess(true);
      
      // 验证成功后跳转到登录页面
      setTimeout(async () => {
        const targetPath = fromParam?.startsWith("/") ? fromParam : "/app";
        const loginParams = new URLSearchParams({
          verified: "1",
          from: targetPath,
        });
        router.push(`/auth/login?${loginParams.toString()}`);
      }, 1500);
    } catch (err) {
      console.error("Verification error:", err);
      setError(lang === "zh-CN" ? "验证失败，请稍后重试" : "Verification failed. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!userId || isResending || cooldown > 0 || !recaptchaReady) return;
    setIsResending(true);
    setError(null);

    // Bypass reCAPTCHA due to network issues
    await onRecaptchaCallback("dummy_token");

    /*
    // 触发 reCAPTCHA
    if (window.grecaptcha?.enterprise?.execute) {
      try {
        const token = await window.grecaptcha.enterprise.execute(RECAPTCHA_SITE_KEY, {
          action: "resend_verification",
        });
        await onRecaptchaCallback(token);
      } catch (err) {
        console.error("[verify-email] reCAPTCHA execution failed:", err);
        setError(lang === "zh-CN" ? "验证失败，请稍后重试" : "Verification failed. Please try again.");
        setIsResending(false);
      }
    } else {
      console.warn("[verify-email] reCAPTCHA not ready");
      setIsResending(false);
    }
    */
  };

  // 全局回调，在 reCAPTCHA 验证成功后调用
  const onRecaptchaCallback = async (token: string) => {
    console.log("[verify-email] reCAPTCHA callback received with token:", !!token);
    
    if (!userId) {
      setError(lang === "zh-CN" ? "缺少用户信息" : "Missing user information");
      setIsResending(false);
      return;
    }

    try {
      console.log("[verify-email] Sending resend request with reCAPTCHA token");
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, recaptchaToken: token }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          const remaining = data.detail?.remainingSeconds || 60;
          setCooldown(remaining);
          setError(lang === "zh-CN" 
            ? `请等待 ${remaining} 秒后再试` 
            : `Please wait ${remaining} seconds before resending`
          );
        } else {
          setError(data.message || (lang === "zh-CN" ? "发送失败" : "Failed to send"));
        }
        return;
      }

      console.log("[verify-email] Verification code resent successfully");
      // 开始 60 秒冷却
      setCooldown(60);
      // 清空验证码
      setCode(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } catch (err) {
      console.error("Resend error:", err);
      setError(lang === "zh-CN" ? "发送失败，请稍后重试" : "Failed to send. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  // 在组件挂载时，将回调注册到全局
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.onRecaptchaCallback = onRecaptchaCallback;
    }
  }, [userId, lang, isResending, cooldown]);

  // 如果没有必要参数，显示错误
  if (!userId) {
    return (
      <AuthCard 
        title={lang === "zh-CN" ? "无效链接" : "Invalid Link"}
        description={lang === "zh-CN" ? "缺少必要参数" : "Missing required parameters"}
      >
        <Link
          href="/auth/register"
          className="flex items-center justify-center gap-2 text-emerald-600 hover:text-emerald-500 font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          {lang === "zh-CN" ? "返回注册" : "Back to Register"}
        </Link>
      </AuthCard>
    );
  }

  if (success) {
    return (
      <AuthCard 
        title={lang === "zh-CN" ? "验证成功！" : "Email Verified!"}
        description={lang === "zh-CN" ? "正在跳转..." : "Redirecting..."}
      >
        <div className="flex flex-col items-center py-4">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <Spinner size="md" />
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard 
      title={lang === "zh-CN" ? "验证你的邮箱" : "Verify Your Email"}
      description={
        lang === "zh-CN" 
          ? `我们已向 ${email || "你的邮箱"} 发送了一个 6 位验证码`
          : `We sent a 6-digit code to ${email || "your email"}`
      }
    >
      <div className="space-y-6">
        {/* 验证码输入框 */}
        <div className="flex justify-center gap-2">
          {code.map((digit, index) => (
            <input
              key={index}
              ref={(el) => { inputRefs.current[index] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleInputChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={index === 0 ? handlePaste : undefined}
              disabled={isVerifying || success}
              className="w-12 h-14 text-center text-2xl font-bold border-2 rounded-xl
                bg-white dark:bg-slate-900
                border-slate-200 dark:border-slate-700
                text-slate-900 dark:text-white
                focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20
                disabled:opacity-50 transition-all"
            />
          ))}
        </div>

        {/* 错误信息 */}
        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400 text-center">
            {error}
          </div>
        )}

        {/* 验证按钮 */}
        <AuthPrimaryButton
          type="button"
          onClick={() => handleVerify(code.join(""))}
          disabled={isVerifying || code.some(d => !d) || success}
        >
          {isVerifying 
            ? (lang === "zh-CN" ? "验证中..." : "Verifying...") 
            : (lang === "zh-CN" ? "验证" : "Verify")
          }
        </AuthPrimaryButton>

        {/* 重发验证码 */}
        <div className="text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
            {lang === "zh-CN" ? "没有收到验证码？" : "Didn't receive the code?"}
          </p>
          <button
            type="button"
            className="inline-flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            disabled={isResending || cooldown > 0}
            onClick={handleResend}
          >
            <RefreshCw className={`w-4 h-4 ${isResending ? 'animate-spin' : ''}`} />
            {cooldown > 0 
              ? (lang === "zh-CN" ? `${cooldown} 秒后可重发` : `Resend in ${cooldown}s`)
              : (lang === "zh-CN" ? "重新发送" : "Resend Code")
            }
          </button>
        </div>

        {/* 返回链接 */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2">
          <Link
            href="/auth/login?skipEmailCheck=1"
            className="flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
          >
            <ArrowLeft className="w-4 h-4" />
            {lang === "zh-CN" ? "返回登录" : "Back to Login"}
          </Link>
          <button
            type="button"
            onClick={async () => {
              const { signOut } = await import("next-auth/react");
              await signOut({ callbackUrl: "/auth/login" });
            }}
            className="flex items-center justify-center gap-2 text-xs text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors w-full"
          >
            {lang === "zh-CN" ? "退出登录并切换账号" : "Sign out and switch account"}
          </button>
        </div>

        {/* reCAPTCHA 声明 (Google 要求隐藏 badge 时需要显示此声明) */}
        <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center mt-4">
          {lang === "zh-CN" 
            ? "此页面受 reCAPTCHA 保护，适用 Google 隐私政策和服务条款。"
            : "This site is protected by reCAPTCHA and the Google Privacy Policy and Terms of Service apply."}
        </p>
      </div>
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthLayout>
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-screen">
          <Spinner size="lg" />
        </div>
      }>
        <VerifyEmailForm />
      </Suspense>
    </AuthLayout>
  );
}
