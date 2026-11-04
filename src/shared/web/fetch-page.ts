import "server-only";
import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { cleanModelText } from "@/shared/clean-text";

// Reading a job ad from the link the user gives (#278). The server opens an address a user chose, so this is the one
// place that does it, with the guards a server needs (SSRF): only http and https on the usual ports, never this
// computer, a private network or a cloud's metadata address, checked again after every redirect; a short time limit;
// a size limit; and only web pages. It returns the page's readable text, or a reason the page can't help.
//
// Known limit: the address is checked when we look it up, and fetch looks it up again when it connects. A name that
// changes its answer in between (DNS rebinding) could slip through. Pinning the checked address would need a new
// dependency (undici); on Vercel there is no private network of ours to reach, and the port rule (80 and 443 only)
// keeps the function's own runtime API on 127.0.0.1:9001 out of reach, so keep that rule and its test.
//
// Every pattern that reads the HTML ends at its closing tag or at the end of the input and never runs past a "<",
// so a hostile page of unclosed tags can't make it rescan for minutes: the work is synchronous and no time limit
// could stop it.

export type FetchPageFailure =
  /** Not an http(s) link we may open: another scheme, a user name or password, an unusual port, or a private address. */
  | "invalid-url"
  /** The site said no or wants a sign-in, as LinkedIn and Indeed often do. */
  | "blocked"
  | "not-found"
  | "too-slow"
  | "too-large"
  /** Not a web page, such as a PDF or an image. */
  | "not-a-page"
  /** Anything else: the site is down, the connection failed, or there are too many redirects. */
  | "failed";

export type FetchPageResult =
  /**
   * truncated: the page had more text than we keep (30,000 characters, above the job ad form's own limit), so the
   * form's own "too long" message still shows rather than a silent cut.
   */
  | { ok: true; url: string; title: string | null; text: string; truncated: boolean }
  | { ok: false; reason: FetchPageFailure };

export type FetchPageOptions = {
  /** For tests: unit tests never reach the network (CLAUDE.md, rule 10). */
  fetch?: typeof fetch;
  /** For tests: every address a host name stands for. */
  lookup?: (hostname: string) => Promise<string[]>;
  timeoutMs?: number;
  maxBytes?: number;
};

const defaultTimeoutMs = 10_000;
const defaultMaxBytes = 2_000_000;
const maxRedirects = 3;
/** About ten pages of a job ad: more is site furniture, and the AI only needs the ad. */
const maxTextLength = 30_000;
const maxTitleLength = 300;

const userAgent = "Mozilla/5.0 (compatible; CVisionBot/1.0; +https://cvision-eta.vercel.app/privacy)";

/** Addresses we never open: this computer, private networks, link-local (cloud metadata), shared and multicast. */
const privateAddresses = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const) {
  privateAddresses.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  // IPv4 inside IPv6: compatible (::/96), translated, NAT64 and 6to4 can all carry a private IPv4 address. Mapped
  // addresses (::ffff:a.b.c.d) are left out on purpose: BlockList checks them against the IPv4 rules above, and a
  // ::ffff:0:0/96 rule would block every IPv4 address.
  ["::", 96],
  ["::ffff:0:0:0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 32],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  privateAddresses.addSubnet(network, prefix, "ipv6");
}

/** True when the address is one we never open. An IPv4 address written as IPv6 (::ffff:10.0.0.1) counts as IPv4. */
export function isPrivateAddress(address: string): boolean {
  const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return privateAddresses.check(mapped[1], "ipv4");
  const family = isIP(address);
  if (family === 4) return privateAddresses.check(address, "ipv4");
  if (family === 6) return privateAddresses.check(address, "ipv6");
  return true;
}

async function defaultLookup(hostname: string): Promise<string[]> {
  const answers = await dnsLookup(hostname, { all: true, verbatim: true });
  return answers.map((answer) => answer.address);
}

/** The link as a URL we may open, or null. Only http(s), the usual ports, no user name or password, a public host. */
async function safeUrl(href: string, lookup: (hostname: string) => Promise<string[]>, signal: AbortSignal): Promise<URL | null> {
  if (!URL.canParse(href)) return null;
  const url = new URL(href);
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  if (url.port !== "" && url.port !== "80" && url.port !== "443") return null;
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (host === "" || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) return null;
  let addresses: string[];
  try {
    // A name server that never answers is held to the same time limit as the page.
    addresses = isIP(host) ? [host] : await withSignal(lookup(host), signal);
  } catch {
    return null;
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) return null;
  return url;
}

/** Opens a public web page and returns its readable text, following up to three redirects, each checked again. */
export async function fetchPublicPage(link: string, options: FetchPageOptions = {}): Promise<FetchPageResult> {
  const doFetch = options.fetch ?? fetch;
  const lookup = options.lookup ?? defaultLookup;
  const signal = AbortSignal.timeout(options.timeoutMs ?? defaultTimeoutMs);
  const maxBytes = options.maxBytes ?? defaultMaxBytes;

  let url = await safeUrl(link.trim(), lookup, signal);
  if (!url) return { ok: false, reason: signal.aborted ? "too-slow" : "invalid-url" };

  try {
    for (let redirects = 0; ; redirects++) {
      const response = await doFetch(url, {
        redirect: "manual",
        signal,
        headers: { "user-agent": userAgent, accept: "text/html,application/xhtml+xml;q=0.9", "accept-language": "en-GB,en;q=0.8" },
      });

      if (response.status >= 300 && response.status < 400) {
        await discard(response);
        const location = response.headers.get("location");
        if (!location || redirects >= maxRedirects) return { ok: false, reason: "failed" };
        const next = await safeUrl(new URL(location, url).href, lookup, signal);
        if (!next) return { ok: false, reason: signal.aborted ? "too-slow" : "invalid-url" };
        // A redirect to a sign-in page means the ad is behind an account.
        if (isSignInPage(next)) return { ok: false, reason: "blocked" };
        url = next;
        continue;
      }

      if (!response.ok) return discard(response, { ok: false, reason: failureFor(response.status) });
      const type = response.headers.get("content-type") ?? "";
      if (!/text\/html|application\/xhtml\+xml/i.test(type)) return discard(response, { ok: false, reason: "not-a-page" });
      const declared = Number(response.headers.get("content-length"));
      if (declared > maxBytes) return discard(response, { ok: false, reason: "too-large" });

      const html = await readText(response, maxBytes, charsetOf(type));
      if (html === null) return { ok: false, reason: "too-large" };
      const page = readablePage(html);
      if (page.text.length === 0) return { ok: false, reason: "blocked" };
      return { ok: true, url: url.href, ...page };
    }
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return { ok: false, reason: "too-slow" };
    return { ok: false, reason: "failed" };
  }
}

/** Rejects when the signal fires, so a lookup can't outlast the time limit. */
function withSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

/** Lets go of a body we won't read, so the connection is freed now rather than whenever memory is cleaned up. */
async function discard<T>(response: Response, result?: T): Promise<T> {
  await response.body?.cancel().catch(() => {});
  return result as T;
}

/** The charset the page says it uses, if TextDecoder knows it, so a windows-1252 "£" isn't garbled. */
function charsetOf(type: string): string {
  const label = type.match(/charset\s*=\s*"?([\w-]+)/i)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(label).encoding;
  } catch {
    return "utf-8";
  }
}

function failureFor(status: number): FetchPageFailure {
  if (status === 404 || status === 410) return "not-found";
  // 999 is LinkedIn's answer to anything that isn't a signed-in browser.
  if (status === 401 || status === 403 || status === 429 || status === 451 || status === 999) return "blocked";
  return "failed";
}

function isSignInPage(url: URL): boolean {
  return /(^|\/)(login|log-in|signin|sign-in|authwall|auth|account\/login)(\/|$)/i.test(url.pathname);
}

/** The body as text, or null once it passes maxBytes, so a huge page is never held in full. */
async function readText(response: Response, maxBytes: number, charset: string): Promise<string | null> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder(charset).decode(bytes);
}

