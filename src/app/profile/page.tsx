import type { Metadata } from "next";
import { getAiMode } from "@/shared/ai";
import { Page } from "@/features/profile/ui/kit";
import { ProfileBuilder } from "@/features/profile/ui/profile-builder";

export const metadata: Metadata = {
  title: "Your profile",
};

export default function ProfilePage() {
  return (
    <Page
      title="Your profile"
      description="Upload your CV, check what we found and approve it. Every tailored CV and cover letter is built only from what you approve here."
    >
      <ProfileBuilder demoMode={getAiMode() === "mock"} />
    </Page>
  );
}
