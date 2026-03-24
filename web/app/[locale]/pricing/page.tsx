import { notFound } from "next/navigation";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { PricingContent } from "@/components/marketing/PricingContent";
import { isValidLocale, type SiteLocale } from "@/lib/site-i18n/locale-utils";
import { mt } from "@/lib/site-i18n/marketing";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (locale === "zh-Hans-CN") {
    const loc = locale as SiteLocale;
    return {
      title: mt(loc, 'pricing_meta_title'),
      description: mt(loc, 'pricing_meta_description'),
      openGraph: {
        title: mt(loc, 'pricing_meta_title'),
        description: mt(loc, 'pricing_meta_description'),
      },
    };
  }
  return {};
}

export default async function LocalePricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  if (!isValidLocale(rawLocale) || rawLocale === "en") notFound();
  const locale = rawLocale as SiteLocale;

  return (
    <MarketingLayout activeNav="pricing" locale={locale}>
      <PricingContent locale={locale} />
    </MarketingLayout>
  );
}
