import "server-only";
import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";
import { fourJobProfile } from "./four-job-cv";

// Probe for card #236 (branch profile/236-probe, never merged). A pilot user's four-job CV came back with
// «What you did» empty for jobs 3 and 4, but the tidy four-job CV in four-job-cv.ts reads correctly. Each fictional
// variant of Daniel's CV below tries one way a real CV could cause it, so the evals can show which ones do.

export type VariantJob = {
  title: string;
  company: string;
  location: string;
  dates: string;
  /** The lines under the job, as the CV prints them. */
  lines: string[];
  /** Lines under the job's own "Key achievements" subheading. */
  achievements: string[];
};

export type Variant = {
  name: string;
  /** What the variant tries, in a few words. */
  tries: string;
  summary: string;
  skills: string[];
  jobs: VariantJob[];
  sections: Array<{ heading: string; lines: string[] }>;
  /** The job that starts page 2; without it the text just flows from page to page. */
  newPageBeforeJob?: number;
  /** Jobs (from 0) whose lines are drawn last on their page, as a design tool does with text boxes added later. */
  linesDrawnLast?: number[];
  /** A design tool adds no running header or page numbers. */
  plain?: boolean;
  fontSize?: number;
};

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const month = (yearMonth: string) => `${months[Number(yearMonth.slice(5, 7)) - 1]} ${yearMonth.slice(0, 4)}`;

const tidyJobs: VariantJob[] = fourJobProfile.experience.map((job) => ({
  title: job.title,
  company: job.company,
  location: job.location ?? "",
  dates: `${month(job.startDate)} – ${job.endDate ? month(job.endDate) : "Present"}`,
  lines: job.duties,
  achievements: job.achievements,
}));

const tidySections = [
  {
    heading: "Education",
    lines: fourJobProfile.education.map((course) => `${course.qualification}, ${course.institution}, ${month(course.endDate ?? "")}`),
  },
  {
    heading: "Certifications",
    lines: fourJobProfile.certifications.map((certificate) => `${certificate.name}, ${certificate.issuer}, ${certificate.year}`),
  },
];

const tidy = {
  summary: fourJobProfile.summary,
  skills: fourJobProfile.skills,
  sections: tidySections,
  newPageBeforeJob: 2,
};

export const variants: Variant[] = [
  {
    ...tidy,
    name: "no-lines",
    tries: "jobs 3 and 4 have a title, employer and dates but no lines, as many CVs do for older jobs",
    jobs: tidyJobs.map((job, index) => (index >= 2 ? { ...job, lines: [], achievements: [] } : job)),
  },
  {
    ...tidy,
    name: "results-only",
    tries: "every line under jobs 3 and 4 states a result or a number, with no achievements subheading",
    jobs: tidyJobs.map((job, index) => {
      if (index === 2) {
        return {
          ...job,
          lines: [
            "Cut the department's food waste by 18% in my first year",
            "Raised the department's mystery shopper score from 72% to 91%",
            "Fresh Team of the Quarter twice in 2010",
          ],
        };
      }
      if (index === 3) {
        return { ...job, lines: ["Signed up 340 customers to the loyalty card in 2008, the most in the store", "Employee of the Month three times"] };
      }
      return job;
    }),
  },
  {
    ...tidy,
    name: "design-tool",
    tries: "a design-tool PDF: the lines of jobs 3 and 4 are text boxes added last, so page 2 stores them after everything else",
    jobs: tidyJobs,
    linesDrawnLast: [2, 3],
    plain: true,
  },
  {
    name: "long",
    tries: "a long CV that runs to a third page, with many lines under every job",
    summary:
      "Retail store manager with 15 years of experience running large teams and multi-million-pound budgets. " +
      "I lead from the shop floor, build teams that stay, and use weekly KPIs to keep stores safe, tidy and profitable. " +
      "I have opened a new store, turned round an underperforming one and trained supervisors who now run their own stores. " +
      "Ready for an operations management role in the West Midlands, looking after several sites.",
    skills: [
      ...fourJobProfile.skills,
      "Customer service",
      "Loss prevention",
      "Budget planning",
      "Coaching",
      "Microsoft Excel",
      "Store openings",
      "Visual merchandising",
    ],
    // Long, wrapping lines, as in a wordy CV.
    jobs: [
      {
        ...tidyJobs[0],
        lines: [
          ...tidyJobs[0].lines,
          "Lead a management team of two deputies and five supervisors, holding weekly one-to-ones and quarterly reviews with each of them",
          "Plan the store's rotas around trading patterns, school holidays and seasonal peaks, so that the shop floor is covered without paying for overtime",
          "Run quarterly health and safety audits with the regional safety team and make sure every action from the audit is closed within four weeks",
          "Recruit, train and coach new starters and apprentices, including the store's first two retail management apprentices in 2021",
          "Handle escalated customer complaints and refunds over £500, and reply in writing to every complaint that reaches head office",
          "Agree the store's yearly sales and wage budget with the area manager and track it every week against the plan",
          "Set the standards for the shop floor, the stockroom and the customer toilets, and check them on a daily walk round the store",
        ],
        achievements: [...tidyJobs[0].achievements, "Raised the store's colleague engagement score from 64% to 82%"],
      },
      {
        ...tidyJobs[1],
        lines: [
          ...tidyJobs[1].lines,
          "Ran the weekly stock counts and the yearly stocktake, working with the stock control team to explain every difference over £200",
          "Planned staff rotas and holiday cover for 60 colleagues across the shop floor, the tills and the stockroom",
          "Led the store's fire safety and first aid training and kept the training records ready for audits",
          "Checked the till balances and banked the takings each morning, following the company's cash handling rules",
          "Set up the click and collect desk in 2014 and trained the six colleagues who ran it",
          "Walked the store with the area manager on every monthly visit and followed up the actions agreed on the walk",
        ],
        achievements: ["Cut overtime spend by 22% in 2014 with a new rota pattern", "Trained six new supervisors, four of whom were promoted"],
      },
      {
        ...tidyJobs[2],
        lines: [
          ...tidyJobs[2].lines,
          "Ordered stock for the bakery, deli and produce counters, using the sales from the same week the year before as a guide",
          "Trained new starters on food hygiene, the deli slicer and the till procedures before their first shift on the counter",
          "Set out the weekly price changes and the promotion displays at the end of each aisle every Sunday evening",
        ],
        achievements: ["Cut the department's food waste by 18% in my first year"],
      },
      {
        ...tidyJobs[3],
        lines: [
          ...tidyJobs[3].lines,
          "Took deliveries and rotated stock in the back store, making sure the oldest stock went out first",
          "Opened and closed the store as a key holder from 2008, including setting the alarm and checking the building at night",
        ],
      },
    ],
    sections: [
      ...tidySections,
      {
        heading: "Training",
        lines: ["Food Hygiene Level 2, 2009", "Fire Marshal training, 2015", "Personal Licence holder, 2016", "Managing Difficult Conversations, 2021"],
      },
      { heading: "Interests", lines: ["Coaching an under-12s football team on Saturday mornings", "Running and cooking for friends"] },
    ],
    fontSize: 11,
  },
];

