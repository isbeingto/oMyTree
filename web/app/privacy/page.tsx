import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { PrivacyContent } from "@/components/marketing/PrivacyContent";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | oMyTree",
  description:
    "Learn how oMyTree collects, uses, and protects your personal information.",
  openGraph: {
    title: "Privacy Policy | oMyTree",
    description:
      "Learn how oMyTree collects, uses, and protects your personal information.",
  },
};

export default function PrivacyPage() {
  return (
    <MarketingLayout>
      <PrivacyContent locale="en" />
    </MarketingLayout>
  );
}
