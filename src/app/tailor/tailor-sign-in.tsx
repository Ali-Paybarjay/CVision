import { SignInCard } from "@/features/account/sign-in-card";
import type { DataSource } from "@/features/tailor/server/my-data";
import type { Profile } from "@/shared/contracts";
import { ButtonLink, Notice } from "@/shared/ui";

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

/**
 * A signed-in user with no profile: the way on is a Coral button, as on Check a job and the dashboard, not a small
 * link in the notice (#500). Both empty states keep their own gap, as the job list shows "Add a job first" in a plain box.
 */
export function BuildProfileFirst() {
  return (
    <div className="flex flex-col gap-6">
      <Notice tone="info" title="Build your profile first">
        Tailoring starts from the profile you approve. Upload your CV or fill in your details yourself.
      </Notice>
      <div>
        <ButtonLink href="/profile" variant="primary">
          Build your profile
        </ButtonLink>
      </div>
    </div>
  );
}

/** No job to tailor for yet, with a Coral button to add one (#500). */
export function AddJobFirst() {
  return (
    <div className="flex flex-col gap-6">
      <Notice tone="info" title="Add a job first">
        Paste a job ad to tailor your CV for it.
      </Notice>
      <div>
        <ButtonLink href="/jobs" variant="primary">
          Paste a job ad
        </ButtonLink>
      </div>
    </div>
  );
}
