import "server-only";
import { fetchPublicPage, type FetchPageOptions } from "@/shared/web/fetch-page";
import { MIN_AD_CHARACTERS } from "../job-extraction";
import { jobSite, type AdLinkFailure } from "../job-link";

/** `url` is where the text came from, or would have: the page after redirects when it opened, otherwise the link. */
export type AdLinkRead =
  | { ok: true; url: string; text: string; truncated: boolean }
  | { ok: false; reason: AdLinkFailure; url: string };

/**
 * The ad's text from its link, for the user to check in the ad box (#330), or why there is none. A site that never
 * shows its ads to another website is never asked, even when a shortened or tracked link redirects to it, and a page
 * too short to hold a whole ad counts as no ad. `options` is for tests, which never reach the network.
 */
export async function readAdLink(link: string, options: FetchPageOptions = {}): Promise<AdLinkRead> {
  if (jobSite(link)?.textOnly) return { ok: false, reason: "text-only-site", url: link };

  // fetchPublicPage follows redirects itself, so the request to such a site is stopped here, before it is sent.
  const refused: { url?: string } = {};
  const send = options.fetch ?? fetch;
  const page = await fetchPublicPage(link, {
    ...options,
    fetch: (input, init) => {
      const href = input instanceof Request ? input.url : String(input);
      if (!jobSite(href)?.textOnly) return send(input, init);
      refused.url = href;
      return Promise.reject(new Error("A site that doesn't show its ads to other websites"));
    },
  });

  if (refused.url) return { ok: false, reason: "text-only-site", url: refused.url };
  if (!page.ok) return { ok: false, reason: page.reason, url: link };
  if (page.text.length < MIN_AD_CHARACTERS) return { ok: false, reason: "no-ad", url: page.url };
  return { ok: true, url: page.url, text: page.text, truncated: page.truncated };
}
