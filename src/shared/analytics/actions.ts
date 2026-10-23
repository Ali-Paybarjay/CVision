"use server";

import { after } from "next/server";
import { z } from "zod";
import { getAnonymousKey } from "@/shared/ai/anonymous-key";
import { getSignedInUserId } from "@/shared/supabase/session";
import { track } from "./track";

// Anyone can call a Server Action, so the browser may only send these fixed values.
const HomeCtaClickSchema = z.object({
  cta: z.enum(["get_started", "cv_check"]),
  placement: z.enum(["header", "hero"]),
});
export type HomeCtaClick = z.infer<typeof HomeCtaClickSchema>;

/** Records home.cta_clicked for a call to action on the home page. Never throws, so it cannot hold up the click. */
export async function trackHomeCtaClick(click: HomeCtaClick): Promise<void> {
  const parsed = HomeCtaClickSchema.safeParse(click);
  if (!parsed.success) return;

  after(async () => {
    const userId = await getSignedInUserId();
    await track("home.cta_clicked", parsed.data, userId ? { userId } : await getAnonymousKey());
  });
}
