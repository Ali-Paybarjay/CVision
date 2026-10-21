import { describe, expect, it } from "vitest";
import { readZip, writeZip, ZipError } from "./zip";

const everything = { include: () => true, maxEntryBytes: 1024 * 1024, maxTotalBytes: 4 * 1024 * 1024 };
const text = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);

/** Points the file list's entry `index` at the data of the entry that starts at `localOffset`. */
function pointEntryAt(zip: Uint8Array, index: number, localOffset: number): Uint8Array {
  const copy = zip.slice();
  const view = new DataView(copy.buffer);
  let offset = view.getUint32(copy.length - 22 + 16, true);
  for (let skipped = 0; skipped < index; skipped++) {
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
  view.setUint32(offset + 42, localOffset, true);
  return copy;
}

describe("readZip", () => {
  it("reads back what writeZip packed, compressed or stored", () => {
    const zip = writeZip([
      { name: "word/document.xml", data: "<w:document>Hello</w:document>" },
      { name: "plain.txt", data: "stored as it is", store: true },
    ]);

    const files = readZip(zip, everything);

    expect(text(files.get("word/document.xml"))).toBe("<w:document>Hello</w:document>");
    expect(text(files.get("plain.txt"))).toBe("stored as it is");
  });

  it("unpacks only the entries asked for", () => {
    const zip = writeZip([
      { name: "a.xml", data: "a" },
      { name: "b.xml", data: "b" },
    ]);

    const files = readZip(zip, { ...everything, include: (name) => name === "b.xml" });

    expect([...files.keys()]).toEqual(["b.xml"]);
  });

  it("refuses an entry that unpacks to more than the limit", () => {
    const zip = writeZip([{ name: "big.xml", data: "x".repeat(5000) }]);

    expect(() => readZip(zip, { ...everything, maxEntryBytes: 1000 })).toThrow(ZipError);
  });

  it("refuses entries that together unpack to more than the total limit", () => {
    const zip = writeZip(["a.xml", "b.xml", "c.xml"].map((name) => ({ name, data: "x".repeat(600) })));

    expect(() => readZip(zip, { ...everything, maxEntryBytes: 1000, maxTotalBytes: 1500 })).toThrow(ZipError);
    expect(readZip(zip, { ...everything, maxEntryBytes: 1000, maxTotalBytes: 1800 }).size).toBe(3);
  });

  it("refuses an archive that lists too many files", () => {
    const zip = writeZip(Array.from({ length: 5 }, (_, index) => ({ name: `part${index}.xml`, data: "x" })));

    expect(() => readZip(zip, { ...everything, maxEntries: 4 })).toThrow(ZipError);
  });

  it("refuses an archive that lists the same name twice", () => {
    const zip = writeZip([
      { name: "word/document.xml", data: "one" },
      { name: "word/document.xml", data: "two" },
    ]);

    expect(() => readZip(zip, everything)).toThrow(/twice/);
  });

  it("refuses two entries that share the same packed data", () => {
    const zip = writeZip([
      { name: "word/header1.xml", data: "x".repeat(2000) },
      { name: "word/header2.xml", data: "y" },
    ]);

    expect(() => readZip(pointEntryAt(zip, 1, 0), everything)).toThrow(/shares its data/);
  });

  it("refuses something that is not a ZIP archive", () => {
    expect(() => readZip(new TextEncoder().encode("just some text, not a zip file"), everything)).toThrow(ZipError);
  });

  it("refuses an archive that is cut short", () => {
    const zip = writeZip([{ name: "word/document.xml", data: "<w:document>Hello there</w:document>" }]);
    const damaged = zip.slice();
    // Point the file list somewhere past the end of the file.
    new DataView(damaged.buffer).setUint32(damaged.length - 6, damaged.length + 100, true);

    expect(() => readZip(damaged, everything)).toThrow(ZipError);
  });
});