const A4 = { width: 595.28, height: 841.89, margin: 56.7 };

type Piece = { page: number; x: number; y: number; text: string; font: PDFFont; size: number; group: string };

/** Draws the variant on A4 pages, top to bottom, except the lines of `linesDrawnLast`, which go last on their page. */
export async function buildVariantPdf(variant: Variant): Promise<Uint8Array> {
  // No creation date in the file, so building it twice gives the same bytes.
  const pdf = await PDFDocument.create({ updateMetadata: false });
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const textSize = variant.fontSize ?? 10;
  const width = A4.width - A4.margin * 2;
  const name = fourJobProfile.fullName;

  const pieces: Piece[] = [];
  let page = 0;
  let y = A4.height - A4.margin;
  let group = "top";
  const newPage = () => {
    page += 1;
    y = A4.height - A4.margin;
    if (!variant.plain) pieces.push({ page, x: A4.margin, y: A4.height - 34, text: `${name} – CV`, font: regular, size: 8, group: "header" });
  };
  const write = (text: string, options: { font?: PDFFont; size?: number; indent?: number; before?: number } = {}) => {
    const { font = regular, size = textSize, indent = 0, before = 0 } = options;
    y -= before;
    for (const line of wrap(text, font, size, width - indent)) {
      if (y - size * 1.4 < A4.margin + 24) newPage();
      y -= size * 1.4;
      pieces.push({ page, x: A4.margin + indent, y, text: line, font, size, group });
    }
  };
  const heading = (text: string) => write(text.toUpperCase(), { font: bold, size: textSize + 1, before: 14 });
  const bullet = (text: string) => write(`•  ${text}`, { indent: 10, before: 2 });

  write(name, { font: bold, size: 18 });
  write([fourJobProfile.contact.location, fourJobProfile.contact.phone, fourJobProfile.contact.email].join("  |  "), { size: 9.5, before: 4 });
  heading("Personal profile");
  write(variant.summary, { before: 2 });
  heading("Key skills");
  write(variant.skills.join("  •  "), { before: 2 });
  heading("Work experience");
  variant.jobs.forEach((job, index) => {
    if (index === variant.newPageBeforeJob) newPage();
    group = `job-${index}`;
    write([job.title, job.company, job.location].filter(Boolean).join(", "), { font: bold, before: 10 });
    // The dates sit on the job's line, pushed to the right edge.
    pieces.push({ ...pieces[pieces.length - 1], text: job.dates, x: A4.width - A4.margin - regular.widthOfTextAtSize(job.dates, textSize), font: regular });
    group = `job-${index}-lines`;
    job.lines.forEach(bullet);
    if (job.achievements.length > 0) {
      write("Key achievements", { font: italic, before: 4 });
      job.achievements.forEach(bullet);
    }
  });
  group = "end";
  for (const section of variant.sections) {
    heading(section.heading);
    section.lines.forEach(bullet);
  }
  write("References available on request.", { font: italic, before: 14 });

  const last = new Set((variant.linesDrawnLast ?? []).map((index) => `job-${index}-lines`));
  const pages = Array.from({ length: page + 1 }, () => pdf.addPage([A4.width, A4.height]));
  pages.forEach((each, pageIndex) => {
    const own = pieces.filter((piece) => piece.page === pageIndex);
    for (const piece of [...own.filter((p) => !last.has(p.group)), ...own.filter((p) => last.has(p.group))]) {
      each.drawText(piece.text, { x: piece.x, y: piece.y, size: piece.size, font: piece.font });
    }
    if (!variant.plain) {
      const footer = `Page ${pageIndex + 1} of ${pages.length}`;
      each.drawText(footer, { x: (A4.width - regular.widthOfTextAtSize(footer, 8)) / 2, y: 28, size: 8, font: regular });
    }
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
