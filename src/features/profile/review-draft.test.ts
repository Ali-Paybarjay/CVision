import { describe, expect, it } from "vitest";
import { type Profile } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";
import { extractionFromProfile, type CvExtraction } from "./cv-extraction";
import { MAX_PROFILE_CHARACTERS, profileTooLongMessage } from "./cv-limits";
import {
  approvalFor,
  draftFromExtraction,
  draftFromProfile,
  emptyDraft,
  itemsWithProblems,
  newProfileBase,
  normaliseLink,
  profileFromDraft,
  readCvMonth,
  reviewReducer,
  type ReviewAction,
  type ReviewDraft,
} from "./review-draft";

const sara = personas.sara.profile;

/** Sara with the three sections the personas don't have (#227), one item filled in fully and one as sparse as a CV may be. */
const saraWithMore: Profile = {
  ...sara,
  volunteering: [
    {
      role: "Volunteer maths tutor",
      organisation: "Ancoats Reading Club",
      location: "Manchester",
      startDate: "2023-01",
      endDate: null,
      details: ["Tutor two Year 10 pupils every week"],
    },
    { role: "Charity shop assistant", details: ["Sorted donations on Saturdays"] },
  ],
  projects: [
    {
      name: "Late buses dashboard",
      organisation: "University of Manchester",
      startDate: "2025-01",
      endDate: "2025-05",
      details: ["Built a Tableau dashboard of late buses across Manchester"],
      url: "https://example.com/sara/late-buses",
    },
  ],
  languages: [{ name: "French", level: "B1" }, { name: "British Sign Language" }],
};

function apply(draft: ReviewDraft, ...actions: ReviewAction[]): ReviewDraft {
  return actions.reduce(reviewReducer, draft);
}

/** What the one Approve button at the end of the page does first: checks every item. */
function approve(draft: ReviewDraft): ReviewDraft {
  return apply(draft, { type: "check" });
}

