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
// changes its answer in between (DNS rebinding) could slip through. Closing that means connecting with node:http or
// node:https and a lookup that checks the address at connect time (a few dozen lines, no new dependency). Not needed
// on Vercel today: there is no private network of ours to reach, and the port rule (80 and 443 only) keeps the
// function's own runtime API on 127.0.0.1:9001 out of reach, so keep that rule and its test.
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
  /** A web page with no readable text, such as one built only by JavaScript in the browser. */
  | "no-text"
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

      const bytes = await readBytes(response, maxBytes);
      if (bytes === null) return { ok: false, reason: "too-large" };
      const html = new TextDecoder(charsetOf(type) ?? metaCharset(bytes) ?? "utf-8").decode(bytes);
      const page = readablePage(html);
      if (page.text.length === 0) return { ok: false, reason: "no-text" };
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

/** The charset the header names, if TextDecoder knows it, so a windows-1252 "£" isn't garbled. */
function charsetOf(type: string): string | null {
  return knownCharset(type.match(/charset\s*=\s*"?([\w-]+)/i)?.[1]);
}

/** The charset a page names in a <meta> tag near its top, when the header names none. */
function metaCharset(bytes: Uint8Array): string | null {
  const start = new TextDecoder("latin1").decode(bytes.subarray(0, 2048));
  return knownCharset(start.match(/<meta\b[^<>]*charset\s*=\s*["']?([\w-]+)/i)?.[1]);
}

function knownCharset(label: string | undefined): string | null {
  if (!label) return null;
  try {
    return new TextDecoder(label).encoding;
  } catch {
    return null;
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

/** The body's bytes, or null once they pass maxBytes, so a huge page is never held in full. */
async function readBytes(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  if (!response.body) return new Uint8Array();
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
  return bytes;
}

/** Most of the page's text is in blocks a reader never sees: comments, scripts, styles and the like. */
const hiddenBlocks = /<!--[\s\S]*?(?:-->|$)|<(script|style|noscript|svg|template|iframe|title)\b[^<>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi;
/** Where a block ends, a line ends, so a list keeps one requirement per line. */
const blockEnds = /<\/(p|div|li|ul|ol|dd|dt|h[1-6]|tr|section|article|header|footer)\s*>|<br\s*\/?>/gi;
/** A page has at most a few JSON-LD blocks; a hostile one could have tens of thousands, each a failed JSON.parse. */
const maxJsonLdBlocks = 10;
/** JobPosting sits at the top of JSON-LD or in its @graph; deeper is not a job board's data. */
const maxJsonLdDepth = 4;

/**
 * The page's title and readable text. Most job boards also describe the ad as schema.org JobPosting data for search
 * engines. When that has a description, it is the ad itself, so the text is the posting alone: the page around it
 * repeats the same ad among menus and cookie banners. Without one, the page's own text follows the posting's title.
 */
export function readablePage(html: string): { title: string | null; text: string; truncated: boolean } {
  const head = html.replace(/<svg\b[^<>]*>[\s\S]*?(?:<\/svg\s*>|$)/gi, " ");
  const pageTitle = textOf(head.match(/<title\b[^<>]*>([\s\S]*?)(?:<\/title\s*>|$)/i)?.[1] ?? "");
  const posting = jobPosting(html);
  const full = posting?.description
    ? posting.text
    : [posting?.text ?? "", htmlToText(html.replace(hiddenBlocks, " "))].filter(Boolean).join("\n\n");
  // Page text is untrusted: invisible and direction-changing characters go before anyone uses it (#68).
  const text = cleanModelText(wellFormed(full.slice(0, maxTextLength))).text.trim();
  const title = pageTitle ? cleanModelText(wellFormed(pageTitle.slice(0, maxTitleLength))).text : null;
  return { title, text, truncated: full.length > maxTextLength };
}

/** HTML as plain text, a line per block. */
function htmlToText(html: string): string {
  return withoutRepeats(textOf(html.replace(blockEnds, "\n")));
}

/**
 * A shorter copy stays, unless it is a whole block of three or more lines: a short line such as "Essential" belongs to
 * every row of a person specification's table.
 */
const minRepeatLength = 200;

/**
 * The text without a block printed twice in a row. NHS Jobs prints each section of an ad twice, once for wide screens
 * and once for phones, so the job description and the person specification came twice (#411). Only whole copies go:
 * lines that repeat, line for line, the block just before them, with at most one line between a single copy and its
 * block, such as the heading the phone copy opens with. A copy goes once it reaches minRepeatLength characters, or at
 * any length when it is a whole block of three or more lines straight after the first. Lines after a copy that only
 * begin like it, such as the next group's Essential heading, stay. So does text repeated further away, so a criterion
 * listed twice keeps its own heading; NHS Jobs' Details block (band, pay, contract) comes near the top and again near
 * the bottom, so it stays twice. Blank lines are skipped when comparing and go with the copy. One pass, with a Map of
 * where each line last came.
 */
function withoutRepeats(text: string): string {
  const lines = text.split("\n");
  /** Where each line that isn't blank sits in `lines`, in order: stretches are measured in these positions. */
  const filled: number[] = [];
  lines.forEach((line, index) => {
    if (line !== "") filled.push(index);
  });
  const lastSeen = new Map<string, number>();
  const drop = new Array<boolean>(lines.length).fill(false);
  let start = -1;
  let period = 0;
  let length = 0;
  const endStretch = (end: number) => {
    if (start >= 0) {
      const count = end - start;
      // Whole copies only, and a single copy one line short of its period is whole: one line sat between it and its block.
      const cut = count + 1 === period ? end : start + Math.floor(count / period) * period;
      for (let position = cut; position < end; position++) length -= lines[filled[position]].length;
      const copied = cut - start;
      if ((length >= minRepeatLength && copied > 0 && copied >= period - 1) || (period >= 3 && copied >= period)) {
        drop.fill(true, filled[start], cut < filled.length ? filled[cut] : lines.length);
      }
    }
    start = -1;
    length = 0;
  };
  filled.forEach((index, position) => {
    const line = lines[index];
    const previous = lastSeen.get(line);
    lastSeen.set(line, position);
    if (start >= 0 && lines[filled[position - period]] === line) {
      length += line.length;
      return;
    }
    endStretch(position);
    if (previous === undefined) return;
    start = position;
    period = position - previous;
    length = line.length;
  });
  endStretch(filled.length);
  return lines
    .filter((_, index) => !drop[index])
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type Posting = { text: string; description: boolean };

/** The JobPosting in the page's JSON-LD as plain text: title, employer, then the description, a line per block. */
function jobPosting(html: string): Posting | null {
  let blocks = 0;
  for (const match of html.matchAll(/<script\b([^<>]*)>([\s\S]*?)(?:<\/script\s*>|$)/gi)) {
    if (!/type\s*=\s*["']?application\/ld\+json/i.test(match[1])) continue;
    if (++blocks > maxJsonLdBlocks) break;
    let data: unknown;
    try {
      data = JSON.parse(match[2]);
    } catch {
      continue;
    }
    const found = findPosting(data, 0);
    if (!found) continue;
    const raw = typeof found.description === "string" ? found.description : "";
    // Some boards escape the description's HTML (&lt;li&gt;) as well as putting it in JSON.
    const description = htmlToText(/&lt;\/?[a-z]/i.test(raw) ? decodeEntities(raw) : raw);
    const parts = [textOf(String(found.title ?? "")), employerOf(found.hiringOrganization), description];
    return { text: parts.filter(Boolean).join("\n"), description: description !== "" };
  }
  return null;
}

/** The employer's name, whether the posting gives a name, an Organization, or a list of either. */
function employerOf(value: unknown): string {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first === "string") return textOf(first);
  if (typeof first === "object" && first !== null && typeof (first as { name?: unknown }).name === "string") {
    return textOf((first as { name: string }).name);
  }
  return "";
}

function findPosting(data: unknown, depth: number): Record<string, unknown> | null {
  if (depth > maxJsonLdDepth) return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findPosting(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const record = data as Record<string, unknown>;
  const type = record["@type"];
  if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) return record;
  return findPosting(record["@graph"] ?? null, depth + 1);
}

const entities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  ndash: "–",
  mdash: "—",
  pound: "£",
  euro: "€",
  hellip: "…",
  bull: "•",
  middot: "·",
  copy: "©",
  eacute: "é",
  egrave: "è",
  agrave: "à",
  ccedil: "ç",
};

/** What pages write as &#145; to &#151;: the windows-1252 meanings, not the invisible C1 controls. */
const windows1252: Record<number, string> = { 128: "€", 133: "…", 145: "‘", 146: "’", 147: "“", 148: "”", 149: "•", 150: "–", 151: "—" };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] !== "#") return entities[name.toLowerCase()] ?? whole;
    const code = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    if (windows1252[code]) return windows1252[code];
    // No half of a surrogate pair (Postgres refuses it in jsonb), no control character, nothing past Unicode.
    const usable = Number.isFinite(code) && code >= 32 && code < 0x110000 && !(code >= 0x7f && code <= 0x9f) && !(code >= 0xd800 && code <= 0xdfff);
    return usable ? String.fromCodePoint(code) : " ";
  });
}

/** A cut can split an emoji in two; half of one would make the text unsavable, so it becomes U+FFFD. */
function wellFormed(text: string): string {
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "�");
}

/** Tags out, entities decoded, spaces tidied, one blank line at most between blocks. */
function textOf(html: string): string {
  return decodeEntities(html.replace(/<[^<>]*>/g, " "))
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n[ \n]*/g, (gap) => (gap.split("\n").length > 2 ? "\n\n" : "\n"))
    .trim();
}
