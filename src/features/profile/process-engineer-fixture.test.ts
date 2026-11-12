import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JobSchema, ProfileSchema } from "@/shared/contracts";
import processJob from "../../../sample-data/process-engineer/job.json";
import processProfile from "../../../sample-data/process-engineer/profile.json";
import { assessByRules, buildMatchResult, profileEvidenceLines } from "./match";
import { extractDocxText } from "./server/docx";
import { buildSampleCv } from "./server/sample-cvs";

// The fictional pair behind card #188's evals (check-job.eval.ts). To try it by hand, upload owen-pritchard.docx on
// /profile and paste ad.txt on /jobs. After changing profile.json, rebuild the CV with:
//   WRITE_SAMPLE_CVS=1 npx vitest run src/features/profile/process-engineer-fixture.test.ts

const folder = join(process.cwd(), "sample-data", "process-engineer");
const job = JobSchema.parse(processJob);
const profile = ProfileSchema.parse(processProfile);

if (process.env.WRITE_SAMPLE_CVS === "1") writeFileSync(join(folder, "owen-pritchard.docx"), buildSampleCv("daniel", profile));

describe("sample-data/process-engineer (#188)", () => {
  it("parses unchanged, and the job's ad is ad.txt", () => {
    expect(job).toEqual(processJob);
    expect(profile).toEqual(processProfile);
    expect(`${job.description}\n`).toBe(readFileSync(join(folder, "ad.txt"), "utf8"));
  });

  it("has a Word CV that is up to date with profile.json", () => {
    expect(extractDocxText(readFileSync(join(folder, "owen-pritchard.docx")))).toBe(extractDocxText(buildSampleCv("daniel", profile)));
  });

  it("is fictional: example.com email, a 07700 900 drama number and an ad that says so", () => {
    expect(profile.contact.email).toMatch(/@example\.com$/);
    expect(profile.contact.phone).toMatch(/^07700 900\d{3}$/);
    expect(job.description).toMatch(/fictional job advert/i);
  });

  it("holds the profile lines the acceptance list leans on", () => {
    const lines = profileEvidenceLines(profile).map((line) => line.text);
    for (const line of [
      "Drew the PFDs and P&IDs for a 40 MMSCFD gas dehydration unit",
      "Took part in the dehydration unit's HAZOP study as a process team member",
      "Led and mentored small teams of graduate engineers",
      "Delivering process design packages in accordance with established standards for safety, cost, quality and timelines",
      "Supported feasibility studies for two subsea tie-backs, including equipment lists for the cost estimates",
    ]) {
      expect(lines).toContain(line);
    }
  });

  it("in mock mode, lists none of the requirements the profile lacks as met", () => {
    const { match } = buildMatchResult(job, profile, assessByRules(profile, job));
    const met = match.strengths.map((item) => item.requirement).join("\n");
    for (const lacking of [/BioWin/, /chairing/i, /Chartered/, /fee proposals/i, /plant layouts/i, /GA drawings/, /DSEAR|COMAH/]) {
      expect(met).not.toMatch(lacking);
    }
  });
});
