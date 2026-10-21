import { describe, expect, it } from "vitest";
import { extractDocxText, wordXmlToText } from "./docx";
import { writeZip, ZipError } from "./zip";

const p = (inner: string, properties = "") => `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ""}${inner}</w:p>`;
const r = (text: string) => `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;
const body = (inner: string) =>
  `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${inner}</w:body></w:document>`;

describe("wordXmlToText", () => {
  it("puts each paragraph on its own line and joins the runs inside one", () => {
    expect(wordXmlToText(body(p(r("Data ") + r("Analyst")) + p(r("Manchester"))))).toBe("Data Analyst\nManchester");
  });

  it("decodes XML entities", () => {
    expect(wordXmlToText(body(p(r("P&amp;L &lt;10% &#163;15,000 &#x2013; R&amp;D"))))).toBe("P&L <10% £15,000 – R&D");
  });

  it("marks list paragraphs with a bullet", () => {
    const listItem = '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>';
    expect(wordXmlToText(body(p(r("Skills")) + p(r("SQL"), listItem)))).toBe("Skills\n• SQL");
  });

  it("keeps real tabs but ignores tab stop settings", () => {
    const tabStops = '<w:tabs><w:tab w:val="right" w:pos="9638"/></w:tabs>';
    const xml = body(p(r("Store Manager") + "<w:r><w:tab/></w:r>" + r("2016 – Present"), tabStops));
    expect(wordXmlToText(xml)).toBe("Store Manager\t2016 – Present");
  });

  it("turns line breaks inside a paragraph into new lines", () => {
    expect(wordXmlToText(body(p(r("07700 900101") + "<w:r><w:br/></w:r>" + r("sara.khan@example.com"))))).toBe(
      "07700 900101\nsara.khan@example.com",
    );
  });

  it("reads a text box once, although Word stores it twice", () => {
    const textBox = (inner: string) => `<w:txbxContent>${inner}</w:txbxContent>`;
    const xml = body(
      p(
        `<w:r><mc:AlternateContent><mc:Choice Requires="wps">${textBox(p(r("Sara Khan")))}</mc:Choice>` +
          `<mc:Fallback>${textBox(p(r("Sara Khan")))}</mc:Fallback></mc:AlternateContent></w:r>`,
      ) + p(r("Data analyst")),
    );
    expect(wordXmlToText(xml)).toBe("Sara Khan\nData analyst");
  });

  it("keeps a link's visible text but not its field code", () => {
    const xml = body(
      p(
        '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> HYPERLINK "mailto:emma@example.com" </w:instrText></w:r>' +
          '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
          r("emma.walsh@example.com") +
          '<w:r><w:fldChar w:fldCharType="end"/></w:r>',
      ),
    );
    expect(wordXmlToText(xml)).toBe("emma.walsh@example.com");
  });

  it("reads table cells in order and skips empty or self-closing paragraphs", () => {
    const cell = (text: string) => `<w:tc>${p(r(text))}</w:tc>`;
    const xml = body(`<w:tbl><w:tr>${cell("React")}${cell("TypeScript")}</w:tr></w:tbl><w:p/>` + p(""));
    expect(wordXmlToText(xml)).toBe("React\nTypeScript");
  });

  it("ignores deleted text from tracked changes", () => {
    const xml = body(p(`<w:del><w:r><w:delText>old words</w:delText></w:r></w:del>` + r("new words")));
    expect(wordXmlToText(xml)).toBe("new words");
  });

  it("keeps the text after an empty, self-closing tab stop list", () => {
    const tabStops = '<w:tabs><w:tab w:val="right" w:pos="9638"/></w:tabs>';
    const xml = body(p(r("Sara Khan"), "<w:tabs/>") + p(r("Data analyst"), tabStops));
    expect(wordXmlToText(xml)).toBe("Sara Khan\nData analyst");
  });

  // Each of these took seconds with the old patterns, which rescanned the rest of the text for every broken tag.
  it.each([
    ["text tags", "<w:t ".repeat(40_000)],
    ["paragraph tags", "<w:p ".repeat(40_000)],
    ["line breaks", "<w:br ".repeat(40_000)],
    ["text box copies", "<mc:Fallback>".repeat(20_000)],
    ["field codes", "<w:instrText>".repeat(20_000)],
    ["tab stop lists", "<w:tabs>".repeat(20_000)],
  ])("reads a long run of unclosed %s in linear time", (_, broken) => {
    const started = performance.now();
    expect(wordXmlToText(body(p(r("Sara Khan")) + broken))).toBe("Sara Khan");
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe("extractDocxText", () => {
  it("reads the page header before the body, once even if repeated", () => {
    const headerXml = (text: string) =>
      `<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${p(r(text))}</w:hdr>`;
    const docx = writeZip([
      { name: "word/document.xml", data: body(p(r("WORK EXPERIENCE"))) },
      { name: "word/header1.xml", data: headerXml("Daniel Brooks") },
      { name: "word/header2.xml", data: headerXml("Daniel Brooks") },
      { name: "word/footer1.xml", data: headerXml("Page 1 of 2") },
    ]);

    expect(extractDocxText(docx)).toBe("Daniel Brooks\n\nWORK EXPERIENCE");
  });

  it("reads at most six page headers", () => {
    const headerXml = (text: string) =>
      `<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${p(r(text))}</w:hdr>`;
    const headers = Array.from({ length: 7 }, (_, index) => ({
      name: `word/header${index + 1}.xml`,
      data: headerXml(`Header ${index + 1}`),
    }));
    const docx = writeZip([{ name: "word/document.xml", data: body(p(r("Body"))) }, ...headers]);

    const text = extractDocxText(docx);

    expect(text).toContain("Header 6");
    expect(text).not.toContain("Header 7");
  });

  it("refuses a ZIP archive with no Word document in it", () => {
    expect(() => extractDocxText(writeZip([{ name: "mimetype", data: "application/epub+zip" }]))).toThrow(ZipError);
  });
});
