import { beforeAll, describe, expect, it } from 'vitest';
import { segmentOf } from '../src/engine/arabic';
import type { LoadedFont } from '../src/engine/fonts';
import { glyphAlternates } from '../src/engine/gsub';
import { computeTextGeometry } from '../src/engine/layout';
import { glyphOutline } from '../src/engine/shape';
import { dipsByDefault, outlineSpans, stretchDip, stretchOutline, stretchX, stretchZone } from '../src/engine/stretch';
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
  let diwani: LoadedFont;
  let reemKufi: LoadedFont;
  beforeAll(async () => {
    amiri = await loadTestFont('amiri');
    thuluth = await loadTestFont('am-thulth');
    diwani = await loadTestFont('layla-diwani');
    reemKufi = await loadTestFont('reem-kufi');
  });

  it('loads the Thuluth font and shapes joined Arabic with it', () => {
    const geo = computeTextGeometry(createText({ text: 'بسم الله', fontId: 'am-thulth' }), thuluth);
    expect(geo.glyphs.length).toBeGreaterThanOrEqual(4);
    expect(geo.width).toBeGreaterThan(5);
    // Layla Diwani's «الله» ligature has no outline; the word is drawn from its letters instead.
    const allah = computeTextGeometry(createText({ text: 'الحمد لله', fontId: 'layla-diwani' }), diwani);
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
    expect(stretchZone(amiri, alef, false)).toBeNull();
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

  it('draws the stroke out smoothly, keeping its thickness: no wedge, hairline or kink', () => {
    for (const [lf, text, seg] of [
      [amiri, 'كتب', 0],
      [amiri, 'محمد', 0],
      [amiri, 'بسم', 0],
      [thuluth, 'كتب', 0],
      [thuluth, 'بسم', 0],
      [thuluth, 'الحركي', 4],
    ] as const) {
      const o = createText({ text, fontId: lf.def.id });
      const geo = computeTextGeometry(o, lf);
      const g = geo.glyphs.find((x) => x.key === segmentStretchKey(o, geo, seg))!;
      const zone = stretchZone(lf, g.drawnGid, g.joinsLeft || g.kashida)!;
      const { cmds } = glyphOutline(lf, g.drawnGid);
      const em = lf.upem;
      const delta = em * 3;
      const long = stretchOutline(cmds, zone, delta, em, 1);
      // Where a point of the lengthened stroke came from.
      const source = (x: number) => {
        let a = zone.from - 1;
        let b = zone.to + 1;
        for (let k = 0; k < 50; k++) {
          const m = (a + b) / 2;
          if (stretchX(zone, delta, m) < x) a = m;
          else b = m;
        }
        return (a + b) / 2;
      };
      // The stroke is the span nearest the given height; dots may sit above or below it.
      const near = (spans: [number, number][], y: number) => spans.reduce((a, b) => (Math.abs((b[0] + b[1]) / 2 - y) < Math.abs((a[0] + a[1]) / 2 - y) ? b : a));
      let prev: [number, number] | null = null;
      const x0 = stretchX(zone, delta, zone.from);
      const x1 = stretchX(zone, delta, zone.to);
      for (let x = x0 + 1; x < x1; x += (x1 - x0) / 60) {
        const sx = source(x);
        const spans0 = outlineSpans(cmds, sx);
        if (!spans0.length) continue;
        const before = near(spans0, prev ? (prev[0] + prev[1]) / 2 + stretchDip(zone, delta, sx, em, 1) : 0);
        const after = near(outlineSpans(long, x), (before[0] + before[1]) / 2 - stretchDip(zone, delta, sx, em, 1));
        // Same thickness as the column it came from, and only moved down by the dip.
        expect(Math.abs(after[1] - after[0] - (before[1] - before[0]))).toBeLessThan(em * 0.01);
        expect(Math.abs(after[0] - (before[0] - stretchDip(zone, delta, sx, em, 1)))).toBeLessThan(em * 0.01);
        // No jumps between neighbouring columns.
        if (prev) expect(Math.abs(after[0] - prev[0])).toBeLessThan(em * 0.05);
        prev = after;
      }
    }
  });

  it('spreads the lengthening smoothly over a whole bowl: one peak, no ripples', () => {
    for (const [lf, text] of [
      [thuluth, 'ن'],
      [thuluth, 'في'],
      [thuluth, 'بسم'],
      [amiri, 'ن'],
      [amiri, 'كتب'],
    ] as const) {
      const o = createText({ text, fontId: lf.def.id });
      const geo = computeTextGeometry(o, lf);
      const g = geo.glyphs.find((x) => x.key === segmentStretchKey(o, geo, 0))!;
      const z = stretchZone(lf, g.drawnGid, g.joinsLeft || g.kashida)!;
      // Every bump in the density would show as a ripple in the drawn-out stroke.
      let peaks = 0;
      for (let i = 1; i < z.rho.length - 1; i++) if (z.rho[i] > z.rho[i - 1] && z.rho[i] >= z.rho[i + 1]) peaks++;
      expect(peaks).toBe(1);
    }
    // A noon widens as a whole bowl, not by a flat strip set between two round sides.
    const noon = createText({ text: 'ن', fontId: 'am-thulth' });
    const g = computeTextGeometry(noon, thuluth).glyphs.find((x) => x.stretchable)!;
    const z = stretchZone(thuluth, g.drawnGid, false)!;
    const box = glyphOutline(thuluth, g.drawnGid).box!;
    expect(z.to - z.from).toBeGreaterThan((box.maxX - box.minX) * 0.5);
  });

  it('dips a long madd in cursive styles but keeps Kufi straight', () => {
    expect(dipsByDefault(thuluth)).toBe(true);
    expect(dipsByDefault(amiri)).toBe(true);
    expect(dipsByDefault(reemKufi)).toBe(false);
    const o = createText({ text: 'الحركي', fontId: 'am-thulth' });
    const geo = computeTextGeometry(o, thuluth);
    const g = geo.glyphs.find((x) => x.key === segmentStretchKey(o, geo, 4))!;
    const z = stretchZone(thuluth, g.drawnGid, false)!;
    const em = thuluth.upem;
    const deepest = (dip: number) => {
      let d = 0;
      for (let x = z.from; x <= z.to; x += 4) d = Math.max(d, stretchDip(z, em * 3, x, em, dip));
      return d;
    };
    expect(deepest(1)).toBeGreaterThan(em * 0.05);
    expect(deepest(2)).toBeCloseTo(deepest(1) * 2, 6);
    expect(deepest(0)).toBe(0);
    expect(stretchDip(z, em * 3, z.from, em, 1)).toBe(0);
    expect(stretchDip(z, em * 3, z.to, em, 1)).toBe(0);
  });

  it('lets the user set the depth of the dip per letter, the style default when unset', () => {
    const o = createText({ text: 'الحركي', fontId: 'am-thulth', size: 20 });
    const key = segmentStretchKey(o, computeTextGeometry(o, thuluth), 4)!;
    const bottom = (dip: number | null, font = thuluth, obj = o, k = key) => {
      const geo = computeTextGeometry({ ...obj, glyphs: { [k]: { ...defaultGlyphOverride(), stretch: 3, dip } } }, font);
      return geo.glyphs.find((g) => g.key === k)!.bbox.maxY;
    };
    // Unset is the standard dip of a cursive style; 0 is straight, larger is deeper.
    expect(bottom(null)).toBeCloseTo(bottom(100), 6);
    expect(bottom(0)).toBeLessThan(bottom(100));
    expect(bottom(300)).toBeGreaterThan(bottom(100));
    // Kufi is straight unless the user asks for a dip.
    const k = createText({ text: 'في', fontId: 'reem-kufi', size: 20 });
    const kk = segmentStretchKey(k, computeTextGeometry(k, reemKufi), 0)!;
    expect(bottom(null, reemKufi, k, kk)).toBeCloseTo(bottom(0, reemKufi, k, kk), 6);
    expect(bottom(100, reemKufi, k, kk)).toBeGreaterThan(bottom(0, reemKufi, k, kk));
  });

  it('does not lengthen a base that tapers to a point; the madd goes to the joining letter', () => {
    // Reem Kufi's final yeh has no tail, only a wedge: stretching it would draw a long wedge.
    const o = createText({ text: 'في', fontId: 'reem-kufi' });
    const geo = computeTextGeometry(o, reemKufi);
    const yeh = geo.glyphs.find((g) => !g.mark && o.text[g.origin] === 'ي')!;
    expect(yeh.stretchable).toBe(false);
    const key = segmentStretchKey(o, geo, 0)!;
    expect(o.text[geo.glyphs.find((g) => g.key === key)!.origin]).toBe('ف');
  });

  it('moves dots whole even when a pair is drawn as one contour', () => {
    // Amiri draws the two dots of final yeh as one contour wider than a single dot.
    const o = createText({ text: 'في' });
    const geo = computeTextGeometry(o, amiri);
    const key = segmentStretchKey(o, geo, 0)!;
    const g = geo.glyphs.find((x) => x.key === key)!;
    const zone = stretchZone(amiri, g.drawnGid, g.joinsLeft || g.kashida)!;
    const { cmds } = glyphOutline(amiri, g.drawnGid);
    const long = stretchOutline(cmds, zone, 3000, amiri.upem, 1);
    const width = (c: { values: number[] }[]) => {
      const xs = c.flatMap((k) => k.values.filter((_, i) => i % 2 === 0));
      return Math.max(...xs) - Math.min(...xs);
    };
    const contours = (cs: typeof cmds) => cs.reduce<(typeof cmds)[]>((acc, c) => (c.type === 'M' ? [...acc, [c]] : (acc[acc.length - 1].push(c), acc)), []);
    const a = contours(cmds);
    const b = contours(long);
    expect(b.length).toBe(a.length);
    for (let i = 1; i < a.length; i++) expect(width(b[i])).toBeCloseTo(width(a[i]), 3);
  });

  it('works on Thuluth too', () => {
    const o = createText({ text: 'كتب', fontId: 'am-thulth', size: 20 });
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
