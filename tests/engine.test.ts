import { beforeAll, describe, expect, it } from 'vitest';
import { insertKashida, joiningType, kashidaCounts, kashidaSlots } from '../src/engine/arabic';
import type { LoadedFont } from '../src/engine/fonts';
import { computeTextGeometry } from '../src/engine/layout';
import { markGeometry } from '../src/engine/marks';
import { shapeText } from '../src/engine/shape';
import { createMark, createText, defaultGlyphOverride } from '../src/model/defaults';
import { ELEMENTS, findElement, markFromElement } from '../src/model/elements';
import { loadTestFont } from './helpers';

describe('Arabic joining and kashida', () => {
  it('classifies joining types', () => {
    expect(joiningType('ب'.codePointAt(0)!)).toBe('D');
    expect(joiningType('ا'.codePointAt(0)!)).toBe('R');
    expect(joiningType('ء'.codePointAt(0)!)).toBe('U');
    expect(joiningType('َ'.codePointAt(0)!)).toBe('T');
    expect(joiningType('ـ'.codePointAt(0)!)).toBe('C');
  });

  it('prefers the classic positions: after seen and before final noon/meem', () => {
    const text = 'بسم الله الرحمن الرحيم';
    const slots = kashidaSlots(text);
    const sin = text.indexOf('س');
    expect(slots.find((s) => s.letter === sin)?.priority).toBe(6);
    // No slot may separate lam from alef (lam-alef ligature).
    const lamAlef = 'لا';
    expect(kashidaSlots(lamAlef)).toHaveLength(0);
    const counts = kashidaCounts(text, 2, {});
    const out = insertKashida(text, counts).text;
    expect(out).toContain('بسـ');
    // «الله» is never stretched, so three of the four words get two tatweels each.
    expect(out.length).toBe(text.length + 2 * 3);
    expect(out).toContain(" الله ");
  });

  it('keeps diacritics attached to their letter', () => {
    const text = 'بِسْمِ';
    const counts = kashidaCounts(text, 1, {});
    const out = insertKashida(text, counts).text;
    expect(out).toBe('بِسْـمِ');
  });
});

describe('shaping and layout', () => {
  let amiri: LoadedFont;
  let nastaliq: LoadedFont;
  beforeAll(async () => {
    amiri = await loadTestFont('amiri');
    nastaliq = await loadTestFont('nastaliq');
  });

  it('shapes Arabic text with HarfBuzz', () => {
    const run = shapeText(amiri, 'بسم الله', []);
    expect(run.glyphs.length).toBeGreaterThan(4);
    expect(run.width).toBeGreaterThan(1000);
  });

  it('detects stylistic sets', () => {
    expect(amiri.optionalFeatures).toContain('ss01');
  });

  it('kashida makes the line wider', () => {
    const plain = computeTextGeometry(createText({ text: 'بسم الله الرحمن الرحيم' }), amiri);
    const long = computeTextGeometry(createText({ text: 'بسم الله الرحمن الرحيم', kashida: 3 }), amiri);
    expect(long.width).toBeGreaterThan(plain.width + 5);
  });

  it('justifies a line to a target width', () => {
    const geo = computeTextGeometry(createText({ text: 'بسم الله الرحمن الرحيم', justifyWidth: 200, size: 18 }), amiri);
    expect(Math.abs(geo.width - 200)).toBeLessThan(6);
  });

  it('does not add tatweel to Nastaliq', () => {
    const plain = computeTextGeometry(createText({ text: 'بسم الله', fontId: 'nastaliq' }), nastaliq);
    const withK = computeTextGeometry(createText({ text: 'بسم الله', fontId: 'nastaliq', kashida: 4 }), nastaliq);
    expect(withK.width).toBeCloseTo(plain.width, 5);
  });

  it('places text on an arc, repeats it and mirrors it', () => {
    const straight = computeTextGeometry(createText({ text: 'الله' }), amiri);
    const arc = computeTextGeometry(createText({ text: 'الله أكبر', path: { mode: 'arc', radius: 30, sweep: 300, amplitude: 0, wavelength: 50, flip: false } }), amiri);
    expect(arc.glyphs.length).toBeGreaterThan(3);
    const rep = computeTextGeometry(createText({ text: 'الله', repeat: { count: 8, angle: 45, offset: 20 } }), amiri);
    expect(rep.copies).toHaveLength(8);
    const mir = computeTextGeometry(createText({ text: 'الله', mirror: 'x', mirrorGap: 2 }), amiri);
    expect(mir.copies).toHaveLength(2);
    expect(mir.box.maxX - mir.box.minX).toBeGreaterThan(2 * (straight.box.maxX - straight.box.minX));
  });

  it('applies per-glyph overrides and keeps keys stable when kashida changes', () => {
    const base = createText({ text: 'بسم' });
    const g0 = computeTextGeometry(base, amiri);
    const key = g0.glyphs[0].key;
    const moved = computeTextGeometry({ ...base, glyphs: { [key]: { ...defaultGlyphOverride(), dx: 5, dy: -3, color: '#ff0000' } } }, amiri);
    const a = g0.glyphs.find((g) => g.key === key)!;
    const b = moved.glyphs.find((g) => g.key === key)!;
    expect(b.center.x - a.center.x).toBeCloseTo(5, 3);
    expect(b.center.y - a.center.y).toBeCloseTo(-3, 3);
    expect(b.color).toBe('#ff0000');
    const withK = computeTextGeometry({ ...base, kashida: 2 }, amiri);
    const letterKeys = (g: typeof g0) => g.glyphs.filter((x) => !x.kashida).map((x) => x.key).sort();
    expect(letterKeys(withK)).toEqual(letterKeys(g0));
  });
});

describe('standalone elements', () => {
  beforeAll(async () => {
    await loadTestFont('amiri');
    await loadTestFont('amiri-quran');
    await loadTestFont('scheherazade');
    await loadTestFont('reem-kufi');
  });

  it('draws a diacritic centred on its origin', () => {
    const fatha = markFromElement(findElement('fatha')!, { fontId: 'amiri', size: 20, fill: { kind: 'solid', color: '#000000' } }, null, 50, 50);
    const geo = markGeometry(fatha)!;
    expect(geo.d.length).toBeGreaterThan(10);
    expect(Math.abs((geo.box.minX + geo.box.maxX) / 2)).toBeLessThan(0.01);
    expect(Math.abs((geo.box.minY + geo.box.maxY) / 2)).toBeLessThan(0.01);
    expect(geo.box.maxX - geo.box.minX).toBeGreaterThan(1);
  });

  it('falls back to another font when the chosen one lacks the glyph', () => {
    const sajda = createMark({ element: 'sajda', shape: 'glyph', text: '۩', fontId: 'reem-kufi', size: 20 });
    const geo = markGeometry(sajda);
    expect(geo).not.toBeNull();
    expect(geo!.fontId).not.toBeNull();
  });

  it('draws pen dots as rhombi', () => {
    const three = createMark({ element: 'dot3', shape: 'dot3', text: '', size: 20 });
    const geo = markGeometry(three)!;
    expect(geo.d.match(/M/g)).toHaveLength(3);
    expect(geo.fontId).toBeNull();
  });

  it('can draw every element of the catalogue', () => {
    for (const def of ELEMENTS) {
      const o = markFromElement(def, { fontId: 'amiri', size: 18, fill: { kind: 'solid', color: '#000000' } }, null, 0, 0);
      expect(markGeometry(o), def.id).not.toBeNull();
    }
  });
});
