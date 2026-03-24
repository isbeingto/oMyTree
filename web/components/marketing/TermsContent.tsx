"use client";

import React from "react";
import { LegalPageShell } from "@/components/marketing/LegalPageShell";
import { LegalMarkdown } from "@/components/marketing/LegalMarkdown";
import type { SiteLocale } from "@/lib/site-i18n/locale-utils";

const LAST_UPDATED = "February 12, 2026";
const LAST_UPDATED_ZH = "2026 年 2 月 12 日";

const TERMS_EN_MD = `Welcome to oMyTree ("we", "us", "our"). These Terms of Service ("Terms") govern your access to and use of the oMyTree website at https://www.omytree.com and all related services (collectively, the "Service"). By creating an account or using the Service, you agree to be bound by these Terms.

Legal entity / operator: **风纳云数据有限公司**.

## 1. Acceptance of Terms

By accessing or using oMyTree, you confirm that you are at least 16 years old and have the legal capacity to enter into these Terms. If you are using the Service on behalf of an organization, you represent that you have authority to bind that organization.

## 2. Description of Service

oMyTree is a tree-structured process asset system that helps users capture, organize, and replay AI-assisted thinking processes. The Service includes AI-powered conversations, knowledge management, export capabilities, and related features as described on our website.

## 3. Account Registration

To use most features of oMyTree, you must create an account by providing a valid email address and password. You are responsible for:

- Maintaining the confidentiality of your account credentials.
- All activities that occur under your account.
- Notifying us immediately of any unauthorized use at contact@omytree.com.

## 4. Free and Paid Plans

oMyTree offers a free tier with weekly usage quotas and may offer paid plans with expanded quotas and features. Specific plan details and pricing are shown on the [Pricing page](/pricing). We reserve the right to modify pricing and plan features with reasonable notice.

## 5. Bring Your Own Key (BYOK)

oMyTree allows you to connect your own third-party API keys (e.g., OpenAI, Google, DeepSeek). When using BYOK:

- Your API keys are stored securely and used solely to process your requests.
- You are responsible for complying with the third-party provider's terms of service.
- We are not liable for any charges incurred on your third-party accounts.

## 6. User Content

You retain ownership of all content you create, upload, or store using oMyTree ("User Content"). By using the Service, you grant us a limited, non-exclusive license to host, store, and process your User Content solely for the purpose of providing the Service to you.

You agree not to upload or share content that:

- Violates any applicable law or regulation.
- Infringes on the intellectual property rights of others.
- Contains malware, viruses, or harmful code.
- Is defamatory, harassing, or threatening.

## 7. Acceptable Use

You agree not to:

- Use the Service for any illegal purpose or in violation of applicable laws.
- Attempt to gain unauthorized access to the Service, other accounts, or related systems.
- Interfere with or disrupt the Service's infrastructure.
- Use automated tools (bots, scrapers) to access the Service without prior written permission.
- Reverse-engineer, decompile, or disassemble any part of the Service.

## 8. Intellectual Property

The oMyTree name, logo, website design, and all software code are owned by oMyTree and protected by applicable intellectual property laws. You may not use our trademarks without prior written consent.

## 9. Data and Privacy

Your use of the Service is also governed by our [Privacy Policy](/privacy), which describes how we collect, use, and protect your information.

## 10. Service Availability

We strive to maintain high availability but do not guarantee uninterrupted access. The Service may be temporarily unavailable due to maintenance, updates, or circumstances beyond our control. We will make reasonable efforts to provide advance notice of planned downtime.

## 11. Termination

You may delete your account at any time through the Settings page. We may suspend or terminate your account if you violate these Terms. Upon termination:

- We will retain your data for a reasonable period to allow you to export it, unless deletion is required by law.
- We may delete your data after a reasonable notice period following account termination.

## 12. Limitation of Liability

To the maximum extent permitted by law, oMyTree and its operators shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of data, loss of profits, or business interruption, arising from your use of or inability to use the Service.

## 13. Disclaimer of Warranties

The Service is provided "as is" and "as available" without warranties of any kind, either express or implied. We do not warrant that the Service will be error-free, secure, or meet your specific requirements. AI-generated content may contain errors and should not be relied upon as the sole basis for important decisions.

## 14. Modifications to Terms

We may update these Terms from time to time. We will notify you of material changes by posting a notice on the Service or by sending an email to your registered address. Continued use of the Service after changes take effect constitutes acceptance of the revised Terms.

## 15. Governing Law

These Terms are governed by and construed in accordance with the laws of the jurisdiction where oMyTree operates, without regard to conflict of law principles.

## 16. Contact Us

If you have any questions about these Terms, please contact us at [contact@omytree.com](mailto:contact@omytree.com).`;

