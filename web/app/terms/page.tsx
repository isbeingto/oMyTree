import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { TermsContent } from "@/components/marketing/TermsContent";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | oMyTree",
  description:
    "Read the oMyTree Terms of Service — the rules and guidelines that govern your use of our service.",
  openGraph: {
    title: "Terms of Service | oMyTree",
    description:
      "Read the oMyTree Terms of Service — the rules and guidelines that govern your use of our service.",
  },
};

export default function TermsPage() {
  return (
    <MarketingLayout>
      <TermsContent locale="en" />
    </MarketingLayout>
  );
}
