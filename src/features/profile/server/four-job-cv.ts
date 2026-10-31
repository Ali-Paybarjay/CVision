import "server-only";
import { AlignmentType, Document, Footer, Header, Packer, PageNumber, Paragraph, TabStopType, TextRun } from "docx";
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import type { Profile } from "@/shared/contracts";
import { personas } from "@/shared/sample-data";

// Card #236: a pilot user's CV had four jobs, and "What you did" came back empty for the third and fourth.
// No persona has more than three jobs, so this fictional CV gives Daniel an older fourth job and puts jobs 3
// and 4 on page 2, as a PDF and as a Word file, for the reading tests and the profile-extract evals.
// To rebuild the files after changing it:
//   WRITE_SAMPLE_CVS=1 npx vitest run src/features/profile/server/four-job-cv.test.ts

export const fourJobCvFileNames = { pdf: "daniel-four-jobs.pdf", docx: "daniel-four-jobs.docx" } as const;

const daniel = personas.daniel.profile;

/** Daniel's persona, with more lines under his third job and an older fourth job. The right answer for the evals. */
export const fourJobProfile: Profile = {
  ...daniel,
  id: "daniel-four-jobs-profile",
  experience: [
    ...daniel.experience.slice(0, 2),
    {
      ...daniel.experience[2],
      duties: [
        ...daniel.experience[2].duties,
        "Planned the department's weekly rotas and holiday cover",
        "Ran the daily freshness and date-code checks",
      ],
    },
    {
      title: "Sales Assistant",
      company: "Valewood Supermarkets",
      location: "Dudley",
      startDate: "2006-09",
      endDate: "2009-04",
      duties: [
        "Served customers on the tills and at the customer service desk",
        "Handled refunds, exchanges and complaints",
        "Filled and faced the chilled aisles on the early shift",
      ],
      achievements: [],
    },
  ],
};

/** Jobs 1 and 2 go on page 1, jobs 3 and 4 on page 2. */
const JOBS_ON_FIRST_PAGE = 2;

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const month = (yearMonth: string) => `${months[Number(yearMonth.slice(5, 7)) - 1]} ${yearMonth.slice(0, 4)}`;
const dates = (job: Profile["experience"][number]) => `${month(job.startDate)} – ${job.endDate ? month(job.endDate) : "Present"}`;
const jobLine = (job: Profile["experience"][number]) => [job.title, job.company, job.location].filter(Boolean).join(", ");
const contactLine = [daniel.contact.location, daniel.contact.phone, daniel.contact.email].join("  |  ");
const certificateLine = (certificate: Profile["certifications"][number]) =>
  [certificate.name, certificate.issuer, certificate.year].filter(Boolean).join(", ");

// --- PDF: drawn line by line, top to bottom, as Word's "Save as PDF" does ---------------------------------------

const A4 = { width: 595.28, height: 841.89, margin: 56.7 };

