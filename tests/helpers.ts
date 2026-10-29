import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { findFontDef, getLoadedFont, loadFontFromBuffer, type LoadedFont } from '../src/engine/fonts';

const require = createRequire(import.meta.url);

export async function loadTestFont(id: string): Promise<LoadedFont> {
  const ready = getLoadedFont(id);
  if (ready) return ready;
  const def = findFontDef(id);
  if (!def?.file) throw new Error('unknown font ' + id);
  const data = readFileSync(require.resolve(def.file));
  return loadFontFromBuffer(def, data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
}

// --- Minimal VB6 PropertyBag writer used to build .klx fixtures -------------------------

function u16(n: number) {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n, true);
  return b;
}
function u32(n: number) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, true);
  return b;
}
function i32(n: number) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setInt32(0, n, true);
  return b;
}
function f32(n: number) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setFloat32(0, n, true);
  return b;
}
function utf16(s: string) {
  const b = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) new DataView(b.buffer).setUint16(i * 2, s.charCodeAt(i), true);
  return b;
}
function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export type BagValue = { long: number } | { single: number } | { byte: number } | { str: string } | { bag: [string, BagValue][] };

function record(name: string, value: BagValue): Uint8Array {
  let vt: number;
  let payload: Uint8Array;
  if ('long' in value) {
    vt = 3;
    payload = i32(value.long);
  } else if ('single' in value) {
    vt = 4;
    payload = f32(value.single);
  } else if ('byte' in value) {
    vt = 17;
    payload = new Uint8Array([value.byte]);
  } else if ('str' in value) {
    vt = 8;
    payload = concat([u32(value.str.length), utf16(value.str)]);
  } else {
    vt = 0x2011;
    const inner = bagBytes(value.bag);
    payload = concat([u16(1), u32(inner.length), u32(0), inner]);
  }
  const nameBytes = utf16(name);
  let size = 12 + nameBytes.length + payload.length;
  const pad = (4 - (size % 4)) % 4;
  size += pad;
  return concat([u16(vt), u16(name.length), u32(0), u32(size), nameBytes, payload, new Uint8Array(pad)]);
}

export function bagBytes(entries: [string, BagValue][]): Uint8Array {
  const body = concat(entries.map(([n, v]) => record(n, v)));
  return concat([u32(0xb293), u32(body.length), body]);
}

export function klxFile(entries: [string, BagValue][]): ArrayBuffer {
  const bag = bagBytes(entries);
  const file = concat([u16(0x2011), u16(1), u32(bag.length), u32(0), bag]);
  return file.buffer;
}
