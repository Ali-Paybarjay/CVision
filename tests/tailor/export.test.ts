import JSZip from "jszip";
import { extractText, getDocumentProxy } from "unpdf";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportDocument } from "@/features/tailor/actions";
import { blocksToFile, cvBlocks, exportFileName, letterBlocks, pdfLosesLetters, pdfSafe, type ExportFormat } from "@/features/tailor/export";
import { buildTailoredCv } from "@/features/tailor/tailored-cv";
import type { TailoringChange, TailoringStatus } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@/shared/analytics/track", () => ({ track }));
vi.mock("@/features/account/current-user", () => ({ getCurrentUser: async () => ({ id: "user-1", email: null }) }));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient: async () => null }));
vi.mock("@/shared/ai/anonymous-key", () => ({ getAnonymousKey: async () => ({ anonymousKey: "visitor" }) }));
vi.mock("@/features/tracker/actions", () => ({ recordApplication: vi.fn() }));
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => task() }));

beforeEach(() => vi.clearAllMocks());

const { profile, jobs } = personas.sara;
const job = jobs[0];

function change(status: TailoringStatus, after: string, overrides: Partial<TailoringChange> = {}): TailoringChange {
  return {
    id: `change-${status}`,
    jobId: job.id,
    gapId: "sara-gap-1",
    section: "skills",
    before: null,
    after,
    evidence: "I use it every week",
    evidenceSource: "follow-up-answer",
    status,
    ...overrides,
  };
}

const changes = [
  change("approved", "Approved line about Power BI reports"),
  change("rejected", "Rejected line about Kubernetes"),
  change("proposed", "Undecided line about Terraform"),
];

