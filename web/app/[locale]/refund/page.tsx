import { notFound } from "next/navigation";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { RefundContent } from "@/components/marketing/RefundContent";
import { isValidLocale, type SiteLocale } from "@/lib/site-i18n/locale-utils";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (locale === "zh-Hans-CN") {
    return {
      title: "退款政策 | oMyTree",
      description: "了解 oMyTree 付费订阅的退款与取消政策。",
      openGraph: {
        title: "退款政策 | oMyTree",
        description: "了解 oMyTree 付费订阅的退款与取消政策。",
      },
    };
  }
  return {};
}

export default async function LocaleRefundPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  if (!isValidLocale(rawLocale) || rawLocale === "en") notFound();
  const locale = rawLocale as SiteLocale;

  return (
    <MarketingLayout locale={locale}>
      <RefundContent locale={locale} />
    </MarketingLayout>
  );
}
