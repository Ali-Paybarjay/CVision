import "server-only";
import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";

// A Word (.docx) file is a ZIP archive of XML files. Node can inflate ZIP data by itself,
// so reading one takes this small reader instead of another dependency.

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipError";
  }
}

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const UTF8_NAMES = 0x0800;

type ReadZipOptions = {
  /** Which entries to unpack, by name (e.g. "word/document.xml"). */
  include: (name: string) => boolean;
  /** The largest an unpacked entry may be, so a small file cannot unpack into gigabytes. */
  maxEntryBytes: number;
  /** The most all unpacked entries may add up to, so many entries cannot do it together either. */
  maxTotalBytes: number;
  /** The most entries the archive may list. A Word file has a few dozen. */
  maxEntries?: number;
};

/** Unpacks the entries of a ZIP archive that `include` asks for, keyed by name. */
export function readZip(
  bytes: Uint8Array,
  { include, maxEntryBytes, maxTotalBytes, maxEntries = 1000 }: ReadZipOptions,
): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = findEndOfCentralDirectory(view);
  const entryCount = view.getUint16(end + 10, true);
  if (entryCount > maxEntries) throw new ZipError("The archive holds too many files.");
  let offset = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const files = new Map<string, Uint8Array>();
  // A name listed twice, or one block of packed data listed under two names, is how a small archive
  // is made to unpack into far more than its size. Real Word files do neither.
  const names = new Set<string>();
  const usedRanges: Array<{ start: number; end: number }> = [];
  let unpackedBytes = 0;

  for (let index = 0; index < entryCount; index++) {
    assertInside(view, offset, 46);
    if (view.getUint32(offset, true) !== CENTRAL_DIRECTORY_ENTRY) {
      throw new ZipError("The archive's file list is damaged.");
    }
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    assertInside(view, offset + 46, nameLength);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;

    if (names.has(name)) throw new ZipError(`The archive lists ${name} twice.`);
    names.add(name);

    if (!include(name)) continue;
    if (flags & 0x1) throw new ZipError(`${name} is encrypted.`);
    // What this entry may still unpack to: its own limit, or what is left of the total.
    const limit = Math.min(maxEntryBytes, maxTotalBytes - unpackedBytes);
    if (limit <= 0 || size > limit) throw new ZipError(`${name} is too large to unpack.`);

    assertInside(view, localOffset, 30);
    if (view.getUint32(localOffset, true) !== LOCAL_FILE_HEADER) {
      throw new ZipError(`${name} is damaged.`);
    }
    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    assertInside(view, dataStart, compressedSize);
    const range = { start: localOffset, end: dataStart + compressedSize };
    if (usedRanges.some((used) => range.start < used.end && used.start < range.end)) {
      throw new ZipError(`${name} shares its data with another file in the archive.`);
    }
    usedRanges.push(range);
    const data = bytes.subarray(dataStart, dataStart + compressedSize);

    let unpacked: Uint8Array;
    if (method === 0) {
      if (data.length > limit) throw new ZipError(`${name} is too large to unpack.`);
      unpacked = data;
    } else if (method === 8) {
      // The size in the file list can be false, so the unpacking itself is capped too.
      unpacked = inflate(data, name, limit);
    } else {
      throw new ZipError(`${name} uses an unsupported compression method (${method}).`);
    }
    unpackedBytes += unpacked.length;
    files.set(name, unpacked);
  }

  return files;
}

export type ZipEntry = {
  name: string;
  data: Uint8Array | string;
  /** Store without compression, as some tools do. */
  store?: boolean;
};

/**
 * Packs entries into a ZIP archive. Used to build the sample Word CVs and test files.
 * The fixed date keeps the output the same on every run.
 */
export function writeZip(entries: ZipEntry[], modified = new Date(Date.UTC(2026, 9, 20))): Uint8Array {
  const encoder = new TextEncoder();
  const { time, date } = toDosDateTime(modified);
  const chunks: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = typeof entry.data === "string" ? encoder.encode(entry.data) : entry.data;
    const method = entry.store ? 0 : 8;
    const packed = entry.store ? data : deflateRawSync(data);
    const checksum = crc32(data);

    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, LOCAL_FILE_HEADER, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, UTF8_NAMES, true);
    localView.setUint16(8, method, true);
    localView.setUint16(10, time, true);
    localView.setUint16(12, date, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, packed.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, CENTRAL_DIRECTORY_ENTRY, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, UTF8_NAMES, true);
    centralView.setUint16(10, method, true);
    centralView.setUint16(12, time, true);
    centralView.setUint16(14, date, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, packed.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);

    chunks.push(local, packed);
    directory.push(central);
    offset += local.length + packed.length;
  }

  const directorySize = directory.reduce((total, part) => total + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, END_OF_CENTRAL_DIRECTORY, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, directorySize, true);
  endView.setUint32(16, offset, true);

  return concat([...chunks, ...directory, end]);
}

function findEndOfCentralDirectory(view: DataView): number {
  // The record is 22 bytes, followed by a comment of up to 65,535 bytes.
  const last = view.byteLength - 22;
  const first = Math.max(0, last - 0xffff);
  for (let offset = last; offset >= first; offset--) {
    if (view.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY) return offset;
  }
  throw new ZipError("This is not a ZIP archive.");
}

function assertInside(view: DataView, offset: number, length: number) {
  if (offset < 0 || length < 0 || offset + length > view.byteLength) {
    throw new ZipError("The archive is cut short.");
  }
}

function inflate(data: Uint8Array, name: string, maxBytes: number): Uint8Array {
  try {
    return inflateRawSync(data, { maxOutputLength: maxBytes });
  } catch {
    throw new ZipError(`${name} could not be unpacked.`);
  }
}

function toDosDateTime(moment: Date): { time: number; date: number } {
  return {
    time: (moment.getUTCHours() << 11) | (moment.getUTCMinutes() << 5) | Math.floor(moment.getUTCSeconds() / 2),
    date: ((moment.getUTCFullYear() - 1980) << 9) | ((moment.getUTCMonth() + 1) << 5) | moment.getUTCDate(),
  };
}

function concat(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
