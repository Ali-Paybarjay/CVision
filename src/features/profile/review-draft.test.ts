import { describe, expect, it } from "vitest";
import { type Profile } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";
import {
  draftFromProfile,
  isFullyApproved,
  normaliseLink,
  profileFromDraft,
  reviewProgress,
  reviewReducer,
  type ReviewAction,
  type ReviewDraft,
} from "./review-draft";

const sara = personas.sara.profile;

function apply(draft: ReviewDraft, ...actions: ReviewAction[]): ReviewDraft {
  return actions.reduce(reviewReducer, draft);
}

/** Approves every item, as a user clicking Approve on each would. */
function approveAll(draft: ReviewDraft): ReviewDraft {
  const keys = [
    draft.contact.key,
    draft.summary.key,
    draft.skills.key,
    ...draft.experience.map((item) => item.key),
    ...draft.education.map((item) => item.key),
    ...draft.certifications.map((item) => item.key),
  ];
  return apply(draft, ...keys.map((key): ReviewAction => ({ type: "approve", key })));
}

describe("review draft", () => {
  it.each(Object.keys(personas) as (keyof typeof personas)[])("turns %s's profile into a draft and back unchanged", (name) => {
    const profile = personas[name].profile;
    expect(profileFromDraft(approveAll(draftFromProfile(profile)), profile)).toEqual(profile);
  });

  it("starts with nothing approved, and counts every item", () => {
    const draft = draftFromProfile(sara);
    // Contact, summary, skills, two jobs and two qualifications.
    expect(reviewProgress(draft)).toEqual({ approved: 0, total: 7 });
    expect(isFullyApproved(draft)).toBe(false);
    expect(isFullyApproved(approveAll(draft))).toBe(true);
  });

  it("approves a valid item", () => {
    const draft = apply(draftFromProfile(sara), { type: "approve", key: "experience-0" });
    expect(draft.experience[0]).toMatchObject({ approved: true, errors: {} });
  });

  it("does not approve an item with a problem, and says what it is", () => {
    const draft = apply(
      draftFromProfile(sara),
      { type: "edit-experience", key: "experience-0", change: { title: " ", endDate: "2024-01" } },
      { type: "approve", key: "experience-0" },
    );

    expect(draft.experience[0].approved).toBe(false);
    expect(draft.experience[0].errors).toEqual({
      title: "Add the job title.",
      endDate: "The end month is before the start month.",
    });
  });

  it("needs approval again after an edit, and clears the edited field's error", () => {
    let draft = apply(draftFromProfile(sara), { type: "approve", key: "contact" });
    expect(draft.contact.approved).toBe(true);

    draft = apply(
      draft,
      { type: "edit-contact", change: { email: "not-an-email", fullName: "" } },
      { type: "approve", key: "contact" },
    );
    expect(draft.contact.errors).toEqual({
      fullName: "Add your full name.",
      email: "Check the email address, for example name@example.com.",
    });

    draft = apply(draft, { type: "edit-contact", change: { fullName: "Sara Khan" } });
    expect(draft.contact.approved).toBe(false);
    expect(draft.contact.errors).toEqual({ email: "Check the email address, for example name@example.com." });
  });

  it("removes an item and adds an empty one that must be filled in before approval", () => {
    let draft = apply(draftFromProfile(sara), { type: "remove", key: "experience-1" });
    expect(draft.experience.map((item) => item.value.company)).toEqual(["Northgate Retail Insights"]);

    draft = apply(draft, { type: "add", section: "certifications", key: "new-1" }, { type: "approve", key: "new-1" });
    expect(draft.certifications[0]).toMatchObject({ key: "new-1", approved: false, errors: { name: "Add the certificate’s name." } });
  });

  it("saves a current job with no end date, and keeps jobs newest first", () => {
    let draft = apply(draftFromProfile(sara), { type: "add", section: "experience", key: "new-job" });
    draft = apply(draft, {
      type: "edit-experience",
      key: "new-job",
      change: { title: "Junior Data Analyst", company: "Pennine Health Analytics", startDate: "2025-11", current: true, duties: "• Write SQL\n\n- Build Power BI dashboards\n" },
    });

    const profile = profileFromDraft(approveAll(draft), sara);

    expect(profile.experience[0]).toEqual({
      title: "Junior Data Analyst",
      company: "Pennine Health Analytics",
      location: undefined,
      startDate: "2025-11",
      endDate: null,
      duties: ["Write SQL", "Build Power BI dashboards"],
      achievements: [],
    });
    expect(profile.experience.map((job) => job.company)).toEqual(["Pennine Health Analytics", "Northgate Retail Insights", "Greenway Foods"]);
  });

  it("asks for an end month unless the user still works there", () => {
    const draft = apply(
      draftFromProfile(sara),
      { type: "edit-experience", key: "experience-0", change: { endDate: "", current: false } },
      { type: "approve", key: "experience-0" },
    );
    expect(draft.experience[0].errors.endDate).toBe("Add the month you left, or tick “I still work here”.");
  });

  it("accepts a LinkedIn link typed without https://, but never a script link", () => {
    let draft = apply(draftFromProfile(sara), { type: "edit-contact", change: { linkedIn: "linkedin.com/in/sara-khan" } }, { type: "approve", key: "contact" });
    expect(draft.contact.approved).toBe(true);
    expect(profileFromDraft(approveAll(draft), sara).contact.linkedIn).toBe("https://linkedin.com/in/sara-khan");

    draft = apply(draft, { type: "edit-contact", change: { linkedIn: "javascript:alert(1)" } }, { type: "approve", key: "contact" });
    expect(draft.contact.approved).toBe(false);
    expect(draft.contact.errors.linkedIn).toBeDefined();
  });

  it("checks a certificate's year", () => {
    const draft = apply(
      draftFromProfile(personas.reza.profile),
      { type: "edit-certification", key: "certification-0", change: { year: "26" } },
      { type: "approve", key: "certification-0" },
    );
    expect(draft.certifications[0].errors).toEqual({ year: "Use a four-digit year, for example 2024." });
  });

  it("drops repeated and empty skills", () => {
    const draft = apply(draftFromProfile(sara), { type: "edit-skills", list: ["SQL", " sql ", "", "Power BI"] });
    expect(profileFromDraft(approveAll(draft), sara).skills).toEqual(["SQL", "Power BI"]);
  });

  it("keeps the job search location in step with the contact location, unless the user set it apart", () => {
    const moved = apply(draftFromProfile(sara), { type: "edit-contact", change: { location: "Leeds" } });
    expect(profileFromDraft(approveAll(moved), sara).preferences.location).toBe("Leeds");

    const setApart: Profile = { ...sara, preferences: { ...sara.preferences, location: "Remote" } };
    const movedAgain = apply(draftFromProfile(setApart), { type: "edit-contact", change: { location: "Leeds" } });
    expect(profileFromDraft(approveAll(movedAgain), setApart).preferences.location).toBe("Remote");
  });
});

describe("normaliseLink", () => {
  it("adds https:// only when a link has no scheme", () => {
    expect(normaliseLink(" www.linkedin.com/in/emma ")).toBe("https://www.linkedin.com/in/emma");
    expect(normaliseLink("https://www.linkedin.com/in/emma")).toBe("https://www.linkedin.com/in/emma");
    expect(normaliseLink("")).toBeUndefined();
  });
});
