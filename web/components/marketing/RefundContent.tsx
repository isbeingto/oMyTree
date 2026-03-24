"use client";

import React from "react";
import { LegalPageShell } from "@/components/marketing/LegalPageShell";
import { LegalMarkdown } from "@/components/marketing/LegalMarkdown";
import type { SiteLocale } from "@/lib/site-i18n/locale-utils";

const LAST_UPDATED = "February 12, 2026";
const LAST_UPDATED_ZH = "2026 年 2 月 12 日";

const REFUND_EN_MD = `This Refund Policy explains how refunds work for purchases of oMyTree paid subscriptions.

The Service is operated by **风纳云数据有限公司**.

## 1. Payment Processing

All payments for oMyTree are processed by our authorized payment processor.

## 2. 14-Day Refund Window

You may request a **full refund within 14 days** of the transaction date.

## 3. How to Request a Refund

To request a refund, please contact us at [contact@omytree.com](mailto:contact@omytree.com).

## 4. Cancellation

You can cancel your subscription at any time. After cancellation, your paid features remain available until the end of the current billing period and you will not be charged again.

## 5. Changes to This Policy

We may update this Refund Policy from time to time. Changes will be posted on this page with an updated revision date.

## 6. Contact Us

For refund-related questions or requests, contact us at [contact@omytree.com](mailto:contact@omytree.com).`;

const REFUND_ZH_MD = `本退款政策说明 oMyTree 付费订阅的退款规则。

本服务由 **风纳云数据有限公司** 运营。

## 1. 付款处理

oMyTree 的付费购买由我们授权的支付处理方处理。

## 2. 14 天退款窗口

您可以在交易日期起 **14 天内** 申请**全额退款**。

## 3. 如何申请退款

请通过 [contact@omytree.com](mailto:contact@omytree.com) 联系我们申请退款。

## 4. 取消订阅

您可以随时取消订阅。取消后，付费功能将持续至当前计费周期结束，后续不再扣费。

## 5. 政策变更

我们可能不时更新本退款政策。变更将在本页面发布并更新修订日期。

## 6. 联系我们

如有退款相关问题或请求，请通过 [contact@omytree.com](mailto:contact@omytree.com) 联系我们。`;

export function RefundContent({ locale = "en" }: { locale?: SiteLocale }) {
  const markdown = locale === "zh-Hans-CN" ? REFUND_ZH_MD : REFUND_EN_MD;

  return (
    <LegalPageShell
      locale={locale}
      badge="legal_refund_badge"
      title="legal_refund_title"
      lastUpdated={locale === "zh-Hans-CN" ? LAST_UPDATED_ZH : LAST_UPDATED}
    >
      <LegalMarkdown markdown={markdown} />
    </LegalPageShell>
  );
}
