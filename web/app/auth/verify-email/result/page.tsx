"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle, XCircle, Clock, AlertTriangle, ArrowLeft } from "lucide-react";
import { Suspense } from "react";
import { Spinner } from "@/components/ui/spinner";
import { useAuthLang } from "@/app/auth/_components/AuthLayout";
import { t } from "@/lib/i18n";

type VerifyStatus = "ok" | "expired" | "invalid" | "error" | "used";

const STATUS_CONFIG: Record<VerifyStatus, {
  icon: React.ElementType;
  iconColor: string;
  bgColor: string;
  titleKey: Parameters<typeof t>[1];
  messageKey: Parameters<typeof t>[1];
}> = {
  ok: {
    icon: CheckCircle,
    iconColor: "text-green-500",
    bgColor: "bg-green-50",
    titleKey: "auth_verify_result_ok_title",
    messageKey: "auth_verify_result_ok_message"
  },
  expired: {
    icon: Clock,
    iconColor: "text-yellow-500",
    bgColor: "bg-yellow-50",
    titleKey: "auth_verify_result_expired_title",
    messageKey: "auth_verify_result_expired_message"
  },
  invalid: {
    icon: XCircle,
    iconColor: "text-red-500",
    bgColor: "bg-red-50",
    titleKey: "auth_verify_result_invalid_title",
    messageKey: "auth_verify_result_invalid_message"
  },
  used: {
    icon: CheckCircle,
    iconColor: "text-green-500",
    bgColor: "bg-green-50",
    titleKey: "auth_verify_result_used_title",
    messageKey: "auth_verify_result_used_message"
  },
  error: {
    icon: AlertTriangle,
    iconColor: "text-orange-500",
    bgColor: "bg-orange-50",
    titleKey: "auth_verify_result_error_title",
    messageKey: "auth_verify_result_error_message"
  }
};

function VerifyResultContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawStatus = searchParams.get("status");
  const { lang } = useAuthLang();
  
  // Default to 'invalid' if no status or unknown status
  const status: VerifyStatus = 
    rawStatus && rawStatus in STATUS_CONFIG 
      ? rawStatus as VerifyStatus 
      : "invalid";
  
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  // Auto-redirect to /app after 5 seconds on success
  useEffect(() => {
    if (status === "ok" || status === "used") {
      const timer = setTimeout(() => {
        router.push("/app");
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [status, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Icon */}
          <div className={`mx-auto w-20 h-20 rounded-full ${config.bgColor} flex items-center justify-center mb-6`}>
            <Icon className={`w-10 h-10 ${config.iconColor}`} />
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-center text-gray-900 mb-3">
            {t(lang, config.titleKey)}
          </h1>

          {/* Message */}
          <p className="text-center text-gray-600 mb-8">
            {t(lang, config.messageKey)}
          </p>

          {/* Actions */}
          <div className="space-y-3">
            {(status === "ok" || status === "used") && (
              <>
                <Link
                  href="/app"
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors"
                >
                  {t(lang, "auth_verify_result_go_to_app")}
                </Link>
                <p className="text-center text-sm text-gray-500">
                  {t(lang, "auth_verify_result_redirecting")}
                </p>
              </>
            )}

            {(status === "expired" || status === "invalid" || status === "error") && (
              <>
                <Link
                  href="/auth/login"
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors"
                >
                  {t(lang, "auth_verify_result_go_to_login")}
                </Link>
                <Link
                  href="/"
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  {t(lang, "auth_verify_result_back_home")}
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-gray-500 mt-6">
          {t(lang, "auth_verify_result_trouble")}{" "}
          <a href="mailto:support@omytree.com" className="text-green-600 hover:underline">
            {t(lang, "auth_verify_result_contact_support")}
          </a>
        </p>
      </div>
    </div>
  );
}

export default function VerifyEmailResultPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="xl" />
      </div>
    }>
      <VerifyResultContent />
    </Suspense>
  );
}
