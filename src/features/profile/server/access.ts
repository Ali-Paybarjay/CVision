import "server-only";
import type { AiMode, Requester } from "@/shared/ai";

/** Whether a request may use the model, and whose daily limit it counts against. */
export type ModelAccess = { allowed: true; requester: Requester | undefined } | { allowed: false };

/**
 * In live mode only signed-in users may reach the model, and each request counts against their own
 * daily limit, not the shared one for the free CV check. In mock mode no model is called, so the demo
 * stays open to everyone.
 */
export function modelAccessFor(user: { id: string } | null, mode: AiMode): ModelAccess {
  if (user) return { allowed: true, requester: { userId: user.id } };
  return mode === "mock" ? { allowed: true, requester: undefined } : { allowed: false };
}