describe("review draft", () => {
  it.each(Object.keys(personas) as (keyof typeof personas)[])("turns %s's profile into a draft and back unchanged", (name) => {
    const profile = personas[name].profile;
    const draft = approve(draftFromProfile(profile));

    expect(itemsWithProblems(draft)).toEqual([]);
    expect(profileFromDraft(draft, profile)).toEqual(profile);
  });

  it("shows no problems until the page is approved", () => {
    const draft = apply(draftFromProfile(sara), { type: "edit-experience", key: "experience-0", change: { title: " " } });

    expect(itemsWithProblems(draft)).toEqual([]);
    expect(itemsWithProblems(approve(draft))).toEqual(["experience-0"]);
  });

  it("checks every item at once, lists the ones to fix in page order, and says what each problem is", () => {
    const draft = approve(
      apply(
        draftFromProfile(sara),
        { type: "edit-experience", key: "experience-0", change: { title: " ", endDate: "2024-01" } },
        { type: "edit-contact", change: { email: "not-an-email" } },
      ),
    );

    expect(itemsWithProblems(draft)).toEqual(["contact", "experience-0"]);
    expect(draft.contact.errors).toEqual({ email: "Check the email address, for example name@example.com." });
    expect(draft.experience[0].errors).toEqual({
      title: "Add the job title.",
      endDate: "The end month is before the start month.",
    });
  });

  it("clears a problem as soon as its field is edited, and checks it again at the next approval", () => {
    let draft = approve(apply(draftFromProfile(sara), { type: "edit-contact", change: { email: "not-an-email", fullName: "" } }));
    expect(draft.contact.errors).toEqual({
      fullName: "Add your full name.",
      email: "Check the email address, for example name@example.com.",
    });

    draft = apply(draft, { type: "edit-contact", change: { fullName: "Sara Khan" } });
    expect(draft.contact.errors).toEqual({ email: "Check the email address, for example name@example.com." });

    draft = approve(apply(draft, { type: "edit-contact", change: { email: "sara.khan@example.com" } }));
    expect(itemsWithProblems(draft)).toEqual([]);
  });

  it("removes an item and adds an empty one that must be filled in before approval", () => {
    let draft = apply(draftFromProfile(sara), { type: "remove", key: "experience-1" });
    expect(draft.experience.map((item) => item.value.company)).toEqual(["Northgate Retail Insights"]);

    draft = approve(apply(draft, { type: "add", section: "certifications", key: "new-1" }));
    expect(itemsWithProblems(draft)).toEqual(["new-1"]);
    expect(draft.certifications[0]).toMatchObject({ key: "new-1", errors: { name: "Add the certificate’s name." } });
  });

  it("saves a current job with no end date, and keeps jobs newest first", () => {
    let draft = apply(draftFromProfile(sara), { type: "add", section: "experience", key: "new-job" });
    draft = apply(draft, {
      type: "edit-experience",
      key: "new-job",
      change: { title: "Junior Data Analyst", company: "Pennine Health Analytics", startDate: "2025-11", current: true, duties: "• Write SQL\n\n- Build Power BI dashboards\n" },
    });

    const profile = profileFromDraft(approve(draft), sara);

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
    const draft = approve(
      apply(draftFromProfile(sara), { type: "edit-experience", key: "experience-0", change: { endDate: "", current: false } }),
    );
    expect(draft.experience[0].errors.endDate).toBe("Add the month and year you left, or tick “I still work here”.");
  });

  // #186: dates come from a Month and a Year menu, so a half-made choice is kept and the message says what is missing.
  it("keeps a date with only the month or only the year, and asks for the other part", () => {
    const draft = approve(
      apply(draftFromProfile(sara), { type: "edit-experience", key: "experience-0", change: { startDate: "2019-", endDate: "-06" } }),
    );

    expect(draft.experience[0].value).toMatchObject({ startDate: "2019-", endDate: "-06" });
    expect(draft.experience[0].errors).toMatchObject({ startDate: "Choose the month too.", endDate: "Choose the year too." });
    expect(Object.values(draft.experience[0].errors).join(" ")).not.toContain("YYYY-MM");
  });

  it("leaves an education's dates optional, but asks for the other part of a half-chosen one", () => {
    let draft = apply(draftFromProfile(sara), { type: "add", section: "education", key: "new-course" });
    const course = { qualification: "BSc", institution: "University of Leeds" };
    draft = approve(apply(draft, { type: "edit-education", key: "new-course", change: { ...course, startDate: "", endDate: "" } }));
    expect(draft.education.at(-1)?.errors).toEqual({});

    draft = approve(apply(draft, { type: "edit-education", key: "new-course", change: { startDate: "-09", endDate: "2030-" } }));
    expect(draft.education.at(-1)?.errors).toEqual({ startDate: "Choose the year too.", endDate: "Choose the month too." });

    draft = approve(apply(draft, { type: "edit-education", key: "new-course", change: { startDate: "2027-09", endDate: "2026-06" } }));
    expect(draft.education.at(-1)?.errors).toEqual({ endDate: "The end month is before the start month." });
  });

  it("accepts a LinkedIn link typed without https://, but never a script link", () => {
    let draft = approve(apply(draftFromProfile(sara), { type: "edit-contact", change: { linkedIn: "linkedin.com/in/sara-khan" } }));
    expect(itemsWithProblems(draft)).toEqual([]);
    expect(profileFromDraft(draft, sara).contact.linkedIn).toBe("https://linkedin.com/in/sara-khan");

    draft = approve(apply(draft, { type: "edit-contact", change: { linkedIn: "javascript:alert(1)" } }));
    expect(itemsWithProblems(draft)).toEqual(["contact"]);
    expect(draft.contact.errors.linkedIn).toBeDefined();
  });

  it("tidies the phone number from the CV and from the user, and won't approve one that can't be right", () => {
    const fromCv: Profile = { ...sara, contact: { ...sara.contact, phone: "07700900101" } };
    expect(draftFromProfile(fromCv).contact.value.phone).toBe("07700 900101");

    let draft = approve(apply(draftFromProfile(sara), { type: "edit-contact", change: { phone: "+44 (0)7700 900 101" } }));
    expect(itemsWithProblems(draft)).toEqual([]);
    expect(profileFromDraft(draft, sara).contact.phone).toBe("+44 7700 900101");

    draft = approve(apply(draft, { type: "edit-contact", change: { phone: "0770 090" } }));
    expect(itemsWithProblems(draft)).toEqual(["contact"]);
    expect(draft.contact.errors.phone).toBe("Check the phone number, for example 07700 900101.");
  });

  it("checks a certificate's year", () => {
    const draft = approve(
      apply(draftFromProfile(personas.reza.profile), { type: "edit-certification", key: "certification-0", change: { year: "26" } }),
    );
    expect(draft.certifications[0].errors).toEqual({ year: "Use a four-digit year, for example 2024." });
  });

  it("drops repeated and empty skills", () => {
    const draft = apply(draftFromProfile(sara), { type: "edit-skills", list: ["SQL", " sql ", "", "Power BI"] });
    expect(profileFromDraft(approve(draft), sara).skills).toEqual(["SQL", "Power BI"]);
  });

  it("keeps volunteering, projects and languages through the review exactly as the profile has them (#227)", () => {
    const draft = approve(draftFromProfile(saraWithMore));

    expect(itemsWithProblems(draft)).toEqual([]);
    expect(profileFromDraft(draft, saraWithMore)).toEqual(saraWithMore);
  });

  it("leaves out a section with nothing in it, so the profile looks like one saved before the section existed", () => {
    const saved = (draft: ReviewDraft) => JSON.parse(JSON.stringify(profileFromDraft(approve(draft), sara)));
    const removed = apply(draftFromProfile(saraWithMore), { type: "remove", key: "language-0" }, { type: "remove", key: "language-1" });

    for (const section of ["languages", "projects", "volunteering"]) expect(saved(draftFromProfile(sara))).not.toHaveProperty(section);
    expect(saved(removed)).not.toHaveProperty("languages");
    expect(saved(removed).projects).toEqual(saraWithMore.projects);
  });

  it("asks only for a role, a project's name and a language's name, and lists the items to fix in page order", () => {
    const draft = approve(
      apply(
        draftFromProfile(sara),
        { type: "add", section: "languages", key: "language" },
        { type: "add", section: "projects", key: "project" },
        { type: "add", section: "certifications", key: "certificate" },
        { type: "add", section: "volunteering", key: "role" },
      ),
    );

    expect(itemsWithProblems(draft)).toEqual(["role", "project", "certificate", "language"]);
    expect(draft.volunteering[0].errors).toEqual({ role: "Add your role, for example Volunteer tutor." });
    expect(draft.projects[0].errors).toEqual({ name: "Add the project’s name." });
    expect(draft.languages[0].errors).toEqual({ name: "Add the language, for example Polish." });
  });

  it("checks the dates of volunteering and projects as for a course, and saves a role the user still does with no end", () => {
    let draft = approve(
      apply(
        draftFromProfile(sara),
        { type: "add", section: "volunteering", key: "role" },
        { type: "edit-volunteering", key: "role", change: { role: "Volunteer maths tutor", startDate: "2023-01", endDate: "2023-" } },
        { type: "add", section: "projects", key: "project" },
        { type: "edit-project", key: "project", change: { name: "Late buses dashboard", startDate: "2025-05", endDate: "2025-01" } },
      ),
    );
    expect(draft.volunteering[0].errors).toEqual({ endDate: "Choose the month too." });
    expect(draft.projects[0].errors).toEqual({ endDate: "The end month is before the start month." });

    draft = approve(
      apply(
        draft,
        { type: "edit-volunteering", key: "role", change: { current: true, endDate: "2023-" } },
        { type: "edit-project", key: "project", change: { startDate: "", endDate: "" } },
      ),
    );
    expect(itemsWithProblems(draft)).toEqual([]);
    const profile = profileFromDraft(draft, sara);
    expect(profile.volunteering).toEqual([{ role: "Volunteer maths tutor", startDate: "2023-01", endDate: null, details: [] }]);
    expect(profile.projects).toEqual([{ name: "Late buses dashboard", details: [] }]);
  });

  // The project link may be shown as a link on the CV, so it is checked with the contract's own rule (z.httpUrl).
  it("accepts a project link typed without https://, but only a web link the profile can keep", () => {
    const withLink = (url: string) =>
      approve(apply(draftFromProfile(saraWithMore), { type: "edit-project", key: "project-0", change: { url } }));

    const bare = withLink("example.com/sara/late-buses");
    expect(itemsWithProblems(bare)).toEqual([]);
    expect(profileFromDraft(bare, saraWithMore).projects?.[0].url).toBe("https://example.com/sara/late-buses");

    for (const url of ["javascript:alert(1)", "data:text/html,hi", "http://localhost:3000", "http://192.168.0.10/app"]) {
      const draft = withLink(url);
      expect(draft.projects[0].errors.url, url).toBe("Check the link, for example https://github.com/your-name/your-project.");
      expect(approvalFor(draft, saraWithMore, false).ok, url).toBe(false);
    }
  });

  it("keeps the job search location in step with the contact location, unless the user set it apart", () => {
    const moved = apply(draftFromProfile(sara), { type: "edit-contact", change: { location: "Leeds" } });
    expect(profileFromDraft(approve(moved), sara).preferences.location).toBe("Leeds");

    const setApart: Profile = { ...sara, preferences: { ...sara.preferences, location: "Remote" } };
    const movedAgain = apply(draftFromProfile(setApart), { type: "edit-contact", change: { location: "Leeds" } });
    expect(profileFromDraft(approve(movedAgain), setApart).preferences.location).toBe("Remote");
  });
});

