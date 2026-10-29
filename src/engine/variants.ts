// Alternates of a selected segment or letter, as the list shown next to the selection:
// each entry is a ready preview of the segment drawn with that choice applied.
import type { GlyphOverride, TextObject } from '../model/types';
import { defaultGlyphOverride } from '../model/defaults';
import type { LoadedFont } from './fonts';
import { emptyRect, unionRect, type Rect } from './geom';
import { glyphAlternates } from './gsub';
import { computeTextGeometry, type PlacedGlyph, type TextGeometry } from './layout';

export type VariantChoice =
  | { kind: 'original' }
  | { kind: 'features'; features: string[] }
  | { kind: 'glyph'; key: string; name: string | null };

export interface Variant {
  id: string;
  choice: VariantChoice;
  /** path of the segment's glyphs in the line's local coordinates */
  d: string;
  box: Rect;
  current: boolean;
}

const MAX_VARIANTS = 40;
const PER_GLYPH = 8;
/** Features worth trying on a segment, on top of the font's stylistic sets. */
const TOGGLES = ['-liga', 'dlig', '-calt', '-clig', 'swsh', 'cswh'];
const INDEXED = ['salt', 'aalt'];

export function segmentGlyphs(geo: TextGeometry, seg: number): PlacedGlyph[] {
  return geo.glyphs.filter((g) => g.seg === seg);
}

function preview(geo: TextGeometry, seg: number) {
  const gs = segmentGlyphs(geo, seg).filter((g) => !g.hidden);
  const box = gs.reduce((acc, g) => unionRect(acc, g.bbox), emptyRect());
  return { d: gs.map((g) => g.d).join(''), box, sig: gs.map((g) => g.drawnGid).join(',') };
}

function withAlt(glyphs: Record<string, GlyphOverride>, key: string, name: string | null): Record<string, GlyphOverride> {
  return { ...glyphs, [key]: { ...(glyphs[key] ?? defaultGlyphOverride()), alt: name } };
}

/** Line with the segment's variant and letter alternates removed. */
export function clearSegmentChoices(obj: TextObject, keys: readonly string[], seg: number): Pick<TextObject, 'segVariants' | 'glyphs'> {
  const segVariants = { ...obj.segVariants };
  delete segVariants[String(seg)];
  const glyphs = { ...obj.glyphs };
  for (const k of keys) if (glyphs[k]?.alt) glyphs[k] = { ...glyphs[k], alt: null };
  return { segVariants, glyphs };
}

function featureCandidates(lf: LoadedFont, obj: TextObject): string[][] {
  const tags = new Set(lf.face.getTableFeatureTags('GSUB'));
  const out: string[][] = [];
  for (const f of lf.optionalFeatures) if (!obj.features.includes(f) && !INDEXED.includes(f)) out.push([f]);
  for (const t of INDEXED) if (tags.has(t)) for (let v = 1; v <= 6; v++) out.push([`${t}=${v}`]);
  for (const t of TOGGLES) if (tags.has(t.replace('-', '')) && !lf.optionalFeatures.includes(t)) out.push([t]);
  return out;
}

/**
 * Alternates for a connected segment: the font's stylistic variants applied to the segment,
 * then each letter replaced by one of its alternate forms.
 */
export function segmentVariants(obj: TextObject, lf: LoadedFont, seg: number): Variant[] {
  const current = computeTextGeometry(obj, lf);
  const keys = segmentGlyphs(current, seg).map((g) => g.key);
  const currentSig = preview(current, seg).sig;
  const plain = { ...obj, ...clearSegmentChoices(obj, keys, seg) };
  const seen = new Set<string>();
  const out: Variant[] = [];
  const push = (id: string, choice: VariantChoice, o: TextObject) => {
    const geo = computeTextGeometry(o, lf);
    const p = preview(geo, seg);
    if (!p.d || seen.has(p.sig) || out.length >= MAX_VARIANTS) return;
    seen.add(p.sig);
    out.push({ id, choice, d: p.d, box: p.box, current: p.sig === currentSig });
  };

  push('original', { kind: 'original' }, plain);
  for (const features of featureCandidates(lf, obj)) {
    push('f:' + features.join(','), { kind: 'features', features }, { ...plain, segVariants: { ...plain.segVariants, [String(seg)]: features } });
  }
  for (const g of segmentGlyphs(current, seg)) {
    if (g.mark) continue;
    for (const alt of glyphAlternates(lf, g.gid).slice(0, PER_GLYPH)) {
      const name = lf.font.glyphName(alt);
      push(`g:${g.key}:${name}`, { kind: 'glyph', key: g.key, name }, { ...obj, glyphs: withAlt(obj.glyphs, g.key, name) });
    }
  }
  return out;
}

