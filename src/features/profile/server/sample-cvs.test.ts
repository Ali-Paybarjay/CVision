import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { personas } from "@/shared/sample-data";
import { extractDocxText } from "./docx";
import { buildSampleCv, sampleCvFileName, samplePersonaNames } from "./sample-cvs";

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
