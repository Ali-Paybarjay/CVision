// The tailored CV as it was sent (#207): saved when the user downloads it or presses Apply, and shown again later
// exactly as it was, whatever the Profile says by then. Pure code, so the server and the tests share it.
import type { Job, Profile, TailoredCv as SavedTailoredCv, TailoringChange } from "@/shared/contracts";
import { normalise } from "./nothing-invented";
import { buildTailoredCv, roleForNewLine, type TailoredCv } from "./tailored-cv";

const same = (a: string, b: string) => normalise(a) === normalise(b);

/** The sections whose lines are plain text in the Profile, so an approved change can be written into it. */
const textSections = new Set<TailoringChange["section"]>(["summary", "skills", "experience"]);

/**
 * The Profile with the approved changes written in, as the contract's `cv` asks: a changed line replaces the line it
 * was made from, and a new line goes where the tailored CV shows it (a new work line under the role its evidence names, or the latest
 * role, #446).
 * Education and certificates are structured in the Profile, so their changes stay in `changes` only and are applied
 * again when the saved CV is shown (savedCvLayout).
 */
export function applyApprovedChanges(profile: Profile, changes: TailoringChange[]): Profile {
  const approved = changes.filter((change) => change.status === "approved" && textSections.has(change.section));
  const used = new Set<string>();
  const swap = (line: string, section: TailoringChange["section"]) => {
    const change = approved.find((item) => item.section === section && !used.has(item.id) && item.before !== null && same(item.before, line));
    if (!change) return line;
    used.add(change.id);
    return change.after;
  };
  const added = (section: TailoringChange["section"]) =>
    approved.filter((change) => change.section === section && change.before === null && !used.has(change.id)).map((change) => (used.add(change.id), change.after));

  const summary = profile.summary.trim() ? swap(profile.summary, "summary") : (added("summary")[0] ?? profile.summary);
  const experience = profile.experience.map((role) => ({
    ...role,
    duties: role.duties.map((line) => swap(line, "experience")),
    achievements: role.achievements.map((line) => swap(line, "experience")),
  }));
  for (const change of approved.filter((item) => item.section === "experience" && item.before === null && !used.has(item.id))) {
    const index = roleForNewLine(profile, change);
    if (index < 0) continue;
    used.add(change.id);
    experience[index] = { ...experience[index], duties: [...experience[index].duties, change.after] };
  }
  const skills = [...profile.skills.map((line) => swap(line, "skills")), ...added("skills")];

  return { ...profile, summary, skills, experience };
}

/**
 * The saved CV laid out as the Tailor page shows it, with the tailored lines marked. The text changes are already in
 * `cv`, so each is matched to its own new line; education and certificate changes are applied as on the Tailor page.
 */
export function savedCvLayout(saved: SavedTailoredCv, job?: Job): TailoredCv {
  const marks = saved.changes
    .filter((change) => change.status === "approved")
    .map((change) => (textSections.has(change.section) ? { ...change, before: change.after } : change));
  return buildTailoredCv(saved.cv, marks, job);
}
