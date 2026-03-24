"use client";

import { ThemeToggle } from "@/components/theme-toggle";
import { ReactNode, useState, createContext, useContext, useEffect } from "react";
import { Lang, t } from "@/lib/i18n";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

/**
 * Detect the user's preferred language for auth pages.
 * Priority: locale cookie (set by marketing proxy) → browser language → 'en'
 */
function detectAuthLang(): Lang {
  if (typeof document === "undefined") return "en";

  // 1. Read the 'locale' cookie set by the marketing page proxy
  const cookies = document.cookie.split(";").map((c) => c.trim());
  for (const cookie of cookies) {
    if (cookie.startsWith("locale=")) {
      const val = cookie.slice("locale=".length);
      if (val === "zh-Hans-CN") return "zh-CN";
      if (val === "en") return "en";
    }
  }

  // 2. Fall back to browser language
  const browserLang = navigator.language || (navigator as any).userLanguage || "";
  const lower = browserLang.toLowerCase();
  if (
    lower === "zh" ||
    lower === "zh-cn" ||
    lower === "zh-hans" ||
    lower === "zh-hans-cn" ||
    lower.startsWith("zh-hans") ||
    lower.startsWith("zh-cn")
  ) {
    return "zh-CN";
  }

  return "en";
}

// Language context for auth pages (auto-detected, read-only for consumers)
const AuthLangContext = createContext<{
  lang: Lang;
}>({
  lang: "en",
});

export function useAuthLang() {
  return useContext(AuthLangContext);
}

interface AuthLayoutProps {
  children: ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const [lang] = useState<Lang>(() => detectAuthLang());

  return (
    <AuthLangContext.Provider value={{ lang }}>
      <div className="relative min-h-screen flex flex-col items-center justify-center px-4 pb-10 pt-24 sm:pt-28 bg-[#F9FAFB] dark:bg-slate-950 text-foreground overflow-hidden">
        {/* Dot grid background */}
        <div className="absolute inset-0 bg-dot-grid-masked opacity-50 dark:opacity-30" />

        {/* Central green glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/20 dark:bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Theme toggle - top right */}
        <div className="absolute top-4 right-4 z-20">
          <ThemeToggle />
        </div>

        {/* Main content */}
        <div className="relative z-10 w-full max-w-md">
          {children}
        </div>
      </div>
    </AuthLangContext.Provider>
  );
}

interface AuthCardProps {
  children: ReactNode;
  title: string;
  description?: string;
}

export function AuthCard({ children, title, description }: AuthCardProps) {
  return (
    <div className="relative rounded-2xl glass-panel-strong shadow-xl shadow-emerald-500/5 dark:shadow-black/20 overflow-hidden">
      {/* Header with logo */}
      <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-3 h-3 rounded-full bg-emerald-500" />
          <span className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
            oMyTree
          </span>
        </div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {description}
          </p>
        )}
      </div>

      {/* Content */}
      <div className="p-6">
        {children}
      </div>
    </div>
  );
}

interface AuthInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
  label: string;
}

export function AuthInput({ icon, label, id, className, ...props }: AuthInputProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
            {icon}
          </div>
        )}
        <input
          id={id}
          className={`
            w-full rounded-xl border border-slate-200 dark:border-slate-700 
            bg-slate-50 dark:bg-slate-800/50 
            px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100
            placeholder:text-slate-400 dark:placeholder:text-slate-500
            focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/60
            focus:bg-white dark:focus:bg-slate-800
            transition-all duration-200
            disabled:opacity-50 disabled:cursor-not-allowed
            ${icon ? 'pl-10' : ''}
            ${className || ''}
          `}
          {...props}
        />
      </div>
    </div>
  );
}