export async function buildFourJobCvPdf(): Promise<Uint8Array> {
  const profile = fourJobProfile;
  // No creation date in the file, so building it twice gives the same text and the same bytes.
  const pdf = await PDFDocument.create({ updateMetadata: false });
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const width = A4.width - A4.margin * 2;

  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;
  const newPage = () => {
    page = pdf.addPage([A4.width, A4.height]);
    pages.push(page);
    y = A4.height - A4.margin;
    if (pages.length > 1) {
      page.drawText(`${profile.fullName} – CV`, { x: A4.margin, y: A4.height - 34, size: 8, font: regular });
    }
  };
  const write = (text: string, options: { font?: PDFFont; size?: number; indent?: number; before?: number } = {}) => {
    const { font = regular, size = 10, indent = 0, before = 0 } = options;
    y -= before;
    for (const line of wrap(text, font, size, width - indent)) {
      y -= size * 1.35;
      page.drawText(line, { x: A4.margin + indent, y, size, font });
    }
  };
  const heading = (text: string) => write(text.toUpperCase(), { font: bold, size: 11, before: 12 });
  const bullet = (text: string) => write(`•  ${text}`, { indent: 10, before: 2 });

  newPage();
  write(profile.fullName, { font: bold, size: 18 });
  write(contactLine, { size: 9.5, before: 4 });
  heading("Personal profile");
  write(profile.summary, { before: 2 });
  heading("Key skills");
  write(profile.skills.join("  •  "), { before: 2 });
  heading("Work experience");
  profile.experience.forEach((job, index) => {
    if (index === JOBS_ON_FIRST_PAGE) newPage();
    // The dates sit on the job's line, pushed to the right edge.
    write(jobLine(job), { font: bold, before: 8 });
    const when = dates(job);
    page.drawText(when, { x: A4.width - A4.margin - regular.widthOfTextAtSize(when, 10), y, size: 10, font: regular });
    job.duties.forEach(bullet);
    if (job.achievements.length > 0) {
      write("Key achievements", { font: italic, before: 4 });
      job.achievements.forEach(bullet);
    }
  });
  heading("Education");
  for (const course of profile.education) {
    write(`${course.qualification}, ${course.institution}`, { font: bold, before: 2 });
    if (course.endDate) write(`Completed ${month(course.endDate)}`, { font: italic });
  }
  heading("Certifications");
  profile.certifications.map(certificateLine).forEach(bullet);
  write("References available on request.", { font: italic, before: 12 });

  pages.forEach((each, index) => {
    const footer = `Page ${index + 1} of ${pages.length}`;
    each.drawText(footer, { x: (A4.width - regular.widthOfTextAtSize(footer, 8)) / 2, y: 28, size: 8, font: regular });
  });
  return pdf.save();
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  return [...lines, line];
}

// --- Word: real bullets, a page break before job 3, the name in the page header ----------------------------------

const TEXT_WIDTH = 9638;

export async function buildFourJobCvDocx(): Promise<Uint8Array> {
  const profile = fourJobProfile;
  const heading = (text: string) =>
    new Paragraph({ keepNext: true, spacing: { before: 280, after: 100 }, children: [new TextRun({ text: text.toUpperCase(), bold: true })] });
  const bullet = (text: string) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: [new TextRun(text)] });

  const body: Paragraph[] = [
    heading("Personal profile"),
    new Paragraph({ children: [new TextRun(profile.summary)] }),
    heading("Key skills"),
    ...profile.skills.map(bullet),
    heading("Work experience"),
  ];
  profile.experience.forEach((job, index) => {
    body.push(
      new Paragraph({
        pageBreakBefore: index === JOBS_ON_FIRST_PAGE,
        keepNext: true,
        spacing: { before: 160 },
        tabStops: [{ type: TabStopType.RIGHT, position: TEXT_WIDTH }],
        children: [new TextRun({ text: jobLine(job), bold: true }), new TextRun({ text: `\t${dates(job)}` })],
      }),
      ...job.duties.map(bullet),
    );
    if (job.achievements.length > 0) {
      body.push(new Paragraph({ children: [new TextRun({ text: "Key achievements", italics: true })] }), ...job.achievements.map(bullet));
    }
  });
  body.push(heading("Education"));
  for (const course of profile.education) {
    body.push(new Paragraph({ children: [new TextRun({ text: `${course.qualification}, ${course.institution}`, bold: true })] }));
    if (course.endDate) body.push(new Paragraph({ children: [new TextRun({ text: `Completed ${month(course.endDate)}`, italics: true })] }));
  }
  body.push(heading("Certifications"), ...profile.certifications.map(certificateLine).map(bullet));
  body.push(new Paragraph({ spacing: { before: 240 }, children: [new TextRun({ text: "References available on request.", italics: true })] }));

  const document = new Document({
    creator: "CVision sample data (fictional)",
    title: "CV",
    styles: { default: { document: { run: { font: "Arial", size: 21 } } } },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
        headers: {
          default: new Header({
            children: [
              new Paragraph({ children: [new TextRun({ text: profile.fullName, bold: true, size: 40 })] }),
              new Paragraph({ children: [new TextRun({ text: contactLine, size: 20 })] }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], size: 16 })],
              }),
            ],
          }),
        },
        children: body,
      },
    ],
  });
  return new Uint8Array(await Packer.toArrayBuffer(document));
}