describe("normaliseLink", () => {
  it("adds https:// only when a link has no scheme", () => {
    expect(normaliseLink(" www.linkedin.com/in/emma ")).toBe("https://www.linkedin.com/in/emma");
    expect(normaliseLink("https://www.linkedin.com/in/emma")).toBe("https://www.linkedin.com/in/emma");
    expect(normaliseLink("")).toBeUndefined();
  });
});

describe("a draft from a CV just read (#33)", () => {
  const read = (change: Partial<CvExtraction> = {}): CvExtraction => ({ ...extractionFromProfile(sara), ...change });
  const firstJob = (job: Partial<CvExtraction["experience"][number]>) =>
    read({ experience: [{ ...extractionFromProfile(sara).experience[0], ...job }] });

  it.each(Object.keys(personas) as (keyof typeof personas)[])("gives %s's profile back once the page is approved", (name) => {
    const profile = personas[name].profile;
    const draft = approve(draftFromExtraction(extractionFromProfile(profile)));

    expect(itemsWithProblems(draft)).toEqual([]);
    expect(profileFromDraft(draft, profile)).toEqual(profile);
  });

  it("asks the user to fill what the CV doesn't give, instead of inventing it", () => {
    const draft = approve(draftFromExtraction({ ...firstJob({ company: "", startDate: "" }), fullName: "" }));

    expect(itemsWithProblems(draft)).toEqual(["contact", "experience-0"]);
    expect(draft.contact.errors.fullName).toBe("Add your full name.");
    expect(draft.experience[0].errors).toMatchObject({ company: "Add the employer’s name." });
    expect(draft.experience[0].errors.startDate).toBe("Add the month and year you started.");
  });

  it("turns a year alone into January or December, marked as a guess until the user edits it", () => {
    const draft = draftFromExtraction(firstJob({ startDate: "2019", endDate: "2021", current: false }));

    expect(draft.experience[0].value).toMatchObject({ startDate: "2019-01", endDate: "2021-12", startGuessed: true, endGuessed: true });

    const edited = apply(draft, { type: "edit-experience", key: "experience-0", change: { startDate: "2019-03" } });
    expect(edited.experience[0].value).toMatchObject({ startDate: "2019-03", startGuessed: false, endGuessed: true });
  });

  it("leaves no end date for a job the user still has", () => {
    const draft = draftFromExtraction(firstJob({ endDate: "2021", current: true }));

    expect(draft.experience[0].value).toMatchObject({ endDate: "", current: true, endGuessed: false });
  });

  it("gives volunteering, projects and languages back once the page is approved (#227)", () => {
    const draft = approve(draftFromExtraction(extractionFromProfile(saraWithMore)));

    expect(itemsWithProblems(draft)).toEqual([]);
    expect(profileFromDraft(draft, saraWithMore)).toEqual(saraWithMore);
  });

  it("guesses the month of a year alone for volunteering and projects too, marked as a guess", () => {
    const draft = draftFromExtraction(
      read({
        volunteering: [{ role: "Volunteer maths tutor", startDate: "2023", endDate: "", current: true, details: [] }],
        projects: [{ name: "Late buses dashboard", startDate: "2025", endDate: "2025", current: false, details: [] }],
      }),
    );

    expect(draft.volunteering[0].value).toMatchObject({ startDate: "2023-01", startGuessed: true, endDate: "", current: true });
    expect(draft.projects[0].value).toMatchObject({ startDate: "2025-01", endDate: "2025-12", startGuessed: true, endGuessed: true });
  });

  it("starts the job preferences from the CV's location, with a new id and the earlier answers", () => {
    const answers = sara.followUpAnswers;
    const base = newProfileBase(read(), { id: "new-id", followUpAnswers: answers });

    expect(base).toEqual({
      id: "new-id",
      followUpAnswers: answers,
      preferences: { salary: null, location: "Manchester", workModes: [], contractTypes: [], hours: [] },
      contact: { location: "Manchester" },
    });
  });
});

