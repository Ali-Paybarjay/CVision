import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { askModel } from "@/shared/ai";

// no-network.ts runs before this file through setupFiles, as it does before every unit test file.
describe("unit tests and the network", () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    server = createServer((_request, response) => response.end("ok"));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("blocks a fetch to a real address with a clear message", async () => {
    await expect(fetch("https://api.anthropic.com/v1/messages", { method: "POST" })).rejects.toThrow(
      "Unit tests cannot reach the network: a fetch to https://api.anthropic.com was blocked.",
    );
    await expect(fetch(new Request("https://example.supabase.co/rest/v1/jobs"))).rejects.toThrow(
      "a fetch to https://example.supabase.co was blocked",
    );
    await expect(fetch(new URL("http://192.168.1.10:3000/"))).rejects.toThrow("a fetch to http://192.168.1.10:3000 was blocked");
  });

  it("lets a test reach this computer", async () => {
    const response = await fetch(`http://127.0.0.1:${port}/`);

    expect(await response.text()).toBe("ok");
  });

  it("hands localhost to the real fetch", async () => {
    // Nothing listens on port 1, so the real fetch fails, but with its own error, not the block.
    const error = await fetch("http://localhost:1/").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("cannot reach the network");
  });

  it("leaves no API key, so live mode by mistake stops before calling Claude", async () => {
    vi.stubEnv("AI_MODE", "live");

    expect(process.env.ANTHROPIC_API_KEY).toBe("");
    await expect(
      askModel({ feature: "test", prompt: "x", schema: z.object({ ok: z.boolean() }), sample: { ok: true } }),
    ).rejects.toMatchObject({ reason: "no-api-key" });
  });
});
