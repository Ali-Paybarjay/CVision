import "server-only";
import { getCurrentUser } from "@/features/account/current-user";
import { AskModelError, getAiMode, type Requester } from "@/shared/ai";

/** Whether Tailor may ask the model, and whose daily limit the request counts against. */
export type ModelAccess = { allowed: true; requester: Requester | undefined } | { allowed: false; message: string };

/**
 * In live mode only signed-in users reach the model, and each request counts against their own daily limit,
 * not the shared one for the free CV check. In mock mode no model is called, so the demo stays open to everyone.
 */
export async function tailorModelAccess(): Promise<ModelAccess> {
  const user = await getCurrentUser();
  if (user) return { allowed: true, requester: { userId: user.id } };
  if (getAiMode() === "mock") return { allowed: true, requester: undefined };
  return { allowed: false, message: "Sign in to get suggestions for your CV." };
}

/**
 * The message the user sees when the model fails: the daily limit's own message, or a plain retry.
 * Logs the reason only, never CV or letter text.
 */
export function modelFailureMessage(error: unknown, step: string, fallback: string): string {
  if (error instanceof AskModelError && error.reason === "limit-reached") return error.message;
  const reason = error instanceof AskModelError ? error.reason : error instanceof Error ? error.name : "unknown";
  console.error(`tailor: could not ${step} (${reason})`);
  return fallback;
}
