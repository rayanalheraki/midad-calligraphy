import { describe, expect, it } from 'vitest';
import { sampleStroke, sweepQuads, type Vec } from '../src/engine/nib';
import { layoutStrokeLine } from '../src/engine/strokeLetters';
import { createDoc, createStrokes } from '../src/model/defaults';
import { validateDoc } from '../src/model/validate';

const nib = { width: 100, angle: 65 };
const area = (q: Vec[]) => q.reduce((a, p, i) => a + p[0] * q[(i + 1) % q.length][1] - q[(i + 1) % q.length][0] * p[1], 0) / 2;

describe('nib strokes', () => {
  it('passes through its points', () => {
    const s = sampleStroke({ pts: [[0, 0], [100, 50], [200, 0]] });
    expect(s[0].p).toEqual([0, 0]);
    expect(s[s.length - 1].p).toEqual([200, 0]);
    expect(s.some((x) => Math.abs(x.p[0] - 100) < 1e-9 && Math.abs(x.p[1] - 50) < 1e-9)).toBe(true);
  });

  it('winds every swept quadrilateral the same way, also where the line turns against the nib', () => {
    const quads = sweepQuads({ pts: [[0, 0], [300, 300], [600, 0], [300, -300], [0, 0]] }, nib);
    expect(quads.length).toBeGreaterThan(40);
    for (const q of quads) expect(area(q)).toBeGreaterThanOrEqual(-1e-9);
  });

  it('is thick across the nib and thin along it', () => {
    const across = sweepQuads({ pts: [[0, 0], [1000, 0]] }, { width: 100, angle: 90 });
    const along = sweepQuads({ pts: [[0, 0], [1000, 0]] }, { width: 100, angle: 0 });
    const total = (qs: Vec[][]) => qs.reduce((a, q) => a + area(q), 0);
    expect(total(across)).toBeCloseTo(100 * 1000, 0);
    expect(total(along)).toBeCloseTo(0, 6);
  });

  it('draws a dot as one nib-sized square', () => {
    const q = sweepQuads({ pts: [[0, 0]] }, nib);
    expect(q).toHaveLength(1);
    expect(area(q[0])).toBeCloseTo(100 * 90, 3);
  });
});

describe('a line of pen letters', () => {
  const base = { size: 10, nib, madd: {}, kashida: {} };

  it('picks the joining form of each letter', () => {
    const line = layoutStrokeLine({ ...base, text: 'نبيل' });
    expect(line.letters.map((l) => l.form)).toEqual(['init', 'medi', 'medi', 'fina']);
    expect(line.letters.map((l) => l.joinsNext)).toEqual([true, true, true, false]);
  });

  it('breaks the join after letters that only join from the right', () => {
    const line = layoutStrokeLine({ ...base, text: 'دلد' });
    expect(line.letters.map((l) => l.form)).toEqual(['isol', 'init', 'fina']);
  });

  it('lengthens a letter by its morph range and keeps the pen width', () => {
    const plain = layoutStrokeLine({ ...base, text: 'بل' });
    const long = layoutStrokeLine({ ...base, text: 'بل', madd: { '1': 1 } });
    // Lam's range is 500 units; 10 mm per 1000 units.
    expect(long.width - plain.width).toBeCloseTo(5, 6);
    expect(long.box.maxY - long.box.minY).toBeCloseTo(plain.box.maxY - plain.box.minY, 1);
  });

  it('adds a connector stroke of the chosen length after a joined letter', () => {
    const plain = layoutStrokeLine({ ...base, text: 'بل' });
    const k = layoutStrokeLine({ ...base, text: 'بل', kashida: { '0': 1.5 } });
    expect(k.connectors).toHaveLength(1);
    expect(k.width - plain.width).toBeCloseTo(15, 6);
    // No connector where the letters do not join.
    expect(layoutStrokeLine({ ...base, text: 'دل', kashida: { '0': 1 } }).connectors).toHaveLength(0);
  });

  it('reports letters it cannot draw yet', () => {
    const line = layoutStrokeLine({ ...base, text: 'بسم' });
    expect(line.unsupported).toEqual(['س', 'م']);
    expect(line.letters).toHaveLength(1);
  });
});

describe('pen line documents', () => {
  it('validates and clamps a pen line', () => {
    const doc = createDoc();
    const raw = JSON.parse(JSON.stringify(doc));
    raw.pages[0].objects.push({ ...createStrokes(), nibWidth: 9, madd: { '0': 5, x: 1 }, kashida: { '2': -1 } });
    const o = validateDoc(raw).doc.pages[0].objects[0];
    if (o.type !== 'strokes') throw new Error('expected a pen line');
    expect(o.nibWidth).toBe(0.4);
    expect(o.madd).toEqual({ '0': 1 });
    expect(o.kashida).toEqual({ '2': 0 });
  });
});
