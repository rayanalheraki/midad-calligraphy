// Reads the alternate forms a font offers for each glyph from its GSUB table: single and
// alternate substitutions that are not part of the obligatory Arabic shaping (initial,
// medial, final forms and the like). These feed the alternates list of a selected letter.
import type { LoadedFont } from './fonts';

/** Features whose substitutions are part of correct shaping, not stylistic choices. */
const SHAPING_FEATURES = new Set([
  'init', 'medi', 'fina', 'isol', 'med2', 'fin2', 'fin3', 'ccmp', 'locl', 'rlig', 'mark', 'mkmk',
  'numr', 'dnom', 'frac', 'sups', 'subs', 'sinf', 'ordn', 'onum', 'lnum', 'pnum', 'tnum', 'case',
  'zero', 'rtlm', 'ltrm', 'rtla', 'ltra', 'stch',
]);

/** Upper bound on alternates listed for one glyph. */
const MAX_ALTERNATES = 48;

class Reader {
  constructor(
    private readonly v: DataView,
    private readonly limit: number,
  ) {}
  u16(o: number): number {
    if (o < 0 || o + 2 > this.limit) throw new RangeError('GSUB out of bounds');
    return this.v.getUint16(o);
  }
  i16(o: number): number {
    if (o < 0 || o + 2 > this.limit) throw new RangeError('GSUB out of bounds');
    return this.v.getInt16(o);
  }
  u32(o: number): number {
    if (o < 0 || o + 4 > this.limit) throw new RangeError('GSUB out of bounds');
    return this.v.getUint32(o);
  }
}

function findTable(v: DataView, tag: string): { offset: number; length: number } | null {
  const want = [...tag].reduce((n, c) => (n << 8) | c.charCodeAt(0), 0) >>> 0;
  const count = v.getUint16(4);
  for (let i = 0; i < count; i++) {
    const rec = 12 + i * 16;
    if (rec + 16 > v.byteLength) return null;
    if (v.getUint32(rec) === want) {
      const offset = v.getUint32(rec + 8);
      const length = v.getUint32(rec + 12);
      return offset + length <= v.byteLength ? { offset, length } : null;
    }
  }
  return null;
}

function coverage(r: Reader, at: number): number[] {
  const format = r.u16(at);
  const out: number[] = [];
  if (format === 1) {
    const n = r.u16(at + 2);
    for (let i = 0; i < n; i++) out.push(r.u16(at + 4 + i * 2));
  } else if (format === 2) {
    const n = r.u16(at + 2);
    for (let i = 0; i < n; i++) {
      const rec = at + 4 + i * 6;
      const start = r.u16(rec);
      const end = r.u16(rec + 2);
      for (let g = start; g <= end && out.length < 65536; g++) out.push(g);
    }
  }
  return out;
}

/** gid -> set of gids it may be replaced with (direct edges of the substitution graph). */
export function readAlternateEdges(data: Uint8Array): Map<number, Set<number>> {
  const edges = new Map<number, Set<number>>();
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const table = data.length >= 12 ? findTable(view, 'GSUB') : null;
  if (!table) return edges;
  const r = new Reader(view, table.offset + table.length);
  const base = table.offset;
  const add = (from: number, to: number) => {
    if (from === to) return;
    let s = edges.get(from);
    if (!s) edges.set(from, (s = new Set()));
    s.add(to);
  };

  try {
    const featureList = base + r.u16(base + 6);
    const lookupList = base + r.u16(base + 8);
    const excluded = new Set<number>();
    const nFeatures = r.u16(featureList);
    for (let i = 0; i < nFeatures; i++) {
      const rec = featureList + 2 + i * 6;
      const tag = String.fromCharCode(view.getUint8(rec), view.getUint8(rec + 1), view.getUint8(rec + 2), view.getUint8(rec + 3));
      if (!SHAPING_FEATURES.has(tag)) continue;
      const feature = featureList + r.u16(rec + 4);
      const n = r.u16(feature + 2);
      for (let k = 0; k < n; k++) excluded.add(r.u16(feature + 4 + k * 2));
    }

    const nLookups = r.u16(lookupList);
    for (let li = 0; li < nLookups; li++) {
      if (excluded.has(li)) continue;
      const lookup = lookupList + r.u16(lookupList + 2 + li * 2);
      const lookupType = r.u16(lookup);
      const nSub = r.u16(lookup + 4);
      for (let si = 0; si < nSub; si++) {
        let sub = lookup + r.u16(lookup + 6 + si * 2);
        let type = lookupType;
        if (type === 7) {
          type = r.u16(sub + 2);
          sub = sub + r.u32(sub + 4);
        }
        if (type === 1) {
          const format = r.u16(sub);
          const cov = coverage(r, sub + r.u16(sub + 2));
          if (format === 1) {
            const delta = r.i16(sub + 4);
            for (const g of cov) add(g, (g + delta) & 0xffff);
          } else if (format === 2) {
            const n = r.u16(sub + 4);
            cov.forEach((g, i) => i < n && add(g, r.u16(sub + 6 + i * 2)));
          }
        } else if (type === 3) {
          const cov = coverage(r, sub + r.u16(sub + 2));
          const n = r.u16(sub + 4);
          cov.forEach((g, i) => {
            if (i >= n) return;
            const set = sub + r.u16(sub + 6 + i * 2);
            const count = r.u16(set);
            for (let k = 0; k < count; k++) add(g, r.u16(set + 2 + k * 2));
          });
        }
      }
    }
  } catch {
    // A malformed table yields whatever was read before the error.
  }
  return edges;
}

const altCache = new WeakMap<LoadedFont, Map<number, Set<number>>>();

function edgesFor(lf: LoadedFont): Map<number, Set<number>> {
  let e = altCache.get(lf);
  if (!e) altCache.set(lf, (e = readAlternateEdges(lf.data)));
  return e;
}

/**
 * Alternate glyphs for `gid`: what it can be replaced with, what can be replaced with it,
 * and the other alternates of those sources. Mark glyphs only pair with marks.
 */
export function glyphAlternates(lf: LoadedFont, gid: number): number[] {
  const edges = edgesFor(lf);
  const out = new Set<number>();
  const sources = new Set<number>();
  for (const t of edges.get(gid) ?? []) out.add(t);
  for (const [from, tos] of edges) if (tos.has(gid)) sources.add(from);
  for (const s of sources) {
    out.add(s);
    for (const t of edges.get(s) ?? []) out.add(t);
  }
  out.delete(gid);
  const isMark = lf.face.getGlyphClass(gid) === 3;
  return [...out]
    .filter((g) => (lf.face.getGlyphClass(g) === 3) === isMark && lf.font.glyphToJson(g).length > 0)
    .sort((a, b) => a - b)
    .slice(0, MAX_ALTERNATES);
}

/**
 * Glyph id for a stored alternate name. Fonts without glyph names report "gidNNN", which
 * HarfBuzz does not parse back, so that form is read here.
 */
export function glyphByName(lf: LoadedFont, name: string): number | undefined {
  const m = /^gid(\d{1,5})$/.exec(name);
  if (m) {
    const gid = Number(m[1]);
    return lf.font.glyphToJson(gid).length ? gid : undefined;
  }
  return lf.font.glyphFromName(name);
}
