import type { Profile } from "@/shared/contracts";
import { isManualConsent, type ConsentRecord } from "./consent";
import type { StoredProfile } from "./profile-store";
import type { AccountProfile } from "./server/profile-account";
import type { CvFormat } from "./server/read-cv";

/** The approved profile as the profile page shows it, wherever it is kept. */
export type SavedProfile = {
  profile: Profile;
  /** When it last changed, in UTC. */
  savedAt: string;
  /**
   * The consent given with the CV, or for a profile typed in by hand. In this browser it is kept with the profile. In
   * the account it is recorded with the save (the profile.approved event), so after a reload the page doesn't have it.
   */
  consent: ConsentRecord | null;
  /** The format of the CV file kept in the account, or null. */
  cvFormat: CvFormat | null;
};

export function fromBrowser(stored: StoredProfile): SavedProfile {
  return { profile: stored.profile, savedAt: stored.savedAt, consent: stored.consent, cvFormat: null };
}

export function fromAccount(account: AccountProfile): SavedProfile {
  return { profile: account.profile, savedAt: account.savedAt, consent: null, cvFormat: account.cvFormat };
}

/** True when the profile came from a CV, so another upload is "a new CV". A profile typed in by hand has none. */
export function builtFromCv(saved: SavedProfile): boolean {
  return saved.cvFormat !== null || (saved.consent !== null && !isManualConsent(saved.consent));
}
