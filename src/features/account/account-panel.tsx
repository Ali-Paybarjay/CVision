import { isSupabaseConfigured } from "@/shared/supabase/env";
import { Button, ButtonLink, Card, Notice } from "@/shared/ui";
import { brand } from "@/shared/brand";
import { signOut } from "./actions";
import { getCurrentUser } from "./current-user";

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
      <Card>
        <h2 className="text-xl">Sign in to see your applications</h2>
        <p className="mt-1 text-text-muted">Your tailored CVs, cover letters and next steps, in one place.</p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <ButtonLink href="/sign-up" variant="primary">
            {brand.cta.primary}
          </ButtonLink>
          <ButtonLink href="/sign-in" variant="quiet">
            Sign in
          </ButtonLink>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-wrap items-center justify-between gap-4">
      <p>
        Signed in as <span className="font-semibold">{user.email}</span>
      </p>
      <form action={signOut}>
        <Button type="submit">Sign out</Button>
      </form>
    </Card>
  );
}

export function AccountPanelFallback() {
  return <Card aria-busy="true" className="h-28" />;
}
