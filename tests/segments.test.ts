import { beforeAll, describe, expect, it } from 'vitest';
import { segmentOf } from '../src/engine/arabic';
import type { LoadedFont } from '../src/engine/fonts';
import { glyphAlternates } from '../src/engine/gsub';
import { computeTextGeometry } from '../src/engine/layout';
import { stretchCut } from '../src/engine/stretch';
import { letterVariants, segmentGlyphs, segmentStretchKey, segmentVariants } from '../src/engine/variants';
import { createText, defaultGlyphOverride } from '../src/model/defaults';
import { rotateInGroup, scaleInGroup } from '../src/model/glyphGroup';
import { applyTextEdit } from '../src/model/textEdit';
import { loadTestFont } from './helpers';

describe('connected segments', () => {
  it('splits words at letters that do not join the next one', () => {
    // محمد: one segment; رسول: ر | سو | ل ; الله: ا | لله
    const text = 'محمد رسول الله';
    const seg = segmentOf(text);
    expect(new Set(Array.from(seg.slice(0, 4))).size).toBe(1);
    expect(seg[4]).toBe(-1);
    expect([seg[5], seg[6], seg[7], seg[8]]).toEqual([5, 6, 6, 8]);
    expect([seg[10], seg[11], seg[12], seg[13]]).toEqual([10, 11, 11, 11]);
  });

  it('keeps diacritics in the segment of their letter', () => {
    const text = 'بَسْمِ';
    const seg = segmentOf(text);
    expect(new Set(Array.from(seg))).toEqual(new Set([0]));
  });
});

