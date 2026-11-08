import { SignInCard } from "@/features/account/sign-in-card";
import type { DataSource } from "@/features/tailor/server/my-data";
import type { Profile } from "@/shared/contracts";

/**
 * What Tailor shows before a job: the sign-in card for a visitor signed out on the live site, "Build your profile
 * first" for a signed-in user with no profile, otherwise the page itself. A pilot was sent round in a circle by
 * "Build your profile first" while signed out (#367).
 */
export function tailorStart(profile: Profile | null, source: DataSource): "sign-in" | "build-profile" | "ready" {
  if (profile) return "ready";
  return source === "none" ? "sign-in" : "build-profile";
}

/** The app's one sign-in card, coming back to this job either way. */
export function TailorSignIn({ jobId }: { jobId: string | null }) {
  const here = jobId ? `/tailor?${new URLSearchParams({ job: jobId })}` : "/tailor";
  return (
    <SignInCard
      title="Sign in to tailor your CV"
      text="Tailoring starts from the profile saved in your account, and every change you approve is kept with it."
      next={here}
    />
  );
}
