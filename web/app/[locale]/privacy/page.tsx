import { notFound } from "next/navigation";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { PrivacyContent } from "@/components/marketing/PrivacyContent";
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
      title: "隐私政策 | oMyTree",
      description: "了解 oMyTree 如何收集、使用和保护您的个人信息。",
      openGraph: {
        title: "隐私政策 | oMyTree",
        description: "了解 oMyTree 如何收集、使用和保护您的个人信息。",
      },
    };
  }
  return {};
}

export default async function LocalePrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  if (!isValidLocale(rawLocale) || rawLocale === "en") notFound();
  const locale = rawLocale as SiteLocale;

  return (
    <MarketingLayout locale={locale}>
      <PrivacyContent locale={locale} />
    </MarketingLayout>
  );
}
