"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, Mail, X, Loader2, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { t, type Lang } from "@/lib/i18n";
import { appApiPost, AppApiError } from "@/lib/app-api-client";

interface EmailVerificationBannerProps {
  userEmail?: string | null;
  userId?: string | null;
  lang?: Lang;
}

export function EmailVerificationBanner({ userEmail, userId, lang = 'en' }: EmailVerificationBannerProps) {
  const [isResending, setIsResending] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  // Reset justSent after a few seconds
  useEffect(() => {
    if (justSent) {
      const timer = setTimeout(() => setJustSent(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [justSent]);

  if (dismissed) {
    return null;
  }

  const handleGoToVerify = () => {
    if (userId && userEmail) {
      const params = new URLSearchParams({
        userId,
        email: userEmail,
        from: "/app",
      });
      router.push(`/auth/verify-email?${params.toString()}`);
    }
  };

  const handleResend = async () => {
    if (isResending || !userId) return;

    setIsResending(true);

    try {
      const data = await appApiPost<{
        alreadyVerified?: boolean;
        message?: string;
        detail?: { remainingSeconds?: number };
      }>("/auth/resend-verification", { userId });

      if (data.alreadyVerified) {
        toast({
          title: t(lang, 'toast_verify_already'),
          description: t(lang, 'toast_verify_already_desc')
        });
        setDismissed(true);
        return;
      }

      setJustSent(true);
      toast({
        title: t(lang, 'toast_verify_sent'),
        description: t(lang, 'toast_verify_sent_desc')
      });
      
      // 跳转到验证页面
      handleGoToVerify();
    } catch (err) {
      if (err instanceof AppApiError && err.status === 429) {
        toast({
          variant: "destructive",
          title: t(lang, 'toast_verify_rate_limit'),
          description: t(lang, 'toast_verify_rate_limit_desc')
        });
      } else {
        console.error("Failed to send verification code:", err);
        toast({
          variant: "destructive",
          title: t(lang, 'toast_verify_error'),
          description: err instanceof AppApiError ? err.message : t(lang, 'toast_verify_error_desc')
        });
      }
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0" />
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              {justSent ? (
                <span className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600" />
                  {t(lang, 'verify_banner_sent_to')}{" "}
                  <span className="font-medium">{userEmail || t(lang, 'verify_banner_fallback_email')}</span>
                </span>
              ) : (
                <>
                  {t(lang, 'verify_banner_unverified')}{userEmail ? ` (${userEmail})` : ""}.{" "}
                  <button
                    onClick={handleResend}
                    disabled={isResending}
                    className="font-medium underline hover:no-underline inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    {isResending ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {t(lang, 'verify_banner_sending')}
                      </>
                    ) : (
                      t(lang, 'verify_banner_send_code')
                    )}
                  </button>
                </>
              )}
            </p>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="p-1 rounded hover:bg-yellow-100 dark:hover:bg-yellow-800/50 text-yellow-600 dark:text-yellow-400"
            aria-label={t(lang, 'verify_banner_dismiss')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
