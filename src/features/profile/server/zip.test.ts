import { describe, expect, it } from "vitest";
import { readZip, writeZip, ZipError } from "./zip";

const everything = { include: () => true, maxEntryBytes: 1024 * 1024 };
const text = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);

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

    const files = readZip(zip, { include: (name) => name === "b.xml", maxEntryBytes: 100 });

    expect([...files.keys()]).toEqual(["b.xml"]);
  });

  it("refuses an entry that unpacks to more than the limit", () => {
    const zip = writeZip([{ name: "big.xml", data: "x".repeat(5000) }]);

    expect(() => readZip(zip, { include: () => true, maxEntryBytes: 1000 })).toThrow(ZipError);
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