/** All the text a reader (or an applicant tracking system) gets out of the file. */
async function fileText(bytes: Uint8Array, format: ExportFormat): Promise<string> {
  if (format === "pdf") {
    const { text } = await extractText(await getDocumentProxy(bytes), { mergePages: true });
    return text.replace(/\s+/g, " ");
  }
  const xml = await (await JSZip.loadAsync(bytes)).file("word/document.xml")!.async("string");
  return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

describe("the file name", () => {
  it("is the user's name, the document and the job title", () => {
    expect(exportFileName("Sara Ahmadi", "Junior Data Analyst", "cv", "pdf")).toBe("Sara-Ahmadi-CV-Junior-Data-Analyst.pdf");
    expect(exportFileName("Zoë O’Brien", "Sales & Marketing / Lead", "cover-letter", "docx")).toBe(
      "Zoe-O-Brien-Cover-letter-Sales-Marketing-Lead.docx",
    );
  });
});

describe.each<ExportFormat>(["pdf", "docx"])("the %s file (You approve everything)", (format) => {
  it("has the approved change, and no rejected or undecided one", async () => {
    const cv = buildTailoredCv(profile, changes);
    const text = await fileText(await blocksToFile(cvBlocks(cv), format, { title: "CV", author: profile.fullName }), format);

    expect(text).toContain(profile.fullName);
    expect(text).toContain("Approved line about Power BI reports");
    expect(text).not.toContain("Kubernetes");
    expect(text).not.toContain("Terraform");
    // The Fit highlight and its screen-reader note belong to the preview only.
    expect(text).not.toContain("tailored for this job");
  });

  it("keeps every heading of the preview as real text, in order", async () => {
    const cv = buildTailoredCv(profile, []);
    const text = await fileText(await blocksToFile(cvBlocks(cv), format, { title: "CV", author: profile.fullName }), format);
    const headings = ["PROFESSIONAL SUMMARY", "EDUCATION", "PROFESSIONAL SKILLS DEMONSTRATED", "CERTIFICATES AND SKILLS"].map((heading) => text.indexOf(heading));
    expect(headings.every((index) => index >= 0)).toBe(true);
    expect([...headings].sort((a, b) => a - b)).toEqual(headings);
  });

  it("writes the cover letter paragraph by paragraph", async () => {
    const letter = "Dear Hiring Manager,\n\nI am applying for the role.\n\nYours faithfully,\nSara Ahmadi";
    const text = await fileText(await blocksToFile(letterBlocks(letter), format, { title: "Letter", author: "Sara" }), format);
    for (const line of ["Dear Hiring Manager,", "I am applying for the role.", "Yours faithfully,", "Sara Ahmadi"]) {
      expect(text).toContain(line);
    }
  });
});

describe.each<ExportFormat>(["pdf", "docx"])("the %s file follows the templates", (format) => {
  const head = { fullName: "Sara Ahmadi", contact: ["Manchester", "07700 900000 | sara@example.com"], date: "30 October 2026" };

  it("puts the letterhead and the date above the letter, and the name once at the end", async () => {
    const letter = "Dear Hiring Manager,\n\nI am applying for the role.\n\nYours sincerely,\n\nSara Ahmadi";
    const text = await fileText(await blocksToFile(letterBlocks(letter, head), format, { title: "Letter", author: "Sara" }), format);
    for (const line of ["Manchester", "07700 900000 | sara@example.com", "30 October 2026", "Yours sincerely,"]) expect(text).toContain(line);
    expect(text.indexOf("30 October 2026")).toBeLessThan(text.indexOf("Dear Hiring Manager,"));
    expect(text.split("Sara Ahmadi")).toHaveLength(3);
  });

  it("lists every main skill and prints a line with the skill it shows", async () => {
    const line = "Built Tableau dashboards for the regional sales team";
    const skill = { id: "s", jobId: "j", section: "skills" as const, before: null, evidence: line, evidenceSource: "cv" as const, status: "approved" as const };
    const cv = buildTailoredCv(profile, ["Communication", "Leadership", "Teamwork"].map((after) => ({ ...skill, id: after, after })));
    const text = await fileText(await blocksToFile(cvBlocks(cv), format, { title: "CV", author: profile.fullName }), format);
    for (const name of ["Communication", "Leadership", "Teamwork"]) expect(text).toContain(name);
    expect(text).toContain(`Communication: ${line}`);
    expect(text).toContain("Skills and tools:");
  });
});

describe("pdfSafe", () => {
  it("keeps UK text and drops only what the standard font cannot draw", () => {
    expect(pdfSafe("£40,000 – “café” • naïve")).toBe("£40,000 – “café” • naïve");
    expect(pdfSafe("Łukasz Świątek")).toBe("Lukasz Swiatek");
    expect(pdfSafe("日本")).toBe("??");
  });

  it("splits ligatures and subscripts from PDF text instead of dropping them", () => {
    expect(pdfSafe("Certiﬁed")).toBe("Certified");
    expect(pdfSafe("CO₂")).toBe("CO2");
  });

  it("knows when the PDF would show letters as ?", () => {
    const meta = { title: "CV", author: "Sara Khan" };
    expect(pdfLosesLetters(letterBlocks("Fluent in Persian (فارسی)"), meta)).toBe(true);
    expect(pdfLosesLetters(letterBlocks("I spoke to the team."), { ...meta, author: "Иван Петров" })).toBe(true);
    expect(pdfLosesLetters(letterBlocks("A Certiﬁed café in Łódź, “naïve” CO₂"), meta)).toBe(false);
  });
});

describe("exportDocument", () => {
  it("warns when the PDF cannot show some letters, and not for the Word file", async () => {
    const letter = "Dear Hiring Manager,\n\nI speak English and Persian (فارسی).";
    const pdf = await exportDocument({ jobId: job.id, document: "cover-letter", format: "pdf", changes: [], letter });
    const word = await exportDocument({ jobId: job.id, document: "cover-letter", format: "docx", changes: [], letter });
    expect(pdf).toMatchObject({ ok: true, warning: expect.stringContaining("Download the Word file instead") });
    expect(word).toMatchObject({ ok: true, warning: null });
  });

  it("rebuilds the CV from approved changes only and records the format", async () => {
    const result = await exportDocument({ jobId: job.id, document: "cv", format: "pdf", changes, letter: null });
    if (!result.ok) throw new Error(result.message);

    expect(result.fileName).toBe(exportFileName(profile.fullName, job.title, "cv", "pdf"));
    expect(result.mimeType).toBe("application/pdf");
    const text = await fileText(new Uint8Array(Buffer.from(result.base64, "base64")), "pdf");
    expect(text).toContain("Approved line about Power BI reports");
    expect(text).not.toContain("Kubernetes");
    expect(track).toHaveBeenCalledWith("tailor.cv_exported", { format: "pdf", document: "cv", approvedChanges: 1 }, { userId: "user-1" });
  });

  it("ignores changes sent for another job", async () => {
    const other = change("approved", "A line from another job", { jobId: "sara-job-2" });
    const result = await exportDocument({ jobId: job.id, document: "cv", format: "docx", changes: [other], letter: null });
    if (!result.ok) throw new Error(result.message);
    expect(await fileText(new Uint8Array(Buffer.from(result.base64, "base64")), "docx")).not.toContain("A line from another job");
  });

  it("refuses a cover letter that is not approved", async () => {
    const result = await exportDocument({ jobId: job.id, document: "cover-letter", format: "docx", changes: [], letter: null });
    expect(result.ok).toBe(false);
    expect(track).not.toHaveBeenCalled();
  });
});