/**
 * The page's title and readable text. Most job boards also describe the ad as schema.org JobPosting data for search
 * engines; when that is there, its title, employer and description come first, since they are the ad itself.
 */
export function readablePage(html: string): { title: string | null; text: string; truncated: boolean } {
  const title = textOf(html.match(/<title\b[^<>]*>([\s\S]*?)(?:<\/title\s*>|$)/i)?.[1] ?? "").slice(0, maxTitleLength) || null;
  const posting = jobPosting(html);
  const body = textOf(
    html
      .replace(/<(script|style|noscript|svg|template|iframe|head|title)\b[^<>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, " ")
      .replace(/<!--[\s\S]*?(?:-->|$)/g, " ")
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article|header|footer)\s*>|<br\s*\/?>/gi, "\n"),
  );
  // Page text is untrusted: invisible and direction-changing characters go before anyone uses it (#68).
  const full = [posting, body].filter(Boolean).join("\n\n");
  const text = cleanModelText(full.slice(0, maxTextLength)).text.trim();
  return { title: title === null ? null : cleanModelText(title).text, text, truncated: full.length > maxTextLength };
}

/** The JobPosting in the page's JSON-LD, as plain text, or "" when there is none. */
function jobPosting(html: string): string {
  for (const match of html.matchAll(/<script\b([^<>]*)>([\s\S]*?)(?:<\/script\s*>|$)/gi)) {
    if (!/type\s*=\s*["']?application\/ld\+json/i.test(match[1])) continue;
    let data: unknown;
    try {
      data = JSON.parse(match[2]);
    } catch {
      continue;
    }
    const found = findPosting(data);
    if (found) {
      const employer = typeof found.hiringOrganization === "object" && found.hiringOrganization ? (found.hiringOrganization as { name?: unknown }).name : undefined;
      return [found.title, employer, typeof found.description === "string" ? textOf(found.description) : undefined]
        .filter((part): part is string => typeof part === "string" && part.trim() !== "")
        .join("\n");
    }
  }
  return "";
}

function findPosting(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findPosting(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const record = data as Record<string, unknown>;
  const type = record["@type"];
  if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) return record;
  return findPosting(record["@graph"] ?? null);
}

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—", pound: "£", hellip: "…" };

/** Tags out, entities decoded, spaces tidied, one blank line at most between blocks. */
function textOf(html: string): string {
  return html
    .replace(/<[^<>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
      if (name[0] === "#") {
        const code = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : " ";
      }
      return entities[name.toLowerCase()] ?? whole;
    })
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n[ \n]*/g, (gap) => (gap.split("\n").length > 2 ? "\n\n" : "\n"))
    .trim();
}
