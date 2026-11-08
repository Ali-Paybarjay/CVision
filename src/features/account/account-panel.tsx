import { isSupabaseConfigured } from "@/shared/supabase/env";
import { ButtonLink, Card, Notice } from "@/shared/ui";
import { getCurrentUser } from "./current-user";
import { SignInCard } from "./sign-in-card";
import { SignOutButton } from "./sign-out-button";

export const accountsOffNotice = (
  <Notice tone="info" title="Accounts are not switched on yet">
    Sign-in starts once the team connects the database. Everything else works with sample data.
  </Notice>
);

/** The signed-in state on the dashboard. Reads the session, so render it inside <Suspense>. */
export async function AccountPanel() {
  if (!isSupabaseConfigured()) return accountsOffNotice;

  const user = await getCurrentUser();

  if (!user) {
    return (
      <SignInCard
        title="Sign in to see your applications"
        text="Your tailored CVs, cover letters and next steps, in one place."
        next="/dashboard"
      />
    );
  }

  return (
    <Card className="flex flex-wrap items-center justify-between gap-4">
      <p>
        Signed in as <span className="font-semibold wrap-anywhere">{user.email}</span>
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <ButtonLink href="/dashboard/your-data" variant="quiet">
          Download or delete your data
        </ButtonLink>
        <SignOutButton />
      </div>
    </Card>
  );
}

export function AccountPanelFallback() {
  return <Card aria-busy="true" className="h-28" />;
}
