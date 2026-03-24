import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { PricingContent } from "@/components/marketing/PricingContent";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing | oMyTree",
  description:
    "Simple, transparent pricing for oMyTree. Start free, upgrade when your workflow demands more.",
  openGraph: {
    title: "Pricing | oMyTree",
    description:
      "Simple, transparent pricing for oMyTree. Start free, upgrade when your workflow demands more.",
  },
};

export default function PricingPage() {
  return (
    <MarketingLayout activeNav="pricing">
      <PricingContent locale="en" />
    </MarketingLayout>
  );
}
