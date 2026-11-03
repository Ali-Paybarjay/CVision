import { describe, expect, it, vi } from "vitest";
import { fetchPublicPage, isPrivateAddress, readablePage } from "./fetch-page";

// No test reaches the network (CLAUDE.md, rule 10): fetch and the DNS lookup are both stand-ins.

const publicLookup = async () => ["93.184.216.34"];

function page(body: string, init: { status?: number; type?: string; headers?: Record<string, string> } = {}) {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { "content-type": init.type ?? "text/html; charset=utf-8", ...init.headers },
  });
}

function redirect(location: string, status = 302) {
  return new Response(null, { status, headers: { location } });
}

const ad = `<!doctype html><html><head><title>Junior Data Analyst – Pennine Health</title>
<style>.x{color:red}</style><script>window.track = 1;</script></head>
<body><nav>Jobs · Sign in</nav><h1>Junior Data Analyst</h1><p>You will write SQL &amp; build dashboards.</p>
<ul><li>Strong SQL</li><li>Excel</li></ul><!-- tracking --></body></html>`;

describe("fetchPublicPage", () => {
  it("returns the page's title and readable text, without scripts, styles or comments", async () => {
    const fetch = vi.fn(async () => page(ad));
    const result = await fetchPublicPage("https://jobs.example.com/ad/1", { fetch, lookup: publicLookup });

    expect(result).toMatchObject({ ok: true, url: "https://jobs.example.com/ad/1", title: "Junior Data Analyst – Pennine Health" });
    if (!result.ok) throw new Error("expected a page");
    expect(result.text).toContain("You will write SQL & build dashboards.");
    expect(result.text).toContain("Strong SQL\nExcel");
    expect(result.text).not.toMatch(/color:red|window\.track|tracking/);
  });

  it("asks for a web page, as a named bot, and never follows redirects by itself", async () => {
    const fetch = vi.fn(async (_url: URL | RequestInfo, _init?: RequestInit) => page(ad));
    await fetchPublicPage("https://jobs.example.com/ad/1", { fetch, lookup: publicLookup });

    const init = fetch.mock.calls[0][1];
    expect(init?.redirect).toBe("manual");
    expect((init?.headers as Record<string, string>)["user-agent"]).toContain("CVisionBot");
  });

  it.each([
    ["file:///etc/passwd"],
    ["ftp://jobs.example.com/ad"],
    ["javascript:alert(1)"],
    ["https://user:secret@jobs.example.com/ad"],
    ["https://jobs.example.com:8443/ad"],
    ["http://localhost/ad"],
    ["http://app.localhost/ad"],
    ["http://127.0.0.1/ad"],
    ["http://[::1]/ad"],
    ["http://169.254.169.254/latest/meta-data"],
    ["http://10.0.0.5/ad"],
    ["http://192.168.1.1/ad"],
    ["http://[::ffff:10.0.0.1]/ad"],
    ["not a link"],
  ])("refuses %s before opening anything", async (link) => {
    const fetch = vi.fn(async () => page(ad));
    expect(await fetchPublicPage(link, { fetch, lookup: publicLookup })).toEqual({ ok: false, reason: "invalid-url" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses a public-looking name that points at a private address", async () => {
    const fetch = vi.fn(async () => page(ad));
    const lookup = async () => ["93.184.216.34", "10.1.2.3"];
    expect(await fetchPublicPage("https://sneaky.example.com/ad", { fetch, lookup })).toEqual({ ok: false, reason: "invalid-url" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses a name that can't be looked up", async () => {
    const lookup = async () => {
      throw new Error("ENOTFOUND");
    };
    expect(await fetchPublicPage("https://nowhere.example.com/ad", { fetch: vi.fn(), lookup })).toEqual({ ok: false, reason: "invalid-url" });
  });

  it("follows a redirect to a public page, checking it again", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(redirect("/jobs/1")).mockResolvedValueOnce(page(ad));
    const result = await fetchPublicPage("https://jobs.example.com/r/abc", { fetch, lookup: publicLookup });

    expect(result).toMatchObject({ ok: true, url: "https://jobs.example.com/jobs/1" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("stops at a redirect to a private address", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(redirect("http://169.254.169.254/latest/meta-data"));
    expect(await fetchPublicPage("https://jobs.example.com/r/abc", { fetch, lookup: publicLookup })).toEqual({ ok: false, reason: "invalid-url" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("says the site wants a sign-in when it redirects there", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(redirect("https://www.linkedin.com/authwall?trk=job"));
    expect(await fetchPublicPage("https://www.linkedin.com/jobs/view/1", { fetch, lookup: publicLookup })).toEqual({ ok: false, reason: "blocked" });
  });

  it("gives up after three redirects", async () => {
    const fetch = vi.fn(async () => redirect("/again"));
    expect(await fetchPublicPage("https://jobs.example.com/loop", { fetch, lookup: publicLookup })).toEqual({ ok: false, reason: "failed" });
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it.each([
    [403, "blocked"],
    [401, "blocked"],
    [429, "blocked"],
    [999, "blocked"],
    [404, "not-found"],
    [410, "not-found"],
    [500, "failed"],
  ] as const)("reads status %i as %s", async (status, reason) => {
    // new Response() only takes 200 to 599, so LinkedIn's 999 is a plain stand-in.
    const answer = status === 999 ? ({ status, ok: false, headers: new Headers() } as Response) : new Response("no", { status, headers: { "content-type": "text/html" } });
    const fetch = vi.fn(async () => answer);
    expect(await fetchPublicPage("https://jobs.example.com/ad", { fetch, lookup: publicLookup })).toEqual({ ok: false, reason });
  });

  it("says a PDF or an image is not a web page", async () => {
    const fetch = vi.fn(async () => page("%PDF-1.7", { type: "application/pdf" }));
    expect(await fetchPublicPage("https://jobs.example.com/ad.pdf", { fetch, lookup: publicLookup })).toEqual({ ok: false, reason: "not-a-page" });
  });

  it("stops reading a page larger than the limit", async () => {
    const fetch = vi.fn(async () => page(`<p>${"x".repeat(5000)}</p>`));
    expect(await fetchPublicPage("https://jobs.example.com/big", { fetch, lookup: publicLookup, maxBytes: 1000 })).toEqual({ ok: false, reason: "too-large" });
    const declared = vi.fn(async () => page("<p>small</p>", { headers: { "content-length": "999999" } }));
    expect(await fetchPublicPage("https://jobs.example.com/big", { fetch: declared, lookup: publicLookup, maxBytes: 1000 })).toEqual({ ok: false, reason: "too-large" });
  });

  it("gives up on a slow site", async () => {
    const fetch = vi.fn(
      (_url: URL | RequestInfo, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    expect(await fetchPublicPage("https://slow.example.com/ad", { fetch, lookup: publicLookup, timeoutMs: 20 })).toEqual({ ok: false, reason: "too-slow" });
  });

  it("says a failed connection failed", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await fetchPublicPage("https://down.example.com/ad", { fetch, lookup: publicLookup })).toEqual({ ok: false, reason: "failed" });
  });

  it("treats a page with no readable text, such as an app shell, as blocked", async () => {
    const fetch = vi.fn(async () => page('<html><head><title>Jobs</title></head><body><div id="root"></div><script>app()</script></body></html>'));
    expect(await fetchPublicPage("https://jobs.example.com/app", { fetch, lookup: publicLookup })).toEqual({ ok: false, reason: "blocked" });
  });
});

describe("readablePage", () => {
  it("puts the schema.org JobPosting first: title, employer and description", () => {
    const posting = {
      "@context": "https://schema.org",
      "@graph": [{ "@type": "Organization", name: "Board" }, { "@type": "JobPosting", title: "Data Analyst", hiringOrganization: { name: "Acme" }, description: "<p>Use SQL &amp; Python.</p>" }],
    };
    const html = `<html><head><script type="application/ld+json">${JSON.stringify(posting)}</script></head><body><p>Cookie banner</p></body></html>`;

    expect(readablePage(html).text).toBe("Data Analyst\nAcme\nUse SQL & Python.\n\nCookie banner");
  });

  it("ignores JSON-LD it can't read", () => {
    const html = '<script type="application/ld+json">{not json</script><p>The ad</p>';
    expect(readablePage(html).text).toBe("The ad");
  });

  it("decodes entities, including numbered ones", () => {
    expect(readablePage("<p>£30,000 &#8211; &#x2014; caf&eacute;</p>").text).toBe("£30,000 – — caf&eacute;");
  });
});

describe("isPrivateAddress", () => {
  it.each(["127.0.0.1", "10.2.3.4", "172.20.0.1", "192.168.0.10", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fd00::1", "fe80::1", "::ffff:192.168.1.1", "not-an-ip"])(
    "blocks %s",
    (address) => expect(isPrivateAddress(address)).toBe(true),
  );

  it.each(["93.184.216.34", "8.8.8.8", "2606:4700::6810:85e5", "172.32.0.1"])("allows %s", (address) => expect(isPrivateAddress(address)).toBe(false));
});

describe("fetchPublicPage, hardening from the security review", () => {
  it.each([
    ["http://2130706433/ad"],
    ["http://0x7f.1/ad"],
    ["http://017700000001/ad"],
    ["http://127.1/ad"],
    ["http://localhost./ad"],
    ["http://[::127.0.0.1]/ad"],
    ["http://[64:ff9b::a9fe:a9fe]/ad"],
    ["http://[2002:a9fe:a9fe::]/ad"],
    ["http://192.0.2.10/ad"],
  ])("refuses %s, another way of writing a private address", async (link) => {
    const fetch = vi.fn(async () => page(ad));
    expect(await fetchPublicPage(link, { fetch, lookup: publicLookup })).toEqual({ ok: false, reason: "invalid-url" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses a name with no addresses", async () => {
    expect(await fetchPublicPage("https://empty.example.com/ad", { fetch: vi.fn(), lookup: async () => [] })).toEqual({ ok: false, reason: "invalid-url" });
  });

  it.each([["//169.254.169.254/latest/meta-data"], ["https://jobs.example.com:9001/runtime"], ["file:///etc/passwd"]])(
    "stops at a redirect to %s",
    async (location) => {
      const fetch = vi.fn().mockResolvedValueOnce(redirect(location));
      expect(await fetchPublicPage("https://jobs.example.com/r", { fetch, lookup: publicLookup })).toEqual({ ok: false, reason: "invalid-url" });
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it("gives up when the name server never answers", async () => {
    const lookup = () => new Promise<string[]>(() => {});
    const fetch = vi.fn();
    expect(await fetchPublicPage("https://silent.example.com/ad", { fetch, lookup, timeoutMs: 20 })).toEqual({ ok: false, reason: "too-slow" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads a page in the charset it declares", async () => {
    const pound = new Uint8Array([0x3c, 0x70, 0x3e, 0xa3, 0x33, 0x30, 0x2c, 0x30, 0x30, 0x30, 0x3c, 0x2f, 0x70, 0x3e]); // <p>£30,000</p> in windows-1252
    const fetch = vi.fn(async () => new Response(pound, { headers: { "content-type": "text/html; charset=windows-1252" } }));
    const result = await fetchPublicPage("https://jobs.example.com/ad", { fetch, lookup: publicLookup });
    expect(result).toMatchObject({ ok: true, text: "£30,000" });
  });
});

describe("readablePage, on hostile pages", () => {
  // Each of these used to make a pattern rescan the whole page from every "<": minutes for a 2 MB page.
  it.each([
    ["unclosed JSON-LD script tags", "<script type='application/ld+json' "],
    ["a page of <", "<"],
    ["unclosed script tags", "<script>"],
    ["unclosed comments", "<!--"],
    ["unclosed titles", "<title>"],
  ])("reads 200 KB of %s in well under a second", (_name, piece) => {
    const html = piece.repeat(Math.ceil(200_000 / piece.length));
    const started = performance.now();
    readablePage(html);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("caps the title and drops invisible characters from the text", () => {
    const { title, text } = readablePage(`<title>${"T".repeat(1000)}</title><p>Data&#x202E; Analyst</p>`);
    expect(title).toHaveLength(300);
    expect(text).toBe("Data Analyst");
  });
});
