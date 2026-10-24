import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AskModelOptions } from "@/shared/ai";
import { POST } from "./route";

const anonymousKey = vi.hoisted(() => ({ anonymousKey: "visitor-key-1" }));

// Records what the check passes to askModel. A test can make it fail the way askModel does.
const asked = vi.hoisted(() => [] as AskModelOptions<never>[]);
const failWith = vi.hoisted(() => ({ value: null as null | "limit-reached" }));
vi.mock("@/shared/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/ai")>();
  return {
    ...actual,
    getAnonymousKey: async () => anonymousKey,
    askModel: async (options: AskModelOptions<never>) => {
      asked.push(options);
      if (failWith.value) throw new actual.AskModelError("You have used today's free checks. Create a free account to keep going.", failWith.value);
      return actual.askModel(options);
    },
  };
});

const deferred = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), after: (work: () => unknown) => deferred.push(work) }));

const tracked = vi.hoisted(() => [] as { name: string; properties: Record<string, unknown>; actor: unknown }[]);
vi.mock("@/shared/analytics/track", () => ({
  track: async (name: string, properties: Record<string, unknown>, actor: unknown) => void tracked.push({ name, properties, actor }),
}));

const saraCv = () => new Uint8Array(readFileSync(join(process.cwd(), "sample-data", "cvs", "sara.docx")));

/** A fictional CV, long enough to be checked. */
const pastedCv = `Alex Morgan
Leeds | 07700 900123 | alex.morgan@example.com

Personal profile
Customer service adviser with four years of experience in busy contact centres, looking for a team leader role.

Work experience
Customer Service Adviser, Northern Energy, Leeds, March 2021 to present
Answered around 60 customer calls a day about bills and meter readings.
Trained five new advisers on the billing system.

Education
BA History, University of Leeds, 2:1`;

function request(form: FormData, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/cv-check/api", { method: "POST", body: form, headers });
}

function withFile(bytes: Uint8Array<ArrayBuffer>, name: string): FormData {
  const form = new FormData();
  form.set("cv", new File([bytes], name));
  return form;
}

function withText(text: string): FormData {
  const form = new FormData();
  form.set("cvText", text);
  return form;
}

async function runDeferred() {
  for (const work of deferred.splice(0)) await work();
}

afterEach(() => {
  asked.length = 0;
  tracked.length = 0;
  deferred.length = 0;
  failWith.value = null;
});

describe("POST /cv-check/api", () => {
  it("checks an uploaded Word CV without sign-in and counts it against the visitor's free checks", async () => {
    const response = await POST(request(withFile(saraCv(), "sara.docx")));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, truncated: false, result: { readiness: "nearly-ready", score: 68 } });
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ feature: "cv-check", requester: anonymousKey });
    // The model sees the CV's text, inside the prompt's <cv> tags.
    expect(asked[0].prompt).toMatch(/<cv>\n[\s\S]*Sara Khan[\s\S]*\n<\/cv>/);
  });

  it("checks pasted text", async () => {
    const response = await POST(request(withText(pastedCv)));

    expect(response.status).toBe(200);
    expect(asked[0].prompt).toContain("Trained five new advisers on the billing system.");
  });

  it("records cvcheck.completed with the score and the number of issues only", async () => {
    await POST(request(withText(pastedCv)));
    await runDeferred();

    expect(tracked).toEqual([{ name: "cvcheck.completed", properties: { score: 68, issues: 4 }, actor: anonymousKey }]);
  });

  it("asks for the whole CV when the pasted text is too short, without calling the model", async () => {
    const response = await POST(request(withText("Alex Morgan, customer service adviser")));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, code: "too-short" });
    expect(asked).toHaveLength(0);
  });

  it("asks for a CV when the form has neither a file nor text", async () => {
    const response = await POST(request(new FormData()));

    expect(await response.json()).toMatchObject({ ok: false, code: "missing" });
    expect(asked).toHaveLength(0);
  });

  it("explains a file it cannot read, without calling the model", async () => {
    const oldWord = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    const response = await POST(request(withFile(oldWord, "cv.doc")));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, code: "wrong-type", message: expect.stringContaining(".docx") });
    expect(asked).toHaveLength(0);
  });

  it("passes on the free daily limit's message and records no event", async () => {
    failWith.value = "limit-reached";

    const response = await POST(request(withText(pastedCv)));
    await runDeferred();

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ ok: false, code: "limit-reached", message: expect.stringContaining("free account") });
    expect(tracked).toHaveLength(0);
  });

  it("refuses a request from another site", async () => {
    const response = await POST(request(withText(pastedCv), { origin: "https://elsewhere.example", host: "localhost:3000" }));

    expect(response.status).toBe(403);
    expect(asked).toHaveLength(0);
  });

  it("is never cached", async () => {
    const response = await POST(request(withText(pastedCv)));
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
