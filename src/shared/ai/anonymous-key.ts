import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";

/**
 * A daily, one-way key for a visitor who is not signed in (the free CV check),
 * so daily limits work without storing their IP address.
 * Call it from a Server Action or Route Handler.
 */
export async function getAnonymousKey(): Promise<{ anonymousKey: string }> {
  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || "unknown";
  return { anonymousKey: hashVisitor(ip, new Date()) };
}

export function hashVisitor(ip: string, day: Date): string {
  const salt = process.env.ANONYMOUS_KEY_SALT ?? "cvision-local-development";
  const date = day.toISOString().slice(0, 10);
  return createHash("sha256").update(`${salt}:${date}:${ip}`).digest("hex").slice(0, 32);
}
