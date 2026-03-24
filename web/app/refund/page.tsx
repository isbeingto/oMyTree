import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { RefundContent } from "@/components/marketing/RefundContent";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Refund Policy | oMyTree",
  description:
    "Understand oMyTree's refund and cancellation policy for paid subscriptions.",
  openGraph: {
    title: "Refund Policy | oMyTree",
    description:
      "Understand oMyTree's refund and cancellation policy for paid subscriptions.",
  },
};

export default function RefundPage() {
  return (
    <MarketingLayout>
      <RefundContent locale="en" />
    </MarketingLayout>
  );
}
