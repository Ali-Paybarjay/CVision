import type { Metadata } from "next";
import { getAiMode } from "@/shared/ai";
import { brand } from "@/shared/brand";
import { Page } from "@/shared/ui";
import { CvCheckForm } from "@/features/cvcheck/ui/cv-check-form";

export const metadata: Metadata = {
  title: brand.cta.cvCheck,
};

export default function CvCheckPage() {
  return (
    <Page
      title={brand.cta.cvCheckQuestion}
      description="Upload or paste your CV. In under two minutes you’ll see how ready it is for UK employers and what to fix first. No sign-up, and nothing is saved."
    >
      <CvCheckForm demoMode={getAiMode() === "mock"} />
    </Page>
  );
}
