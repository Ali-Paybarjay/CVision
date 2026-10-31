import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { personas } from "@/shared/sample-data";
import { extractDocxText } from "./docx";
import { buildSampleCv, emmaWithMoreSections, sampleCvFileName, samplePersonaNames } from "./sample-cvs";

// Checks that the Word CVs in sample-data/cvs match the personas.
// After changing a persona, rebuild them with:
//   WRITE_SAMPLE_CVS=1 npx vitest run src/features/profile/server/sample-cvs.test.ts

const folder = join(process.cwd(), "sample-data", "cvs");

if (process.env.WRITE_SAMPLE_CVS === "1") {
  mkdirSync(folder, { recursive: true });
  for (const name of samplePersonaNames) {
    writeFileSync(join(folder, sampleCvFileName(name)), buildSampleCv(name));
  }
}

describe.each(samplePersonaNames)("sample-data/cvs/%s.docx", (name) => {
  const text = extractDocxText(readFileSync(join(folder, sampleCvFileName(name))));
  const profile = personas[name].profile;

  it("is up to date with its persona", () => {
    expect(text).toBe(extractDocxText(buildSampleCv(name)));
  });

  it("holds the persona's name, jobs, education, skills and certificates", () => {
    expect(text).toContain(profile.fullName);
    for (const job of profile.experience) {
      expect(text).toContain(job.title);
      expect(text).toContain(job.company);
      for (const line of [...job.duties, ...job.achievements]) expect(text).toContain(line);
    }
    for (const course of profile.education) expect(text).toContain(course.institution);
    for (const skill of profile.skills) expect(text).toContain(skill);
    for (const certificate of profile.certifications) expect(text).toContain(certificate.name);
  });

  it("is fictional: example.com email and a 07700 900 drama number", () => {
    expect(text).toMatch(/@example\.com/);
    expect(text).toMatch(/07700 900\d{3}/);
  });
});

describe("a CV built from a profile with volunteering, projects and languages (#227)", () => {
  const text = extractDocxText(buildSampleCv("emma", emmaWithMoreSections));

  it("holds each of them, with a level only where the profile has one and the link without https://", () => {
    for (const heading of ["VOLUNTEERING", "PROJECTS", "LANGUAGES"]) expect(text).toContain(heading);
    for (const role of emmaWithMoreSections.volunteering ?? []) {
      expect(text).toContain(role.role);
      for (const line of role.details) expect(text).toContain(line);
    }
    for (const project of emmaWithMoreSections.projects ?? []) {
      expect(text).toContain(project.name);
      for (const line of project.details) expect(text).toContain(line);
    }
    expect(text).toContain("example.com/emma-walsh/recipe-finder");
    expect(text).not.toContain("https://example.com");
    expect(text).toContain("English (Native), Spanish (B2), British Sign Language");
  });
});
