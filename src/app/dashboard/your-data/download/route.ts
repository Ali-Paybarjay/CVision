import { after } from "next/server";
import { exportUserData, totalRows } from "@/features/account/data-rights";
import { yourDataPath } from "@/features/account/data-rights-paths";
import { withNext } from "@/features/account/safe-redirect";
import { getVerifiedUser } from "@/features/account/verified-user";
import { track } from "@/shared/analytics/track";
import { isSupabaseConfigured } from "@/shared/supabase/env";

/**
 * Download my data (issue #43): one ZIP with everything we hold about the signed-in user and their CV files.
 * A POST from the button on /dashboard/your-data, so it is never prefetched and, with SameSite=Lax session
 * cookies, another site cannot start it. Anything that stops the download goes back to a page with an answer.
 */
export async function POST(request: Request) {
  // Only this site's own button, checked the way Server Actions check it: browsers send Origin with a form post.
  const origin = request.headers.get("origin");
  if (origin && URL.parse(origin)?.host !== new URL(request.url).host) return new Response(null, { status: 403 });

  if (!isSupabaseConfigured()) return seeOther(request, yourDataPath);

  // The user comes from the session only, checked with Supabase Auth: a token from a signed-out session, or of a
  // deleted account, does not count even before it expires.
  const user = await getVerifiedUser();
  if (!user) return seeOther(request, withNext("/sign-in", yourDataPath));

  const result = await exportUserData(user, new Date());
  if (!result.ok) return seeOther(request, `${yourDataPath}?download=failed`);

  // Counts only: never anything from the rows or files.
  const properties = { rows: totalRows(result.summary), cvFiles: result.summary.cvFiles };
  after(() => track("account.data_downloaded", properties, { userId: user.id }));

  const chunks = result.chunks.values();
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = chunks.next();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${result.fileName}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** 303, so the browser follows with a GET of the page. */
function seeOther(request: Request, path: string) {
  return new Response(null, { status: 303, headers: { Location: new URL(path, request.url).toString(), "Cache-Control": "no-store" } });
}
