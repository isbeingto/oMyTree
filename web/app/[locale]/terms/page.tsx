import { notFound } from "next/navigation";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { TermsContent } from "@/components/marketing/TermsContent";
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
      title: "服务条款 | oMyTree",
      description: "阅读 oMyTree 服务条款——管理您使用我们服务的规则和指南。",
      openGraph: {
        title: "服务条款 | oMyTree",
        description: "阅读 oMyTree 服务条款——管理您使用我们服务的规则和指南。",
      },
    };
  }
  return {};
}

export default async function LocaleTermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  if (!isValidLocale(rawLocale) || rawLocale === "en") notFound();
  const locale = rawLocale as SiteLocale;

  return (
    <MarketingLayout locale={locale}>
      <TermsContent locale={locale} />
    </MarketingLayout>
  );
}