describe("a profile typed in by hand, with no CV", () => {
  const emma = personas.emma.profile;
  const job = emma.experience[0];

  it("starts with every section empty, and asks only for the name before it can be approved", () => {
    const draft = approve(emptyDraft());

    expect(draft).toMatchObject({ summary: { value: { text: "" } }, skills: { value: { list: [] } } });
    const lists = [draft.experience, draft.volunteering, draft.education, draft.projects, draft.certifications, draft.languages];
    expect(lists).toEqual([[], [], [], [], [], []]);
    expect(itemsWithProblems(draft)).toEqual(["contact"]);
    expect(draft.contact.errors).toEqual({ fullName: "Add your full name." });
  });

  it("saves exactly what the user typed, with job preferences that follow the location they gave", () => {
    const draft = approve(
      apply(
        emptyDraft(),
        { type: "edit-contact", change: { fullName: emma.fullName, location: emma.contact.location } },
        { type: "add", section: "experience", key: "new-experience-1" },
        {
          type: "edit-experience",
          key: "new-experience-1",
          change: { title: job.title, company: job.company, startDate: job.startDate, current: true, duties: job.duties.join("\n") },
        },
        { type: "edit-skills", list: ["React", "TypeScript"] },
      ),
    );
    const base = newProfileBase({ contact: {} }, { id: "new-id", followUpAnswers: [] });

    expect(itemsWithProblems(draft)).toEqual([]);
    expect(profileFromDraft(draft, base)).toEqual({
      id: "new-id",
      fullName: emma.fullName,
      contact: { location: emma.contact.location },
      summary: "",
      skills: ["React", "TypeScript"],
      experience: [{ title: job.title, company: job.company, startDate: job.startDate, endDate: null, duties: job.duties, achievements: [] }],
      education: [],
      certifications: [],
      preferences: { salary: null, location: emma.contact.location, workModes: [], contractTypes: [], hours: [] },
      followUpAnswers: [],
    });
  });

  it("starts the job preferences empty, since there is no CV to read a location from", () => {
    expect(newProfileBase({ contact: {} }, { id: "new-id", followUpAnswers: [] })).toEqual({
      id: "new-id",
      followUpAnswers: [],
      preferences: { salary: null, location: "", workModes: [], contractTypes: [], hours: [] },
      contact: { location: undefined },
    });
  });
});