const TERMS_ZH_MD = `欢迎使用 oMyTree（以下简称“我们”）。本服务条款（以下简称“条款”）规范您对 oMyTree 网站（https://www.omytree.com）及所有相关服务（以下统称“服务”）的访问和使用。创建账号或使用本服务即表示您同意受本条款约束。

法定主体/运营方：**风纳云数据有限公司**。

## 1. 接受条款

使用 oMyTree 即表示您确认自己已年满 16 周岁且具备签订本条款的法律行为能力。如果您代表组织使用本服务，则表示您有权代表该组织。

## 2. 服务说明

oMyTree 是一个专为深度研究打造的 AI 工作台，帮助用户捕获、组织和回放 AI 辅助的思考过程。服务包括 AI 驱动的对话、知识管理、导出功能以及网站上描述的相关功能。

## 3. 账号注册

要使用 oMyTree 的大多数功能，您需要提供有效的邮箱地址和密码创建账号。您应当对以下事项负责：

- 保护您的账号凭据的机密性。
- 您账号下发生的所有活动。
- 如发现未经授权的使用，请立即通过 contact@omytree.com 联系我们。

## 4. 免费与付费方案

oMyTree 提供带有每周使用配额的免费版，并可能提供配额与功能更高的付费方案。具体方案与价格请参见[定价页面](/pricing)。我们保留在合理通知后调整价格和方案功能的权利。

## 5. 自带 Key（BYOK）

oMyTree 允许您连接第三方 API Key（例如 OpenAI、Google、DeepSeek）。使用 BYOK 时：

- 您的 API Key 会被安全存储，并仅用于处理您的请求。
- 您应自行遵守第三方提供商的服务条款。
- 因第三方账户产生的任何费用由您自行承担，我们不对此负责。

## 6. 用户内容

您保留对您在 oMyTree 中创建、上传或存储的所有内容（“用户内容”）的所有权。为向您提供服务，您授予我们有限的、非排他的许可，用于托管、存储并处理您的用户内容。

您同意不上传或分享以下内容：

- 违反任何适用法律法规的内容。
- 侵犯他人知识产权的内容。
- 含有恶意软件、病毒或有害代码的内容。
- 诽谤、骚扰或威胁性的内容。

## 7. 可接受使用

您同意不进行以下行为：

- 以任何非法目的或违反适用法律的方式使用服务。
- 试图未经授权访问服务、他人账号或相关系统。
- 干扰或破坏服务基础设施。
- 未经书面许可使用自动化工具（机器人、爬虫）访问服务。
- 对服务的任何部分进行反向工程、反编译或反汇编。

## 8. 知识产权

oMyTree 的名称、标识、网站设计以及软件代码均归 oMyTree 所有，并受适用知识产权法律保护。未经我们书面同意，您不得使用我们的商标。

## 9. 数据与隐私

您对服务的使用也受我们的[隐私政策](/privacy)约束，该政策描述了我们如何收集、使用和保护您的信息。

## 10. 服务可用性

我们努力保持高可用性，但不保证服务不间断。服务可能因维护、更新或我们无法控制的原因而临时不可用。对于计划内的停机维护，我们将尽合理努力提前通知。

## 11. 终止

您可随时通过设置页面删除账号。若您违反本条款，我们可能暂停或终止您的账号。终止后：

- 我们会在合理期限内保留您的数据以便您导出（法律要求删除的除外）。
- 在合理通知期后，我们可能删除您的数据。

## 12. 责任限制

在法律允许的最大范围内，oMyTree 及其运营方不对您因使用或无法使用服务而产生的任何间接、附带、特殊、后果性或惩罚性损害承担责任，包括但不限于数据丢失、利润损失或业务中断。

## 13. 免责声明

服务按“现状”和“可用”提供，不提供任何明示或暗示的保证。我们不保证服务无错误、安全或满足您的特定需求。AI 生成内容可能存在错误，不应作为重要决策的唯一依据。

## 14. 条款变更

我们可能不时更新本条款。若变更重大，我们将通过在服务中发布通知或向您的注册邮箱发送邮件的方式进行告知。变更生效后继续使用服务即表示您接受修订后的条款。

## 15. 适用法律

本条款受 oMyTree 运营所在地的法律管辖并据其解释，不考虑法律冲突原则。

## 16. 联系我们

如对本条款有任何疑问，请通过 [contact@omytree.com](mailto:contact@omytree.com) 联系我们。`;

export function TermsContent({ locale = "en" }: { locale?: SiteLocale }) {
  const markdown = locale === "zh-Hans-CN" ? TERMS_ZH_MD : TERMS_EN_MD;

  return (
    <LegalPageShell
      locale={locale}
      badge="legal_terms_badge"
      title="legal_terms_title"
      lastUpdated={locale === "zh-Hans-CN" ? LAST_UPDATED_ZH : LAST_UPDATED}
    >
      <LegalMarkdown markdown={markdown} />
    </LegalPageShell>
  );
}
