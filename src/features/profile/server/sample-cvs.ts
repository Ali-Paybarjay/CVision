import "server-only";
import type { Profile } from "@/shared/contracts";
import { personas, type PersonaName } from "@/shared/sample-data";
import { writeZip, type ZipEntry } from "./zip";

// Builds the four fictional Word CVs in sample-data/cvs from the personas, for testing the upload
// and the profile-extract evals. Each uses a different layout that real CVs use, so extraction is
// tested on more than one shape. To rebuild the files after a persona changes:
//   WRITE_SAMPLE_CVS=1 npx vitest run src/features/profile/server/sample-cvs.test.ts

export const samplePersonaNames = ["sara", "reza", "emma", "daniel"] as const satisfies readonly PersonaName[];

type Layout = {
  /** The name and contact line sit in the page header, as many templates do. */
  contactInHeader: boolean;
  /** Real Word bullets (a numbering definition) instead of typed "•" characters. */
  wordBullets: boolean;
  /** Skills in a two-column table instead of a list. */
  skillsTable: boolean;
  /** Dates on the job title line, pushed to the right with a tab. */
  datesOnTitleLine: boolean;
  months: "long" | "short";
};

const layouts: Record<(typeof samplePersonaNames)[number], Layout> = {
  sara: { contactInHeader: false, wordBullets: false, skillsTable: false, datesOnTitleLine: false, months: "long" },
  reza: { contactInHeader: true, wordBullets: true, skillsTable: false, datesOnTitleLine: false, months: "long" },
  emma: { contactInHeader: false, wordBullets: true, skillsTable: true, datesOnTitleLine: true, months: "short" },
  daniel: { contactInHeader: true, wordBullets: false, skillsTable: false, datesOnTitleLine: true, months: "short" },
};

export function sampleCvFileName(name: PersonaName): string {
  return `${name}.docx`;
}

/** The Word file for one persona's CV. */
export function buildSampleCv(name: (typeof samplePersonaNames)[number]): Uint8Array {
  return buildCvDocx(personas[name].profile, layouts[name]);
}

function buildCvDocx(profile: Profile, layout: Layout): Uint8Array {
  const contactLine = [profile.contact.location, profile.contact.phone, profile.contact.email, profile.contact.linkedIn]
    .filter(Boolean)
    .join("  |  ");
  const nameBlock = [
    paragraph(run(profile.fullName, { bold: true, size: 20 }), { after: 60 }),
    paragraph(run(contactLine, { size: 10 }), { after: 240 }),
  ];
  const bullet = (text: string) => (layout.wordBullets ? paragraph(run(text), { list: true }) : paragraph(run(`• ${text}`)));

  const body: string[] = layout.contactInHeader ? [] : [...nameBlock];

  if (profile.summary) {
    body.push(heading("Personal profile"), paragraph(run(profile.summary)));
  }

  body.push(heading("Key skills"));
  if (layout.skillsTable) {
    body.push(table(profile.skills));
  } else {
    body.push(...profile.skills.map(bullet));
  }

  body.push(heading("Work experience"));
  for (const job of profile.experience) {
    const where = [job.company, job.location].filter(Boolean).join(", ");
    const dates = `${month(job.startDate, layout)} – ${job.endDate ? month(job.endDate, layout) : "Present"}`;
    if (layout.datesOnTitleLine) {
      body.push(paragraph(run(`${job.title}, ${where}`, { bold: true }) + tab() + run(dates), { rightTab: true, before: 160 }));
    } else {
      body.push(
        paragraph(run(job.title, { bold: true }) + run(` – ${where}`), { before: 160, after: 0 }),
        paragraph(run(dates, { italic: true })),
      );
    }
    body.push(...job.duties.map(bullet));
    if (job.achievements.length > 0) {
      body.push(paragraph(run("Key achievements", { italic: true })), ...job.achievements.map(bullet));
    }
  }

  body.push(heading("Education"));
  for (const course of profile.education) {
    const award = [course.qualification, course.subject].filter(Boolean).join(" ");
    const grade = course.grade ? ` (${course.grade})` : "";
    const dates = course.startDate
      ? `${month(course.startDate, layout)} – ${course.endDate ? month(course.endDate, layout) : "Present"}`
      : course.endDate
        ? `Completed ${month(course.endDate, layout)}`
        : "";
    body.push(paragraph(run(`${award}${grade}`, { bold: true }) + run(`, ${course.institution}`), { before: 120, after: 0 }));
    if (dates) body.push(paragraph(run(dates, { italic: true })));
  }

  if (profile.certifications.length > 0) {
    body.push(heading("Certifications"));
    body.push(
      ...profile.certifications.map((certificate) =>
        bullet([certificate.name, certificate.issuer, certificate.year].filter(Boolean).join(", ")),
      ),
    );
  }

  body.push(paragraph(run("References available on request.", { italic: true }), { before: 240 }));

  const files: ZipEntry[] = [
    { name: "[Content_Types].xml", data: contentTypes(layout) },
    { name: "_rels/.rels", data: packageRelationships },
    { name: "docProps/core.xml", data: coreProperties },
    { name: "word/_rels/document.xml.rels", data: documentRelationships(layout) },
    { name: "word/styles.xml", data: styles },
    { name: "word/document.xml", data: wordDocument(body.join(""), layout) },
  ];
  if (layout.wordBullets) files.push({ name: "word/numbering.xml", data: numbering });
  if (layout.contactInHeader) files.push({ name: "word/header1.xml", data: header(nameBlock.join("")) });

  return writeZip(files);
}

