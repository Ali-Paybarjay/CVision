import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getAiProvider } from "@/shared/ai";
import { personas } from "@/shared/sample-data";
import { extractProfile } from "./extract-profile";
import { readCvText } from "./read-cv";
import { emmaWithMoreSections, moreSectionsCvFileName, sampleCvFileName, samplePersonaNames } from "./sample-cvs";

// Prompt evals for prompts/profile-extract.md: real requests to the model, so they cost money.
// Run with `npm run eval` (needs ANTHROPIC_API_KEY or OPENROUTER_API_KEY).
// Each sample CV in sample-data/cvs is built from a persona, so the persona is the right answer.

const normalise = (text: string) => text.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").replace(/[.;]$/, "").trim();

describe.skipIf(!getAiProvider())("profile-extract on the sample CVs", () => {
  describe.each(samplePersonaNames)("%s", (name) => {
    const expected = personas[name].profile;
    // One model call per CV, made by the first test that needs it (never while tests are being collected).
    let reading: Promise<{ cvText: string; profile: Awaited<ReturnType<typeof extractProfile>> }> | undefined;
    const result = () =>
      (reading ??= (async () => {
        const bytes = new Uint8Array(readFileSync(join(process.cwd(), "sample-data", "cvs", sampleCvFileName(name))));
        const cv = await readCvText({ name: sampleCvFileName(name), bytes });
        return { cvText: cv.text, profile: await extractProfile(cv.text) };
      })());

    it("reads the name and contact details", async () => {
      const { profile } = await result();
      expect(profile.fullName).toBe(expected.fullName);
      expect(profile.contact.email).toBe(expected.contact.email);
      expect(profile.contact.phone).toBe(expected.contact.phone);
      expect(profile.contact.location).toBe(expected.contact.location);
    });

    it("reads every job, with its dates, newest first", async () => {
      const { profile } = await result();
      const read = profile.experience.map((job) => [normalise(job.title), normalise(job.company), job.startDate, job.current ? null : job.endDate]);
      const right = expected.experience.map((job) => [normalise(job.title), normalise(job.company), job.startDate, job.endDate]);
      expect(read).toEqual(right);
    });

    it("keeps every duty and achievement in the user's own words", async () => {
      const { profile } = await result();
      const extracted = profile.experience.flatMap((job) => [...job.duties, ...job.achievements]).map(normalise);
      for (const line of expected.experience.flatMap((job) => [...job.duties, ...job.achievements])) {
        expect(extracted).toContain(normalise(line));
      }
    });

    it("reads the skills, education and certificates", async () => {
      const { profile } = await result();
      expect(profile.skills.map(normalise)).toEqual(expect.arrayContaining(expected.skills.map(normalise)));
      expect(profile.education.map((course) => normalise(course.institution))).toEqual(
        expected.education.map((course) => normalise(course.institution)),
      );
      expect(profile.certifications.map((certificate) => normalise(certificate.name))).toEqual(
        expected.certifications.map((certificate) => normalise(certificate.name)),
      );
    });

    it("invents nothing: every skill, job and qualification is in the CV", async () => {
      const { cvText, profile } = await result();
      const cv = normalise(cvText);
      const claims = [
        ...profile.skills,
        ...profile.experience.flatMap((job) => [job.title, job.company]),
        ...profile.education.flatMap((course) => [course.institution, course.qualification]),
        ...profile.certifications.map((certificate) => certificate.name),
      ];
      for (const claim of claims) {
        expect(cv, `"${claim}" is not in the CV`).toContain(normalise(claim));
      }
    });

    it("copies the summary word for word", async () => {
      const { profile } = await result();
      expect(normalise(profile.summary)).toBe(normalise(expected.summary));
    });

    it("adds no volunteering, project or language the CV doesn't have, not even English", async () => {
      const { profile } = await result();
      expect([profile.volunteering, profile.projects, profile.languages]).toEqual([[], [], []]);
    });
  });
});

// The personas have no volunteering, projects or languages, so this CV is Emma's with all three added (#227).
describe.skipIf(!getAiProvider())("profile-extract on a CV with volunteering, projects and languages", () => {
  const expected = emmaWithMoreSections;
  /** An end date as the model gives it: null while still going, "" when the CV gives none. */
  const end = (item: { current: boolean; endDate: string }) => (item.current ? null : item.endDate);
  let reading: Promise<{ cvText: string; profile: Awaited<ReturnType<typeof extractProfile>> }> | undefined;
  const result = () =>
    (reading ??= (async () => {
      const bytes = new Uint8Array(readFileSync(join(process.cwd(), "sample-data", "cvs", moreSectionsCvFileName)));
      const cv = await readCvText({ name: moreSectionsCvFileName, bytes });
      return { cvText: cv.text, profile: await extractProfile(cv.text) };
    })());

  it("reads every language, with a level only where the CV gives one", async () => {
    const { profile } = await result();
    const read = profile.languages.map((language) => [normalise(language.name), language.level && normalise(language.level)]);
    expect(read).toEqual((expected.languages ?? []).map((language) => [normalise(language.name), language.level && normalise(language.level)]));
  });

  it("reads every project with its dates, details and link, adding https:// back", async () => {
    const { profile } = await result();
    const read = profile.projects.map((project) => [
      normalise(project.name),
      normalise(project.organisation ?? ""),
      project.startDate,
      end(project),
      project.details.map(normalise),
      project.url,
    ]);
    const right = (expected.projects ?? []).map((project) => [
      normalise(project.name),
      normalise(project.organisation ?? ""),
      project.startDate ?? "",
      project.endDate === null ? null : (project.endDate ?? ""),
      project.details.map(normalise),
      project.url,
    ]);
    expect(read).toEqual(right);
  });

  it("puts volunteering in its own section, and leaves the jobs as they are", async () => {
    const { profile } = await result();
    expect(profile.experience.map((job) => normalise(job.company))).toEqual(expected.experience.map((job) => normalise(job.company)));
    const read = profile.volunteering.map((role) => [
      normalise(role.role),
      normalise(role.organisation ?? ""),
      role.startDate,
      end(role),
      role.details.map(normalise),
    ]);
    const right = (expected.volunteering ?? []).map((role) => [
      normalise(role.role),
      normalise(role.organisation ?? ""),
      role.startDate ?? "",
      role.endDate === null ? null : (role.endDate ?? ""),
      role.details.map(normalise),
    ]);
    expect(read).toEqual(right);
  });

  it("invents nothing: every language, level, project and role is in the CV", async () => {
    const { cvText, profile } = await result();
    const cv = normalise(cvText);
    const claims = [
      ...profile.languages.flatMap((language) => [language.name, language.level ?? ""]),
      ...profile.projects.flatMap((project) => [project.name, project.organisation ?? ""]),
      ...profile.volunteering.flatMap((role) => [role.role, role.organisation ?? ""]),
    ].filter(Boolean);
    for (const claim of claims) {
      expect(cv, `"${claim}" is not in the CV`).toContain(normalise(claim));
    }
  });
});