describe("approvalFor", () => {
  const base = newProfileBase({ contact: {} }, { id: "new-id", followUpAnswers: [] });
  const named = approve(apply(emptyDraft(), { type: "edit-contact", change: { fullName: sara.fullName } }));

  it("saves nothing typed in by hand until the box is ticked, and sends focus to the box", () => {
    expect(approvalFor(named, base, true)).toEqual({ ok: false, message: null, focus: "consent" });
  });

  it("asks for both when an item needs fixing and the box isn't ticked, with focus on the item", () => {
    expect(approvalFor(approve(emptyDraft()), base, true)).toEqual({
      ok: false,
      message: "Fix the 1 item marked above and tick the box to agree, then approve again.",
      focus: { item: "contact" },
    });
    expect(approvalFor(approve(emptyDraft()), base, false)).toEqual({
      ok: false,
      message: "Fix the 1 item marked above, then approve again.",
      focus: { item: "contact" },
    });
  });

  it("saves the profile once every item passes and nothing else is missing", () => {
    expect(approvalFor(named, base, false)).toEqual({ ok: true, profile: profileFromDraft(named, base) });
  });

  it("refuses a profile too long to save on the page, before the server would", () => {
    const long = approve(apply(named, { type: "edit-summary", text: "x".repeat(MAX_PROFILE_CHARACTERS) }));

    expect(approvalFor(long, base, false)).toEqual({ ok: false, message: profileTooLongMessage, focus: null });
  });
});

describe("readCvMonth", () => {
  it.each([
    ["2021-09", "start", { month: "2021-09", guessed: false }],
    ["2021/9", "start", { month: "2021-09", guessed: false }],
    ["09/2021", "end", { month: "2021-09", guessed: false }],
    ["Sept 2021", "start", { month: "2021-09", guessed: false }],
    ["September, 2021", "end", { month: "2021-09", guessed: false }],
    ["2021", "start", { month: "2021-01", guessed: true }],
    ["2021", "end", { month: "2021-12", guessed: true }],
    ["", "start", { month: "", guessed: false }],
    ["Summer 2021", "start", { month: "", guessed: false }],
    ["2021-13", "start", { month: "", guessed: false }],
  ] as const)("reads %j as a %s date", (text, side, expected) => {
    expect(readCvMonth(text, side)).toEqual(expected);
  });
});
