import type { Profile } from "@/shared/contracts";
import type { ConsentRecord } from "./consent";
import type { FollowUpQuestion } from "./follow-up";
import type { StoredProfile } from "./profile-store";
import type { AccountProfile } from "./server/profile-account";
import type { CvFormat } from "./server/read-cv";

/** The approved profile as the profile page shows it, wherever it is kept. */
export type SavedProfile = {
  profile: Profile;
  /** When it last changed, in UTC. */
  savedAt: string;
  /**
   * The consent given with the CV. In this browser it is kept with the profile. In the account it is recorded
   * with the save (the profile.approved event), so after a reload the page doesn't have it.
   */
  consent: ConsentRecord | null;
  /** The latest follow-up questions. In the account they last until the page is reloaded. */
  questions: FollowUpQuestion[];
  /** The format of the CV file kept in the account, or null. */
  cvFormat: CvFormat | null;
};

export function fromBrowser(stored: StoredProfile): SavedProfile {
  return { profile: stored.profile, savedAt: stored.savedAt, consent: stored.consent, questions: stored.questions, cvFormat: null };
}

export function fromAccount(account: AccountProfile): SavedProfile {
  return { profile: account.profile, savedAt: account.savedAt, consent: null, questions: [], cvFormat: account.cvFormat };
}
