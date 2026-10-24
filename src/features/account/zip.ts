// A small ZIP writer for "Download my data" (issue #43), so the download needs no new dependency.
// Files are stored as they are, without compression: CVs are PDF or DOCX, which are compressed already.
// No ZIP64, so the archive stays under 4 GB and 65,535 files: far more than one user's data.

export type ZipEntry = {
  /** The path inside the archive, with "/" between folders, e.g. "cv-files/cv.pdf". */
  name: string;
  data: Uint8Array;
};

const maxSize = 0xffffffff;
const maxEntries = 0xffff;
// General purpose flag bit 11: the file names are UTF-8.
const utf8Names = 0x0800;
// Version 2.0 of the format, enough for stored files and folders.
const version = 20;

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** The CRC-32 checksum ZIP stores for each file (the IEEE polynomial, as in gzip and PNG). */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * The archive as byte chunks, in order: stream them, or join them for one file.
 * Every entry gets `modified` as its date, in UTC (ZIP stores a date and time with no time zone).
 */
export function zipChunks(entries: ZipEntry[], modified: Date): Uint8Array[] {
  if (entries.length > maxEntries) throw new Error("zip: too many files");
  const { time, date } = dosDateTime(modified);
  const encoder = new TextEncoder();
  const names = new Set<string>();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    checkName(entry.name, names);
    if (entry.data.length > maxSize) throw new Error("zip: file too large");
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, version, true);
    local.setUint16(6, utf8Names, true);
    local.setUint16(8, 0, true); // stored, not compressed
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, entry.data.length, true);
    local.setUint32(22, entry.data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);

    const record = new DataView(new ArrayBuffer(46));
    record.setUint32(0, 0x02014b50, true);
    record.setUint16(4, version, true);
    record.setUint16(6, version, true);
    record.setUint16(8, utf8Names, true);
    record.setUint16(10, 0, true);
    record.setUint16(12, time, true);
    record.setUint16(14, date, true);
    record.setUint32(16, crc, true);
    record.setUint32(20, entry.data.length, true);
    record.setUint32(24, entry.data.length, true);
    record.setUint16(28, name.length, true);
    // Extra field, comment, disk number, internal and external attributes: all 0.
    record.setUint32(42, offset, true);

    chunks.push(new Uint8Array(local.buffer), name, entry.data);
    central.push(new Uint8Array(record.buffer), name);
    offset += 30 + name.length + entry.data.length;
    if (offset > maxSize) throw new Error("zip: archive too large");
  }

  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  if (offset + centralSize > maxSize) throw new Error("zip: archive too large");

  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  // This disk and the disk where the central directory starts: both 0.
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  end.setUint16(20, 0, true);

  return [...chunks, ...central, new Uint8Array(end.buffer)];
}

/** Joins chunks into one array, e.g. to read an archive back in tests. */
export function joinChunks(chunks: Uint8Array[]): Uint8Array {
  const joined = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    joined.set(chunk, at);
    at += chunk.length;
  }
  return joined;
}

/** Relative paths only, without "." or ".." parts, so unzipping cannot write outside its folder. */
function checkName(name: string, seen: Set<string>) {
  const parts = name.split("/");
  if (!name || name.includes("\\") || parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`zip: unsafe file name "${name}"`);
  }
  if (seen.has(name)) throw new Error(`zip: duplicate file name "${name}"`);
  seen.add(name);
}

/** MS-DOS date and time, which ZIP uses: from 1980, to the nearest 2 seconds. */
function dosDateTime(at: Date) {
  const year = Math.min(Math.max(at.getUTCFullYear(), 1980), 2107);
  return {
    time: (at.getUTCHours() << 11) | (at.getUTCMinutes() << 5) | Math.floor(at.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((at.getUTCMonth() + 1) << 5) | at.getUTCDate(),
  };
}