// --- WordprocessingML ---------------------------------------------------------------------------

const NAMESPACES =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
/** The right edge of the text on A4 with 2 cm margins, in twentieths of a point. */
const TEXT_WIDTH = 9638;

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function run(text: string, style: { bold?: boolean; italic?: boolean; size?: number } = {}): string {
  const properties = [
    style.bold ? "<w:b/>" : "",
    style.italic ? "<w:i/>" : "",
    style.size ? `<w:sz w:val="${style.size * 2}"/><w:szCs w:val="${style.size * 2}"/>` : "",
  ].join("");
  return `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ""}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

function tab(): string {
  return "<w:r><w:tab/></w:r>";
}

function paragraph(
  runs: string,
  options: { before?: number; after?: number; list?: boolean; rightTab?: boolean; keepNext?: boolean } = {},
): string {
  const properties = [
    options.keepNext ? "<w:keepNext/>" : "",
    options.list ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : "",
    options.rightTab ? `<w:tabs><w:tab w:val="right" w:pos="${TEXT_WIDTH}"/></w:tabs>` : "",
    options.before !== undefined || options.after !== undefined
      ? `<w:spacing${options.before !== undefined ? ` w:before="${options.before}"` : ""}${options.after !== undefined ? ` w:after="${options.after}"` : ""}/>`
      : "",
    options.list ? '<w:ind w:left="360" w:hanging="360"/>' : "",
  ].join("");
  return `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ""}${runs}</w:p>`;
}

function heading(text: string): string {
  return paragraph(run(text.toUpperCase(), { bold: true, size: 12 }), { before: 280, after: 100, keepNext: true });
}

function table(items: string[]): string {
  const rows: string[] = [];
  for (let index = 0; index < items.length; index += 2) {
    const cells = [items[index], items[index + 1] ?? ""]
      .map((text) => `<w:tc><w:tcPr><w:tcW w:w="${TEXT_WIDTH / 2}" w:type="dxa"/></w:tcPr>${paragraph(run(text))}</w:tc>`)
      .join("");
    rows.push(`<w:tr>${cells}</w:tr>`);
  }
  const grid = `<w:tblGrid><w:gridCol w:w="${TEXT_WIDTH / 2}"/><w:gridCol w:w="${TEXT_WIDTH / 2}"/></w:tblGrid>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${TEXT_WIDTH}" w:type="dxa"/></w:tblPr>${grid}${rows.join("")}</w:tbl>`;
}

const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function month(yearMonth: string, layout: Layout): string {
  const [year, monthNumber] = yearMonth.split("-");
  const name = LONG_MONTHS[Number(monthNumber) - 1];
  return `${layout.months === "long" ? name : name.slice(0, 3)} ${year}`;
}

function wordDocument(body: string, layout: Layout): string {
  const headerReference = layout.contactInHeader ? '<w:headerReference w:type="default" r:id="rId3"/>' : "";
  const section = `<w:sectPr>${headerReference}<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>`;
  return `${XML_DECLARATION}<w:document ${NAMESPACES}><w:body>${body}${section}</w:body></w:document>`;
}

function header(content: string): string {
  return `${XML_DECLARATION}<w:hdr ${NAMESPACES}>${content}</w:hdr>`;
}

function contentTypes(layout: Layout): string {
  const wordml = "application/vnd.openxmlformats-officedocument.wordprocessingml";
  return `${XML_DECLARATION}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="${wordml}.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="${wordml}.styles+xml"/>
${layout.wordBullets ? `<Override PartName="/word/numbering.xml" ContentType="${wordml}.numbering+xml"/>\n` : ""}${layout.contactInHeader ? `<Override PartName="/word/header1.xml" ContentType="${wordml}.header+xml"/>\n` : ""}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`;
}

const packageRelationships = `${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`;

function documentRelationships(layout: Layout): string {
  const type = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  return `${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="${type}/styles" Target="styles.xml"/>
${layout.wordBullets ? `<Relationship Id="rId2" Type="${type}/numbering" Target="numbering.xml"/>\n` : ""}${layout.contactInHeader ? `<Relationship Id="rId3" Type="${type}/header" Target="header1.xml"/>\n` : ""}</Relationships>`;
}

const coreProperties = `${XML_DECLARATION}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title>CV</dc:title>
<dc:creator>CVision sample data (fictional)</dc:creator>
</cp:coreProperties>`;

const styles = `${XML_DECLARATION}<w:styles ${NAMESPACES}>
<w:docDefaults>
<w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
</w:styles>`;

const numbering = `${XML_DECLARATION}<w:numbering ${NAMESPACES}>
<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>
<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="360"/></w:pPr></w:lvl>
</w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`;