/** Alternates for one letter (or mark), each previewed within its segment. */
export function letterVariants(obj: TextObject, lf: LoadedFont, key: string): Variant[] {
  const current = computeTextGeometry(obj, lf);
  const g = current.glyphs.find((x) => x.key === key);
  if (!g) return [];
  const seg = g.seg;
  const glyphOnly = (geo: TextGeometry) => {
    if (seg >= 0) return preview(geo, seg);
    const one = geo.glyphs.find((x) => x.key === key);
    return { d: one?.d ?? '', box: one?.bbox ?? emptyRect(), sig: String(one?.drawnGid ?? '') };
  };
  const currentSig = glyphOnly(current).sig;
  const out: Variant[] = [];
  const seen = new Set<string>();
  const push = (id: string, choice: VariantChoice, o: TextObject) => {
    const p = glyphOnly(computeTextGeometry(o, lf));
    if (!p.d || seen.has(p.sig) || out.length >= MAX_VARIANTS) return;
    seen.add(p.sig);
    out.push({ id, choice, d: p.d, box: p.box, current: p.sig === currentSig });
  };
  push('original', { kind: 'glyph', key, name: null }, { ...obj, glyphs: withAlt(obj.glyphs, key, null) });
  for (const alt of glyphAlternates(lf, g.gid)) {
    const name = lf.font.glyphName(alt);
    push(`g:${key}:${name}`, { kind: 'glyph', key, name }, { ...obj, glyphs: withAlt(obj.glyphs, key, name) });
  }
  return out;
}

const SEEN_SAD = new Set([0x0633, 0x0634, 0x0635, 0x0636]);
const KAF = new Set([0x0643, 0x06a9, 0x06af]);
const BEH = new Set([0x0628, 0x062a, 0x062b, 0x0646, 0x064a, 0x0626, 0x06cc, 0x067e, 0x0649, 0x0641, 0x0642]);
/** Final letters whose tail is traditionally drawn out: ن ي ى ئ ق س ش ص ض ل ب ت ث ف ك */
const LONG_TAILS = new Set([0x0646, 0x064a, 0x0649, 0x0626, 0x0642, 0x0633, 0x0634, 0x0635, 0x0636, 0x0644, 0x0628, 0x062a, 0x062b, 0x0641, 0x0643, 0x06cc]);

function stretchPriority(text: string, g: PlacedGlyph): number {
  if (g.kashida) return 7;
  const cp = text.codePointAt(g.origin) ?? 0;
  if (g.joinsLeft) return SEEN_SAD.has(cp) ? 6 : KAF.has(cp) ? 4 : BEH.has(cp) ? 2 : 1;
  return LONG_TAILS.has(cp) ? 5 : 0;
}

/**
 * The letter that lengthens a segment: one already lengthened, else the traditional place
 * for a kashida (after seen/sad, kaf, beh-like letters) or a long final tail.
 */
export function segmentStretchKey(obj: TextObject, geo: TextGeometry, seg: number): string | null {
  const cands = segmentGlyphs(geo, seg).filter((g) => g.stretchable && !g.mark);
  if (!cands.length) return null;
  const done = cands.find((g) => (obj.glyphs[g.key]?.stretch ?? 0) > 0);
  if (done) return done.key;
  let best = cands[0];
  let bestP = -1;
  // Glyphs run left to right; on ties the later letter of the word wins.
  for (const g of cands) {
    const p = stretchPriority(obj.text, g);
    if (p > bestP) {
      best = g;
      bestP = p;
    }
  }
  return bestP > 0 ? best.key : null;
}
