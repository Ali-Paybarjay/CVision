import { describe, expect, it } from "vitest";
import { readZip } from "./test-support";
import { crc32, joinChunks, zipChunks } from "./zip";

const text = (value: string) => new TextEncoder().encode(value);
const modified = new Date("2026-10-23T14:35:08Z");

describe("crc32", () => {
  it("matches the standard check values", () => {
    expect(crc32(text("123456789"))).toBe(0xcbf43926);
    expect(crc32(text("The quick brown fox jumps over the lazy dog"))).toBe(0x414fa339);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe("zipChunks", () => {
  it("writes files that read back byte for byte, with their CRC-32", () => {
    const pdf = Uint8Array.from({ length: 70_000 }, (_, i) => (i * 31) % 256);
    const archive = joinChunks(zipChunks([{ name: "data.json", data: text('{"a":1}\n') }, { name: "cv-files/cv.pdf", data: pdf }], modified));

    const files = readZip(archive);

    expect(files.map((file) => file.name)).toEqual(["data.json", "cv-files/cv.pdf"]);
    expect(new TextDecoder().decode(files[0].data)).toBe('{"a":1}\n');
    expect(files[1].data).toEqual(pdf);
    // Stored without compression, with UTF-8 names.
    expect(files.every((file) => file.method === 0 && file.flags === 0x0800)).toBe(true);
  });

  it("keeps names in UTF-8, so accented file names survive", () => {
    const files = readZip(joinChunks(zipChunks([{ name: "cv-files/Zoë Brontë – CV.docx", data: text("x") }], modified)));

    expect(files[0].name).toBe("cv-files/Zoë Brontë – CV.docx");
  });

  it("dates every file with the export time, in UTC", () => {
    const archive = joinChunks(zipChunks([{ name: "data.json", data: text("{}") }], modified));
    const view = new DataView(archive.buffer);

    // MS-DOS time and date: 14:35:08 and 23 October 2026.
    expect(view.getUint16(10, true)).toBe((14 << 11) | (35 << 5) | 4);
    expect(view.getUint16(12, true)).toBe(((2026 - 1980) << 9) | (10 << 5) | 23);
  });

  it("writes an empty archive as just the end record", () => {
    const archive = joinChunks(zipChunks([], modified));

    expect(archive).toHaveLength(22);
    expect(readZip(archive)).toEqual([]);
  });

  it("refuses names that could write outside the folder they are unzipped into", () => {
    for (const name of ["", "/etc/passwd", "../cv.pdf", "cv-files/../../cv.pdf", "cv-files/./cv.pdf", "cv-files\\cv.pdf", "cv-files//cv.pdf"]) {
      expect(() => zipChunks([{ name, data: text("x") }], modified)).toThrow(/unsafe file name/);
    }
  });

  it("refuses the same name twice", () => {
    expect(() => zipChunks([{ name: "data.json", data: text("1") }, { name: "data.json", data: text("2") }], modified)).toThrow(/duplicate/);
  });
});