describe('alternates, variants and lengthening', () => {
  let amiri: LoadedFont;
  let thuluth: LoadedFont;
  beforeAll(async () => {
    amiri = await loadTestFont('amiri');
    thuluth = await loadTestFont('layla-thuluth');
  });

  it('loads the Thuluth font and shapes joined Arabic with it', () => {
    const geo = computeTextGeometry(createText({ text: 'بسم الله', fontId: 'layla-thuluth' }), thuluth);
    expect(geo.glyphs.length).toBeGreaterThanOrEqual(4);
    expect(geo.width).toBeGreaterThan(5);
    // The font's «الله» ligature has no outline; the word is drawn from its letters instead.
    const allah = computeTextGeometry(createText({ text: 'الحمد لله', fontId: 'layla-thuluth' }), thuluth);
    expect(allah.glyphs.filter((g) => !g.mark && g.d.length > 0).length).toBeGreaterThanOrEqual(8);
  });

  it('reads alternate glyphs from the GSUB table', () => {
    const beh = amiri.font.glyph('ب'.codePointAt(0)!)!;
    const alts = glyphAlternates(amiri, beh);
    expect(alts.length).toBeGreaterThan(0);
    expect(alts).not.toContain(beh);
  });

  it('assigns every glyph of a line to its segment', () => {
    const geo = computeTextGeometry(createText({ text: 'محمد رسول' }), amiri);
    const segs = new Set(geo.glyphs.map((g) => g.seg));
    expect(segs).toEqual(new Set([0, 5, 6, 8]));
  });

  it('offers segment variants whose previews differ, and applies a feature variant to that segment only', () => {
    const o = createText({ text: 'بسم الله الرحمن الرحيم' });
    const list = segmentVariants(o, amiri, 0);
    expect(list.length).toBeGreaterThan(1);
    expect(list[0].choice.kind).toBe('original');
    expect(list[0].current).toBe(true);
    const sigs = new Set(list.map((v) => v.d));
    expect(sigs.size).toBe(list.length);
    const feature = list.find((v) => v.choice.kind === 'features');
    if (feature && feature.choice.kind === 'features') {
      const base = computeTextGeometry(o, amiri);
      const changed = computeTextGeometry({ ...o, segVariants: { '0': feature.choice.features } }, amiri);
      const others = (g: typeof base) => g.glyphs.filter((x) => x.seg !== 0).map((x) => x.drawnGid);
      expect(others(changed)).toEqual(others(base));
    }
  });

  it('swaps one letter for an alternate by glyph name', () => {
    const o = createText({ text: 'بسم' });
    const list = letterVariants(o, amiri, computeTextGeometry(o, amiri).glyphs.find((g) => !g.mark)!.key);
    const alt = list.find((v) => v.choice.kind === 'glyph' && v.choice.name);
    expect(alt).toBeDefined();
    const choice = alt?.choice;
    if (choice?.kind !== 'glyph' || !choice.name) return;
    const geo = computeTextGeometry({ ...o, glyphs: { [choice.key]: { ...defaultGlyphOverride(), alt: choice.name } } }, amiri);
    const g = geo.glyphs.find((x) => x.key === choice.key)!;
    expect(amiri.font.glyphName(g.drawnGid)).toBe(choice.name);
    expect(g.drawnGid).not.toBe(g.gid);
  });

  it('finds a stretch point on joined letters but not on alef', () => {
    const geo = computeTextGeometry(createText({ text: 'بسم ا' }), amiri);
    const seen = geo.glyphs.find((g) => g.origin === 1 && !g.mark)!;
    expect(seen.stretchable).toBe(true);
    const alef = amiri.font.glyph('ا'.codePointAt(0)!)!;
    expect(stretchCut(amiri, alef, false)).toBeNull();
  });

  it('lengthens a letter: the line grows by the stretch and the stroke has no gap', () => {
    const o = createText({ text: 'بسم', size: 20 });
    const geo = computeTextGeometry(o, amiri);
    const key = segmentStretchKey(o, geo, 0)!;
    expect(key).toBeTruthy();
    // The classic place: after seen.
    expect(o.text[geo.glyphs.find((g) => g.key === key)!.origin]).toBe('س');
    const long = computeTextGeometry({ ...o, glyphs: { [key]: { ...defaultGlyphOverride(), stretch: 1 } } }, amiri);
    expect(long.width - geo.width).toBeCloseTo(20, 3);
    const a = geo.glyphs.find((g) => g.key === key)!;
    const b = long.glyphs.find((g) => g.key === key)!;
    expect(b.bbox.maxX - b.bbox.minX).toBeCloseTo(a.bbox.maxX - a.bbox.minX + 20, 1);
    expect(segmentGlyphs(long, 0).length).toBe(segmentGlyphs(geo, 0).length);
  });

  it('works on Thuluth too', () => {
    const o = createText({ text: 'كتب', fontId: 'layla-thuluth', size: 20 });
    const geo = computeTextGeometry(o, thuluth);
    expect(geo.glyphs.some((g) => g.stretchable)).toBe(true);
  });
});

describe('editing a segment as one piece', () => {
  it('rotates glyph centres about the group centre', () => {
    const c = { x: 10, y: 0 };
    const out = rotateInGroup(defaultGlyphOverride(), c, { x: 0, y: 0 }, 90);
    expect(c.x + out.dx).toBeCloseTo(0, 6);
    expect(c.y + out.dy).toBeCloseTo(10, 6);
    expect(out.rotate).toBe(90);
  });

  it('scales glyph centres away from the group centre', () => {
    const c = { x: 4, y: -2 };
    const out = scaleInGroup(defaultGlyphOverride(), c, { x: 0, y: 0 }, 2);
    expect(c.x + out.dx).toBeCloseTo(8, 6);
    expect(c.y + out.dy).toBeCloseTo(-4, 6);
    expect(out.scale).toBe(2);
  });

  it('keeps segment variants on the same letters when the text is edited', () => {
    const o = createText({ text: 'بسم الله', segVariants: { '4': ['ss01'] } });
    applyTextEdit(o, 'و بسم الله');
    expect(o.segVariants).toEqual({ '6': ['ss01'] });
  });
});
