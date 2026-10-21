import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AskModelError } from "@/shared/ai";
import { cvConsent } from "../consent";
import { MAX_CV_BYTES } from "../cv-limits";
import { describeAiError, handleExtractRequest, statusFor, type ExtractResponse } from "./extract-request";

const docxType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const sampleCv = (name: string) =>
  new File([readFileSync(join(process.cwd(), "sample-data", "cvs", `${name}.docx`))], `${name}.docx`, { type: docxType });

function form(fields: { cv?: File; consent?: string }): FormData {
  const data = new FormData();
  if (fields.cv) data.set("cv", fields.cv);
  if (fields.consent !== undefined) data.set("consent", fields.consent);
  return data;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("handleExtractRequest", () => {
  it("reads an uploaded Word CV into a Profile", async () => {
    const response = await handleExtractRequest(form({ cv: sampleCv("daniel"), consent: cvConsent.version }));

    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.profile.fullName).toBe("Daniel Brooks");
    expect(response.format).toBe("docx");
    expect(response.truncated).toBe(false);
    // Mock mode says whose sample profile it is, and returns the text read from the file.
    expect(response.demo?.persona).toBe("Daniel Brooks");
    expect(response.demo?.text).toContain("Store Manager, Hartley's Home Stores, Birmingham");
  });

  it("shows the text of any CV in mock mode, even one that names no persona", async () => {
    const own = new File(
      [readFileSync(join(process.cwd(), "sample-data", "cvs", "sara.docx"))],
      "my-cv.docx",
      { type: docxType },
    );
    const response = await handleExtractRequest(form({ cv: own, consent: cvConsent.version }));

    expect(response.ok && response.demo?.text.length).toBeGreaterThan(100);
  });

  it("reads nothing without the user's consent", async () => {
    const response = await handleExtractRequest(form({ cv: sampleCv("sara") }));
    expect(response).toMatchObject({ ok: false, code: "consent" });
  });

  it("does not accept consent to older wording", async () => {
    const response = await handleExtractRequest(form({ cv: sampleCv("sara"), consent: "2020-01-01" }));
    expect(response).toMatchObject({ ok: false, code: "consent" });
  });

  it("asks for a file when there is none", async () => {
    const response = await handleExtractRequest(form({ consent: cvConsent.version }));
    expect(response).toMatchObject({ ok: false, code: "missing" });
  });

  it("refuses a file over the size limit before reading it", async () => {
    const big = new File([new Uint8Array(MAX_CV_BYTES + 1)], "cv.pdf", { type: "application/pdf" });
    const response = await handleExtractRequest(form({ cv: big, consent: cvConsent.version }));
    expect(response).toMatchObject({ ok: false, code: "too-large" });
  });

  it("explains a file it cannot use", async () => {
    const text = new File(["My CV in plain text"], "cv.txt", { type: "text/plain" });
    const response = await handleExtractRequest(form({ cv: text, consent: cvConsent.version }));
    expect(response).toMatchObject({ ok: false, code: "wrong-type" });
  });
});

describe("statusFor", () => {
  const failure = (code: Extract<ExtractResponse, { ok: false }>["code"]): ExtractResponse => ({ ok: false, code, message: "" });

  it("maps each answer to an HTTP status", () => {
    expect(statusFor(failure("consent"))).toBe(400);
    expect(statusFor(failure("forbidden"))).toBe(403);
    expect(statusFor(failure("too-large"))).toBe(413);
    expect(statusFor(failure("limit-reached"))).toBe(429);
    expect(statusFor(failure("ai-failed"))).toBe(502);
  });
});

describe("describeAiError", () => {
  it("never shows the user the technical error", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const invalid = describeAiError(new AskModelError("schema mismatch at experience.0", "invalid-answer"), "We couldn't read it.");
    expect(invalid).toEqual({ code: "ai-failed", message: "We couldn't read it. Try again in a moment." });

    expect(describeAiError(new AskModelError("no key", "no-api-key"), "x").code).toBe("ai-unavailable");
    expect(describeAiError(Object.assign(new Error("rate limited"), { status: 429 }), "x").code).toBe("ai-busy");
    expect(describeAiError(new Error("socket hang up"), "x").code).toBe("ai-unavailable");
  });

  it("passes on the daily limit message, which is written for the user", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const limit = new AskModelError("You have reached today's limit. Try again tomorrow.", "refused");
    Object.defineProperty(limit, "reason", { value: "limit-reached" });

    expect(describeAiError(limit, "x")).toEqual({ code: "limit-reached", message: "You have reached today's limit. Try again tomorrow." });
  });
});
