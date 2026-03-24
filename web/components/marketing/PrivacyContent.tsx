"use client";

import React from "react";
import { LegalPageShell } from "@/components/marketing/LegalPageShell";
import { LegalMarkdown } from "@/components/marketing/LegalMarkdown";
import type { SiteLocale } from "@/lib/site-i18n/locale-utils";

const LAST_UPDATED = "February 11, 2026";
const LAST_UPDATED_ZH = "2026 年 2 月 11 日";

const PRIVACY_EN_MD = `This Privacy Policy explains how oMyTree ("we", "us", "our") collects, uses, and protects information when you use our website and services (collectively, the "Service").

## 1. Information We Collect

### 1.1 Information you provide

- Account information (email address, password).
- Content you create or upload (trees, messages, memos, files).
- Support communications (emails, feedback).

### 1.2 Information collected automatically

- Device and usage information (browser type, pages viewed, timestamps).
- Log data and diagnostics.
- Cookies or similar technologies (see "Cookies" below).

## 2. How We Use Information

We use information to:

- Provide and operate the Service.
- Authenticate users and secure accounts.
- Improve features, performance, and reliability.
- Respond to support requests.
- Enforce our [Terms of Service](/terms) and prevent abuse.

## 3. AI Processing and Your Content

The Service may process your content to generate AI outputs (summaries, memos, or other responses).

- If you use platform-provided AI, your prompts and related data may be sent to our AI providers to generate outputs.
- If you use BYOK (Bring Your Own Key), requests are sent using your own third-party API key. Third-party charges are billed by the provider.

## 4. Sharing of Information

We do not sell your personal information. We may share information:

- With service providers who help us operate the Service (hosting, analytics, email).
- With AI providers when needed to generate AI outputs.
- When required by law or to protect rights, safety, and security.

## 5. Data Retention

We retain information as long as necessary to provide the Service, comply with legal obligations, resolve disputes, and enforce agreements. You may delete your account (where available). Some information may persist in backups for a limited time.

## 6. Security

We use reasonable administrative, technical, and organizational safeguards designed to protect information. However, no method of transmission or storage is 100% secure.

## 7. Your Rights

Depending on your jurisdiction, you may have rights to access, correct, delete, or export your personal information, and to object to or restrict certain processing. To exercise these rights, contact us at [contact@omytree.com](mailto:contact@omytree.com).

## 8. Cookies

We may use cookies or similar technologies to remember preferences, keep you signed in, and measure site performance. You can control cookies through your browser settings.

## 9. Children's Privacy

The Service is not intended for children under 13. If you believe a child has provided personal information, contact us and we will take appropriate steps.

## 10. International Transfers

Your information may be processed in countries other than your own, where data protection laws may differ. We take reasonable steps to protect your information in accordance with this policy.

## 11. Changes to This Policy

We may update this Privacy Policy from time to time. We will post changes on this page with an updated revision date.

## 12. Contact Us

If you have questions about this Privacy Policy, contact us at [contact@omytree.com](mailto:contact@omytree.com).`;

const PRIVACY_ZH_MD = `本隐私政策说明 oMyTree（以下简称“我们”）在您使用我们的网站与服务（以下统称“服务”）时，如何收集、使用和保护信息。

## 1. 我们收集的信息

### 1.1 您主动提供的信息

- 账号信息（邮箱、密码）。
- 您创建或上传的内容（思维树、消息、备忘、文件）。
- 客服与支持沟通（邮件、反馈）。

### 1.2 自动收集的信息

- 设备与使用信息（浏览器类型、访问页面、时间戳）。
- 日志与诊断信息。
- Cookie 或类似技术（见下文“Cookie”）。

## 2. 我们如何使用信息

我们使用信息用于：

- 提供并运营服务。
- 用户身份验证与账号安全。
- 改进功能、性能与可靠性。
- 响应支持请求。
- 执行我们的[服务条款](/terms)并防止滥用。

## 3. AI 处理与您的内容

服务可能会处理您的内容以生成 AI 输出（例如摘要、备忘或其他响应）。

- 若您使用平台提供的 AI，您的提示词与相关数据可能会发送给我们的 AI 提供商以生成输出。
- 若您使用 BYOK（自带 Key），请求将使用您自己的第三方 API Key 发送；第三方费用由第三方提供商向您收取。

## 4. 信息共享

我们不会出售您的个人信息。我们可能在以下情况下共享信息：

- 与帮助我们运营服务的供应商共享（托管、分析、邮件等）。
- 在生成 AI 输出所需时与 AI 提供商共享。
- 法律要求或为保护权利、安全与安全性之必要。

## 5. 数据保留

我们会在提供服务所必需的期间内保留信息，并可能为履行法律义务、解决争议和执行协议而保留更久。您可以在可用功能中删除账号。部分信息可能在备份中保留有限时间。

## 6. 安全

我们采取合理的管理、技术与组织措施保护信息。但任何传输或存储方式都无法保证 100% 安全。

## 7. 您的权利

根据您所在司法辖区，您可能享有访问、更正、删除或导出个人信息的权利，以及反对或限制某些处理的权利。若要行使这些权利，请通过 [contact@omytree.com](mailto:contact@omytree.com) 联系我们。

## 8. Cookie

我们可能使用 Cookie 或类似技术来记住偏好、保持登录状态并衡量网站性能。您可以通过浏览器设置控制 Cookie。

## 9. 儿童隐私

本服务不面向 13 岁以下儿童。如您认为儿童向我们提供了个人信息，请联系我们，我们将采取适当措施。

## 10. 跨境传输

您的信息可能会在您所在国家/地区以外被处理，这些地区的数据保护法律可能不同。我们会采取合理措施以符合本政策保护您的信息。

## 11. 政策变更

我们可能不时更新本隐私政策。变更将在本页面公布并更新修订日期。

## 12. 联系我们

如对本隐私政策有任何疑问，请通过 [contact@omytree.com](mailto:contact@omytree.com) 联系我们。`;

export function PrivacyContent({ locale = "en" }: { locale?: SiteLocale }) {
  const markdown = locale === "zh-Hans-CN" ? PRIVACY_ZH_MD : PRIVACY_EN_MD;

  return (
    <LegalPageShell
      locale={locale}
      badge="legal_privacy_badge"
      title="legal_privacy_title"
      lastUpdated={locale === "zh-Hans-CN" ? LAST_UPDATED_ZH : LAST_UPDATED}
    >
      <LegalMarkdown markdown={markdown} />
    </LegalPageShell>
  );
}
