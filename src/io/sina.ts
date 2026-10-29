// SinaSoft ("Sina") code page used by Kelk/Zarnegar for stored text.
// Bytes 0x00-0xBF are identical to Windows-1256; 0xC0-0xFF follow Persian alphabetical
// order. The mapping below (Sina -> Windows-1256) was recovered from the conversion table
// shipped in Kelk's text-handling DLLs, for interoperability with old .klx documents.
const SINA_HIGH =
  'c0c2c7c1c3c4c5c6c881cac9cbcc8dcdcecfd0d1d28ed3d7d4d5d6d8dcd9dadbdddedf90e1e3e4e6e5edecebecedeeeff0f1f2f3f4f5f6f7f8f9fafbfcfdfeff';

const TABLE = new Uint8Array(256);
for (let i = 0; i < 256; i++) TABLE[i] = i;
for (let i = 0; i < 64; i++) TABLE[0xc0 + i] = parseInt(SINA_HIGH.slice(i * 2, i * 2 + 2), 16);

let decoder: TextDecoder | null = null;

export function sinaToUnicode(bytes: Uint8Array): string {
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
 * Decodes a string stored by Kelk. Two layouts exist:
 *  - "$*&!" + letter pairs (Kelk 2007+): two letters a-p per byte, bit-interleaved, inverted;
 *  - "??=@" + letter pairs (Kelk 2000-2005): same interleave without the inversion.
 * The prefix can be applied more than once; the final bytes are in the Sina code page.
 */
export function decodeKelkString(s: string): string {
  let cur = s;
  for (let guard = 0; guard < 8; guard++) {
    let bytes: Uint8Array | null = null;
    if (cur.startsWith('$*&!')) bytes = unpair(cur.slice(4), true);
    else if (cur.startsWith('??=@')) bytes = unpair(cur.slice(4), false);
    else break;
    if (!bytes) break;
    cur = String.fromCharCode(...bytes);
    if (!cur.startsWith('$*&!') && !cur.startsWith('??=@')) {
      return sinaToUnicode(bytes);
    }
  }
  return cur.startsWith('$*&!') || cur.startsWith('??=@') ? '' : cur;
}

/** Inverse of decodeKelkString for the "$*&!" layout (used by tests to build fixtures). */
export function encodeKelkBytes(bytes: Uint8Array): string {
  let out = '$*&!';
  for (const b of bytes) {
    const p = ~b & 0xff;
    const a = (((p >> 6) & 3) << 2) | ((p >> 2) & 3);
    const d = (((p >> 4) & 3) << 2) | (p & 3);
    out += String.fromCharCode(0x61 + a, 0x61 + d);
  }
  return out;
}

export function unicodeToSina(text: string): Uint8Array {
  const reverse = new Map<string, number>();
  decoder ??= new TextDecoder('windows-1256');
  for (let sina = 0; sina < 256; sina++) {
    const ch = decoder.decode(new Uint8Array([TABLE[sina]]));
    if (!reverse.has(ch)) reverse.set(ch, sina);
  }
  return new Uint8Array(Array.from(text, (ch) => reverse.get(ch) ?? 0x3f));
}
