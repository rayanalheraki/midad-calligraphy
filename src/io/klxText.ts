// Legacy single-byte code page used for text inside KLX files.
// Bytes 0x00-0xBF are identical to Windows-1256; 0xC0-0xFF follow Persian alphabetical
// order. The table below maps them to Windows-1256 so old files can be read.
const LEGACY_HIGH =
  'c0c2c7c1c3c4c5c6c881cac9cbcc8dcdcecfd0d1d28ed3d7d4d5d6d8dcd9dadbdddedf90e1e3e4e6e5edecebecedeeeff0f1f2f3f4f5f6f7f8f9fafbfcfdfeff';

const TABLE = new Uint8Array(256);
for (let i = 0; i < 256; i++) TABLE[i] = i;
for (let i = 0; i < 64; i++) TABLE[0xc0 + i] = parseInt(LEGACY_HIGH.slice(i * 2, i * 2 + 2), 16);

let decoder: TextDecoder | null = null;

export function legacyToUnicode(bytes: Uint8Array): string {
  const mapped = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) mapped[i] = TABLE[bytes[i]];
  decoder ??= new TextDecoder('windows-1256');
  return decoder.decode(mapped);
}

function unpair(body: string, invert: boolean): Uint8Array | null {
  const out = new Uint8Array(Math.floor(body.length / 2));
  for (let i = 0; i + 1 < body.length; i += 2) {
    const a = body.charCodeAt(i) - 0x61;
    const d = body.charCodeAt(i + 1) - 0x61;
    if (a < 0 || a > 15 || d < 0 || d > 15) return null;
    const p = (((a >> 2) & 3) << 6) | (((d >> 2) & 3) << 4) | ((a & 3) << 2) | (d & 3);
    out[i / 2] = invert ? ~p & 0xff : p;
  }
  return out;
}

/**
 * Decodes a string stored in a KLX file. Two layouts exist:
 *  - "$*&!" + letter pairs (newer files): two letters a-p per byte, bit-interleaved, inverted;
 *  - "??=@" + letter pairs (older files): same interleave without the inversion.
 * The prefix can be applied more than once; the final bytes are in the legacy code page above.
 */
export function decodeKlxString(s: string): string {
  let cur = s;
  for (let guard = 0; guard < 8; guard++) {
    let bytes: Uint8Array | null = null;
    if (cur.startsWith('$*&!')) bytes = unpair(cur.slice(4), true);
    else if (cur.startsWith('??=@')) bytes = unpair(cur.slice(4), false);
    else break;
    if (!bytes) break;
    cur = String.fromCharCode(...bytes);
    if (!cur.startsWith('$*&!') && !cur.startsWith('??=@')) {
      return legacyToUnicode(bytes);
    }
  }
  return cur.startsWith('$*&!') || cur.startsWith('??=@') ? '' : cur;
}

/** Inverse of decodeKlxString for the "$*&!" layout (used by tests to build fixtures). */
export function encodeKlxBytes(bytes: Uint8Array): string {
  let out = '$*&!';
  for (const b of bytes) {
    const p = ~b & 0xff;
    const a = (((p >> 6) & 3) << 2) | ((p >> 2) & 3);
    const d = (((p >> 4) & 3) << 2) | (p & 3);
    out += String.fromCharCode(0x61 + a, 0x61 + d);
  }
  return out;
}

export function unicodeToLegacy(text: string): Uint8Array {
  const reverse = new Map<string, number>();
  decoder ??= new TextDecoder('windows-1256');
  for (let code = 0; code < 256; code++) {
    const ch = decoder.decode(new Uint8Array([TABLE[code]]));
    if (!reverse.has(ch)) reverse.set(ch, code);
  }
  return new Uint8Array(Array.from(text, (ch) => reverse.get(ch) ?? 0x3f));
}
