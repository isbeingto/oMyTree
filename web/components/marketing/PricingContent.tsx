"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { FadeIn } from "@/components/animations/FadeIn";
import {
  Check,
  X,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Loader2,
  ShieldCheck,
  Globe,
  CreditCard,
  FileText,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { appApiGet, AppApiError } from "@/lib/app-api-client";
import { mt } from "@/lib/site-i18n/marketing";
import type { SiteLocale } from "@/lib/site-i18n/locale-utils";
import { PayPalCheckoutButton } from "@/components/billing/PayPalCheckoutButton";

type BillingOverviewResponse = {
  billing_enabled?: boolean;
  provider?: string;
  clientId?: string;
  plan?: string;
  subscription?: {
    status?: string;
    is_target_plan?: boolean;
    plan_code?: string;
    current_period_end?: string | null;
    scheduled_change?: {
      action?: string;
      effective_at?: string;
    } | null;
  } | null;
};

function isEntitledPro(
  overview: BillingOverviewResponse | null,
  sessionPlan?: string | null
): boolean {
  if (String(sessionPlan || "").toLowerCase() === "pro") {
    return true;
  }

  if (String(overview?.plan || "").toLowerCase() === "pro") {
    return true;
  }

  const subscription = overview?.subscription || null;
  if (!subscription) {
    return false;
  }

  const status = String(subscription.status || "").toLowerCase();
  const hasEntitlementSignal =
    subscription.is_target_plan === true ||
    String(subscription.plan_code || "").toLowerCase() === "pro";

  return hasEntitlementSignal && ["active", "trialing", "past_due"].includes(status);
}

/* ── Plan data (mirrors api/config/rate_limits.js + plan_limits.js) ── */

const plans = (locale: SiteLocale) => [
  {
    key: "free" as const,
    name: mt(locale, "pricing_free_name"),
    desc: mt(locale, "pricing_free_desc"),
    price: mt(locale, "pricing_free_price"),
    period: mt(locale, "pricing_free_period"),
    cta: mt(locale, "pricing_cta_free"),
    ctaHref: "/auth/register",
    highlight: false,
    badge: null,
    features: [
      { label: mt(locale, "pricing_feat_turns"), value: "210" },
      { label: mt(locale, "pricing_feat_summaries"), value: "70" },
      { label: mt(locale, "pricing_feat_uploads"), value: "7" },
      { label: mt(locale, "pricing_feat_trees"), value: mt(locale, "pricing_unlimited") },
      { label: mt(locale, "pricing_feat_nodes"), value: mt(locale, "pricing_unlimited") },
      { label: mt(locale, "pricing_feat_byok"), value: true },
      { label: mt(locale, "pricing_feat_models"), value: true },
      { label: mt(locale, "pricing_feat_export"), value: true },
      { label: mt(locale, "pricing_feat_knowledge"), value: true },
      { label: mt(locale, "pricing_feat_priority"), value: false },
    ],
  },
  {
    key: "pro" as const,
    name: mt(locale, "pricing_pro_name"),
    desc: mt(locale, "pricing_pro_desc"),
    price: mt(locale, "pricing_pro_price"),
    period: mt(locale, "pricing_pro_period"),
    cta: locale === "zh-Hans-CN" ? "开通 Pro" : "Upgrade to Pro",
    ctaHref: null,
    highlight: true,
    badge: mt(locale, "pricing_popular"),
    features: [
      { label: mt(locale, "pricing_feat_turns"), value: "700" },
      { label: mt(locale, "pricing_feat_summaries"), value: "140" },
      { label: mt(locale, "pricing_feat_uploads"), value: "35" },
      { label: mt(locale, "pricing_feat_trees"), value: mt(locale, "pricing_unlimited") },
      { label: mt(locale, "pricing_feat_nodes"), value: mt(locale, "pricing_unlimited") },
      { label: mt(locale, "pricing_feat_byok"), value: true },
      { label: mt(locale, "pricing_feat_models"), value: true },
      { label: mt(locale, "pricing_feat_export"), value: true },
      { label: mt(locale, "pricing_feat_knowledge"), value: true },
      { label: mt(locale, "pricing_feat_priority"), value: true },
    ],
  },
];

const faqs = (locale: SiteLocale) => [
  { q: mt(locale, "pricing_faq_q1"), a: mt(locale, "pricing_faq_a1") },
  { q: mt(locale, "pricing_faq_q2"), a: mt(locale, "pricing_faq_a2") },
  { q: mt(locale, "pricing_faq_q3"), a: mt(locale, "pricing_faq_a3") },
  { q: mt(locale, "pricing_faq_q4"), a: mt(locale, "pricing_faq_a4") },
];

/* ── Feature value renderer ── */

function FeatureValue({ value }: { value: string | boolean }) {
  if (value === true) {
    return <Check className="w-4 h-4 text-emerald-500" />;
  }
  if (value === false) {
    return <X className="w-4 h-4 text-slate-300 dark:text-slate-600" />;
  }
  return (
    <span className="text-sm font-semibold text-slate-900 dark:text-white">
      {value}
    </span>
  );
}

/* ── FAQ accordion item ── */

function FAQItem({ q, a, delay }: { q: string; a: string; delay: number }) {
  const [open, setOpen] = useState(false);

  return (
    <FadeIn delay={delay} distance={10}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left rounded-xl glass-card glass-card-hover p-5 transition-all duration-200"
      >
        <div className="flex items-center justify-between gap-4">
          <span className="font-medium text-slate-900 dark:text-white text-sm">
            {q}
          </span>
          {open ? (
            <ChevronUp className="w-4 h-4 shrink-0 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 shrink-0 text-slate-400" />
          )}
        </div>
        {open && (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            {a}
          </p>
        )}
      </button>
    </FadeIn>
  );
}

/* ── Main component ── */

export function PricingContent({ locale = "en" as SiteLocale }: { locale?: SiteLocale }) {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const planData = plans(locale);
  const faqData = faqs(locale);
  const [isCheckoutPending, setIsCheckoutPending] = useState(false);
  const [isProActive, setIsProActive] = useState(false);
  const [billingEnabled, setBillingEnabled] = useState(true);
  const [paypalClientId, setPaypalClientId] = useState<string | null>(null);
  const [showPayPalButtons, setShowPayPalButtons] = useState(false);

  const copy =
    locale === "zh-Hans-CN"
      ? {
          checkoutLoading: "正在拉起支付...",
          checkoutErrorTitle: "无法发起支付",
          checkoutDefaultError: "请稍后重试",
          checkoutSuccess: "支付流程已完成，订阅状态正在同步。",
          checkoutCanceled: "已取消本次支付流程。",
          loginToUpgrade: "登录后开通 Pro",
          alreadyPro: "当前方案（Pro）",
          billingUnavailable: "账单功能暂不可用，请稍后重试。",
          secureCheckout: "安全支付",
          trustTitle: "全球安全支付保障",
          trustSubtitle: "我们使用安全的第三方支付处理，保障您的付款安全。",
          trustPointGlobal: "支持全球主流银行卡与本地化支付方式（以地区可用性为准）",
          trustPointHosted: "支付敏感信息不经过 oMyTree 服务器",
          trustPointBilling: "自动处理税务与发票流程，跨地区订阅交付更稳健",
        }
      : {
          checkoutLoading: "Opening checkout...",
          checkoutErrorTitle: "Unable to start checkout",
          checkoutDefaultError: "Please try again later.",
          checkoutSuccess: "Checkout completed. Subscription status is syncing.",
          checkoutCanceled: "Checkout was canceled.",
          loginToUpgrade: "Log in to upgrade",
          alreadyPro: "Current plan (Pro)",
          billingUnavailable: "Billing is unavailable right now. Please try again later.",
          secureCheckout: "Secure checkout",
          trustTitle: "Global Payment Security",
          trustSubtitle: "We use a secure third-party payment processor to protect your transactions.",
          trustPointGlobal: "Supports major global cards and localized payment methods (region dependent)",
          trustPointHosted: "Sensitive payment data does not pass through oMyTree",
          trustPointBilling: "Tax and invoice workflows are handled automatically for smoother international billing",
        };

  useEffect(() => {
    const checkoutStatus = searchParams.get("checkout");
    if (!checkoutStatus) return;

    if (checkoutStatus === "success") {
      toast({ title: copy.checkoutSuccess });
    } else if (checkoutStatus === "cancel") {
      toast({ title: copy.checkoutCanceled });
    } else {
      return;
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("checkout");
    const nextUrl = nextParams.toString() ? `${pathname}?${nextParams.toString()}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [copy.checkoutCanceled, copy.checkoutSuccess, pathname, router, searchParams, toast]);

  useEffect(() => {
    if (sessionStatus !== "authenticated") {
      setIsProActive(false);
      setBillingEnabled(true);
      return;
    }

    let canceled = false;
    (async () => {
      try {
        const overview = await appApiGet<BillingOverviewResponse>("/account/billing/overview", {
          cache: "no-store",
        });
        if (canceled) return;
        setBillingEnabled(overview.billing_enabled === true);
        setIsProActive(isEntitledPro(overview, session?.user?.plan ?? null));
        if (overview.clientId) {
          setPaypalClientId(overview.clientId);
        }
      } catch {
        if (canceled) return;
        setIsProActive(false);
      }
    })();

    return () => {
      canceled = true;
    };
  }, [sessionStatus, session?.user?.id, session?.user?.plan]);

  const handleProCheckout = async () => {
    const currentPathWithQuery = searchParams.toString()
      ? `${pathname}?${searchParams.toString()}`
      : pathname;

    if (sessionStatus !== "authenticated" || !session?.user?.id) {
      router.push(`/auth/login?from=${encodeURIComponent(currentPathWithQuery)}`);
      return;
    }

    if (isProActive) {
      return;
    }

    if (!billingEnabled) {
      toast({
        title: copy.billingUnavailable,
        variant: "destructive",
      });
      return;
    }

    setIsCheckoutPending(true);
    try {
      if (paypalClientId) {
        // Show PayPal buttons inline
        setShowPayPalButtons(true);
        setIsCheckoutPending(false);
        return;
      }
      toast({
        title: locale === "zh-Hans-CN"
          ? "支付功能正在升级中，请稍后再试"
          : "Payment system is being upgraded. Please try again later.",
      });
    } catch (error) {
      const detail =
        error instanceof AppApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : copy.checkoutDefaultError;

      toast({
        title: copy.checkoutErrorTitle,
        description: detail || copy.checkoutDefaultError,
        variant: "destructive",
      });
    } finally {
      setIsCheckoutPending(false);
    }
  };

  const proCtaText =
    sessionStatus === "loading"
      ? copy.checkoutLoading
      : isProActive
        ? copy.alreadyPro
        : sessionStatus === "authenticated"
          ? locale === "zh-Hans-CN"
            ? "开通 Pro"
            : "Upgrade to Pro"
          : copy.loginToUpgrade;

  const proButtonDisabled =
    isCheckoutPending ||
    sessionStatus === "loading" ||
    isProActive ||
    (sessionStatus === "authenticated" && !billingEnabled);

  return (
    <>
      {/* Background Dot Grid */}
      <div className="fixed inset-0 bg-dot-grid-masked opacity-40 dark:opacity-20 pointer-events-none" />

      <div className="mx-auto max-w-6xl space-y-16 relative z-10">
        {/* Hero */}
        <FadeIn>
          <header className="text-center space-y-4 relative">
            <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
            <FadeIn delay={0.1} distance={10}>
              <span className="inline-block rounded-full bg-emerald-100 dark:bg-emerald-900/50 px-4 py-1.5 text-xs sm:text-sm text-emerald-700 dark:text-emerald-300 font-medium relative z-10">
                {mt(locale, "pricing_badge")}
              </span>
            </FadeIn>
            <FadeIn delay={0.2} distance={20}>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 dark:text-white tracking-tight relative z-10">
                {mt(locale, "pricing_title")}
              </h1>
            </FadeIn>
            <FadeIn delay={0.3} distance={20}>
              <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto relative z-10">
                {mt(locale, "pricing_subtitle")}
              </p>
            </FadeIn>
          </header>
        </FadeIn>

        {/* Pricing cards */}
        <div className="max-w-4xl mx-auto">
          <div className="grid gap-6 md:gap-8 md:grid-cols-2 items-start text-left">
            {planData.map((plan, i) => (
              <FadeIn key={plan.key} delay={0.2 + i * 0.1} distance={20}>
                <div
                  className={`relative rounded-2xl p-[1px] transition-all duration-300 ${
                    plan.highlight
                      ? "bg-gradient-to-b from-emerald-400 via-emerald-500 to-emerald-600 shadow-2xl shadow-emerald-500/20 scale-[1.02] md:scale-105"
                      : ""
                  }`}
                >
                  {/* Badge */}
                  {plan.badge && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 text-white text-xs font-semibold px-3 py-1 shadow-lg shadow-emerald-500/30">
                        <Sparkles className="w-3 h-3" />
                        {plan.badge}
                      </span>
                    </div>
                  )}

                  <div
                    className={`rounded-2xl p-6 sm:p-8 h-full flex flex-col ${
                      plan.highlight
                        ? "bg-white dark:bg-slate-900"
                        : "glass-card glass-card-hover"
                    }`}
                  >
                    {/* Plan name & description */}
                    <div className="mb-6">
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                        {plan.name}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {plan.desc}
                      </p>
                    </div>

                    {/* Price */}
                    <div className="mb-8">
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                          {plan.price}
                        </span>
                        <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                          {plan.period}
                        </span>
                      </div>
                    </div>

                    {/* CTA button */}
                    {plan.key === "pro" ? (
                      <div className="mb-8">
                        <button
                          type="button"
                          onClick={handleProCheckout}
                          disabled={proButtonDisabled}
                          className={`w-full inline-flex items-center justify-center rounded-xl py-3 px-4 text-sm font-semibold transition-all duration-300 ${
                            isProActive
                              ? "border border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-default"
                              : proButtonDisabled
                                ? "bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-400 cursor-not-allowed"
                                : "bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/40"
                          }`}
                        >
                          {isCheckoutPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              {copy.checkoutLoading}
                            </>
                          ) : (
                            proCtaText
                          )}
                        </button>
                        {sessionStatus === "authenticated" && !billingEnabled ? (
                          <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">
                            {copy.billingUnavailable}
                          </p>
                        ) : (
                          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/40 px-2.5 py-1 text-[11px] text-emerald-700 dark:text-emerald-300">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            {copy.secureCheckout}
                          </div>
                        )}
                        {/* PayPal Checkout Buttons */}
                        {showPayPalButtons && paypalClientId && session?.user?.id && (
                          <div className="mt-4 w-full">
                            <PayPalCheckoutButton
                              clientId={paypalClientId}
                              userId={session.user.id}
                              planCode="pro"
                              locale={locale}
                              onSuccess={() => {
                                setShowPayPalButtons(false);
                                setIsProActive(true);
                                toast({
                                  title: locale === "zh-Hans-CN"
                                    ? "支付成功！已升级到 Pro 方案"
                                    : "Payment successful! Upgraded to Pro plan",
                                });
                                router.refresh();
                              }}
                              onError={(err) => {
                                setShowPayPalButtons(false);
                                toast({
                                  title: copy.checkoutErrorTitle,
                                  description: err.message || copy.checkoutDefaultError,
                                  variant: "destructive",
                                });
                              }}
                            />
                          </div>
                        )}
                      </div>
                    ) : plan.ctaHref ? (
                    <Link
                      href={plan.ctaHref}
                      className="w-full inline-flex items-center justify-center rounded-xl py-3 px-4 text-sm font-semibold transition-all duration-300 mb-8 bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-white/20"
                    >
                      {plan.cta}
                    </Link>
                  ) : (
                    <button
                      disabled
                      className="w-full inline-flex items-center justify-center rounded-xl py-3 px-4 text-sm font-semibold transition-all duration-300 mb-8 bg-slate-100 dark:bg-white/10 text-slate-400 dark:text-slate-500 cursor-not-allowed"
                    >
                      {plan.cta}
                    </button>
                  )}

                  {/* Features list */}
                  <ul className="space-y-3 flex-1">
                    {plan.features.map((feat, j) => (
                      <li
                        key={j}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="text-slate-600 dark:text-slate-400">
                          {feat.label}
                        </span>
                        <FeatureValue value={feat.value} />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>

      {/* Payment trust */}
        <FadeIn delay={0.45}>
          <section className="rounded-2xl glass-card glass-card-hover p-6 sm:p-8">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="inline-flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="h-4 w-4" />
                <h3 className="text-sm font-semibold">{copy.trustTitle}</h3>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">{/* Payment provider badge */}</span>
            </div>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {copy.trustSubtitle}
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-white/60 dark:border-white/10 bg-slate-50/60 dark:bg-slate-900/50 p-4">
                <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100/80 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                  <Globe className="h-4 w-4" />
                </div>
                <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{copy.trustPointGlobal}</p>
              </div>
              <div className="rounded-xl border border-white/60 dark:border-white/10 bg-slate-50/60 dark:bg-slate-900/50 p-4">
                <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100/80 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                  <CreditCard className="h-4 w-4" />
                </div>
                <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{copy.trustPointHosted}</p>
              </div>
              <div className="rounded-xl border border-white/60 dark:border-white/10 bg-slate-50/60 dark:bg-slate-900/50 p-4">
                <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100/80 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                  <FileText className="h-4 w-4" />
                </div>
                <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{copy.trustPointBilling}</p>
              </div>
            </div>
          </section>
        </FadeIn>

        {/* BYOK callout */}
        <FadeIn delay={0.5}>
          <div className="rounded-2xl glass-card glass-card-hover p-8 text-center relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full -mr-32 -mt-32 blur-3xl group-hover:bg-emerald-500/10 transition-colors duration-500" />
            <div className="relative z-10 max-w-2xl mx-auto space-y-3">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                {mt(locale, "pricing_feat_byok")}
              </h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
                {mt(locale, "pricing_faq_a2")}
              </p>
            </div>
          </div>
        </FadeIn>

        {/* FAQ */}
        <section className="max-w-2xl mx-auto space-y-6">
          <FadeIn delay={0.2}>
            <h2 className="text-2xl font-bold text-center text-slate-900 dark:text-white">
              {mt(locale, "pricing_faq_title")}
            </h2>
          </FadeIn>
          <div className="space-y-3">
            {faqData.map((faq, i) => (
              <FAQItem key={i} q={faq.q} a={faq.a} delay={0.3 + i * 0.05} />
            ))}
          </div>
        </section>

        {/* Bottom CTA */}
        <FadeIn delay={0.6}>
          <div className="text-center py-8 border-t border-slate-200 dark:border-slate-800 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-500/5 to-transparent opacity-50" />
            <div className="relative z-10 space-y-4">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                {locale === "zh-Hans-CN"
                  ? "准备好捕获你的思考过程了吗？"
                  : "Ready to capture your thinking process?"}
              </h2>
              <Link
                href="/auth/register"
                className="inline-flex items-center justify-center px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 rounded-full shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/40 transition-all duration-300"
              >
                {mt(locale, "pricing_cta_free")}
              </Link>
            </div>
          </div>
        </FadeIn>
      </div>
    </>
  );
}