export function AuthPrimaryButton({ 
  children, 
  isLoading, 
  ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { isLoading?: boolean }) {
  return (
    <button
      className="
        w-full h-11 rounded-xl font-semibold text-white
        bg-gradient-to-r from-emerald-600 to-emerald-500
        hover:from-emerald-500 hover:to-emerald-400
        shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40
        focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900
        transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-emerald-500/25
      "
      {...props}
    >
      {children}
    </button>
  );
}

interface SocialLoginSectionProps {
  disabled?: boolean;
  googleEnabled?: boolean;
}

export function SocialLoginSection({ disabled = true, googleEnabled = false }: SocialLoginSectionProps) {
  const { lang } = useAuthLang();
  const router = useRouter();
  const { data: session } = useSession();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [webViewWarning, setWebViewWarning] = useState<string | null>(null);

  // Check for WebView on mount
  useEffect(() => {
    // Dynamic import to avoid SSR issues
    import("@/lib/webview-detect").then(({ detectWebView, getWebViewOAuthMessage }) => {
      const info = detectWebView();
      if (info.hasKnownOAuthIssues) {
        setWebViewWarning(getWebViewOAuthMessage(lang, info.appName));
        console.log("[WebView Detection] Detected problematic WebView:", info.appName);
      }
    });
  }, [lang]);

  const handleGoogleLogin = async () => {
    try {
      setIsGoogleLoading(true);
      
      // Check if user is already authenticated
      if (session?.user?.id) {
        console.log("[Google Login] User already authenticated, redirecting to app");
        router.push("/app");
        return;
      }
      
      // For WebViews with known issues, use redirect: true (full page redirect)
      // This sometimes works better than the client-side handling
      const webviewInfo = await import("@/lib/webview-detect").then(m => m.detectWebView());
      const useRedirect = webviewInfo.hasKnownOAuthIssues;
      
      if (useRedirect) {
        console.log("[Google Login] Using full redirect for WebView compatibility");
        await signIn("google", { callbackUrl: "/app" });
        return;
      }
      
      // Use redirect: false to handle the post-login flow ourselves
      const result = await signIn("google", { 
        redirect: false
      });

      if (result?.error) {
        console.error("[Google Login] Error:", result.error);
        setIsGoogleLoading(false);
        return;
      }

      if (result?.ok) {
        console.log("[Google Login] Success, redirecting to app...");
        
        // Google already verifies emails. The auth flow syncs emailVerified
        // into the session/database, so we can skip the verify-email check entirely.
        // Wait a moment for the session to be updated
        await new Promise(resolve => setTimeout(resolve, 500));
        
        router.push("/app");
      }
    } catch (err) {
      console.error("[Google Login] Exception:", err);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="mt-6">
      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200 dark:border-slate-700" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="px-3 bg-white/80 dark:bg-slate-900/80 text-slate-500 dark:text-slate-400">
            {t(lang, "auth_or_continue_with")}
          </span>
        </div>
      </div>

      {/* Social buttons */}
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          disabled={disabled}
          className="
            flex-1 flex items-center justify-center gap-2 h-10 rounded-xl
            border border-slate-200 dark:border-slate-700
            bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800
            text-slate-600 dark:text-slate-400 text-sm font-medium
            transition-colors duration-200
            disabled:opacity-50 disabled:cursor-not-allowed
          "
          title={disabled ? t(lang, "auth_social_coming_soon") : "Sign in with GitHub"}
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z" />
          </svg>
          <span>GitHub</span>
        </button>
        <button
          type="button"
          disabled={!googleEnabled || isGoogleLoading}
          onClick={googleEnabled ? handleGoogleLogin : undefined}
          className="
            flex-1 flex items-center justify-center gap-2 h-10 rounded-xl
            border border-slate-200 dark:border-slate-700
            bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800
            text-slate-600 dark:text-slate-400 text-sm font-medium
            transition-colors duration-200
            disabled:opacity-50 disabled:cursor-not-allowed
          "
          title={!googleEnabled ? t(lang, "auth_social_coming_soon") : "Sign in with Google"}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          <span>{isGoogleLoading ? (lang === "zh-CN" ? "验证中..." : "Verifying...") : "Google"}</span>
        </button>
      </div>
      
      {/* WebView warning for problematic browsers */}
      {webViewWarning && googleEnabled && (
        <div className="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
            ⚠️ {webViewWarning}
          </p>
        </div>
      )}
      
      {!googleEnabled && (
        <p className="mt-3 text-center text-xs text-slate-400 dark:text-slate-500">
          {t(lang, "auth_social_coming_soon")}
        </p>
      )}
    </div>
  );
}

