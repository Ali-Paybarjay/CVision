import { afterEach, describe, expect, it, vi } from "vitest";
import { cvFileMessages } from "../cv-limits";
import { uploadCv } from "./upload-step";

// uploadCv never throws: each way an upload can fail ends in a message the user can act on.

afterEach(() => {
  vi.unstubAllGlobals();
});

function answer(body: string, status: number, contentType = "text/plain") {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status, headers: { "Content-Type": contentType } })));
}

describe("uploadCv", () => {
  it("passes on the server's own answer", async () => {
    const own = { ok: false, code: "consent", message: "Tick the box to agree, so we can read your CV." };
    answer(JSON.stringify(own), 400, "application/json");

    expect(await uploadCv(new FormData())).toEqual(own);
  });

  it("asks the user to check their connection only when the request never arrived", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));

    expect(await uploadCv(new FormData())).toMatchObject({
      ok: false,
      message: "We couldn’t reach CVision. Check your connection and try again.",
    });
  });

  it("says when reading the CV ran out of time", async () => {
    answer("An error occurred with your deployment\n\nFUNCTION_INVOCATION_TIMEOUT", 504);

    expect(await uploadCv(new FormData())).toMatchObject({ ok: false, message: "Reading your CV took too long. Try again in a minute." });
  });

  it("says when the file was too big for the host", async () => {
    answer("Request Entity Too Large", 413);

    expect(await uploadCv(new FormData())).toEqual({ ok: false, code: "too-large", message: cvFileMessages.tooLarge });
  });

  it("says something went wrong on our side for any other answer that isn't ours", async () => {
    answer("<html><body>Internal Server Error</body></html>", 500, "text/html");

    expect(await uploadCv(new FormData())).toMatchObject({
      ok: false,
      message: "Something went wrong on our side. Try again in a minute.",
    });
  });
});
