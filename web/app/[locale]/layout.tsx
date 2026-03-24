import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { isValidLocale, type SiteLocale } from '@/lib/site-i18n/locale-utils';

/**
 * Layout for /[locale]/* routes.
 *
 * Validates the dynamic locale segment and renders children only if valid.
 * Invalid locale values (e.g. /randomstring) trigger a 404.
 *
 * NOTE: The root layout (app/layout.tsx) handles <html lang>, <head>, etc.
 * This layout is purely a validation gate + optional locale metadata overrides.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return {};

  if (locale === 'zh-Hans-CN') {
    return {
      title: {
        default: 'oMyTree - 沉淀 AI 对话资产',
        template: '%s | oMyTree',
      },
      description:
        'oMyTree 将冗长的 AI 对话转化为结构化的知识树。支持会话回放、备忘节点和快速跳转，帮你理清思路，高效沉淀 AI 过程资产。',
      openGraph: {
        locale: 'zh_CN',
        title: 'oMyTree - 沉淀 AI 对话资产',
        description:
          'oMyTree 将冗长的 AI 对话转化为结构化的知识树。支持会话回放、备忘节点和快速跳转，帮你理清思路，高效沉淀 AI 过程资产。',
      },
      alternates: {
        canonical: 'https://www.omytree.com/zh-Hans-CN',
        languages: {
          en: 'https://www.omytree.com',
          'zh-Hans-CN': 'https://www.omytree.com/zh-Hans-CN',
        },
      },
    };
  }

  return {};
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Only allow recognised locales; everything else → 404
  if (!isValidLocale(locale) || locale === 'en') {
    notFound();
  }

  return <>{children}</>;
}
