import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KlxError, parseKlxBag, readKlxDocument, vbColor } from '../src/io/klx';
import { decodeKlxString, encodeKlxBytes, unicodeToLegacy } from '../src/io/klxText';
import { klxFile } from './helpers';

const enc = (s: string) => encodeKlxBytes(unicodeToLegacy(s));

describe('KLX string decoding', () => {
  it('decodes the $*&! layout through the legacy code page', () => {
    // Real value taken from a KLX sample document.
    expect(decodeKlxString('$*&!bpcjcgphdnchchbhphdnchdiamcgcfphdnchdiambgcgph')).toBe('بسم الله الرحمن الرحيم ');
  });

  it('round-trips Arabic and Persian letters', () => {
    for (const s of ['الحمد لله رب العالمين', 'پرچم گچ ژاله', 'قلم']) {
      expect(decodeKlxString(enc(s))).toBe(s);
    }
  });

  it('treats a doubly encoded empty string as empty', () => {
    expect(decodeKlxString('$*&!ohnfofpg')).toBe('');
  });

  it('leaves plain strings untouched', () => {
    expect(decodeKlxString('plain')).toBe('plain');
  });
});

describe('KLX parser', () => {
  const sample = () =>
    klxFile([
      ['currentzoom', { long: -1 }],
      ['linecount0', { long: 1 }],
      ['pgwidth0', { long: 11906 }],
      ['pgheight0', { long: 16838 }],
      ['lfntstyle0_1', { byte: 2 }],
      ['lfntsize0_1', { long: 20 }],
      ['lfntcolor0_1', { long: 0x0000ff }],
      ['ltextstr0_1', { str: enc('بسم الله') }],
      ['lx0_1', { long: 1440 }],
      ['ly0_1', { long: 2880 }],
      ['lxx0_1', { long: 5760 }],
      ['lyy0_1', { long: 2880 }],
      ['ltextcount0_1', { long: 1 }],
      ['lrepeatcount0_1', { long: 6 }],
      ['lrepeatangle0_1', { single: 60 }],
      ['attrawstr0_1_1', { str: enc('بسم ') }],
      ['attx0_1_1', { long: 5700 }],
      ['atty0_1_1', { long: 2800 }],
      ['pagecount', { long: 1 }],
    ]);

  it('reads page size, lines and words', () => {
    const doc = readKlxDocument(sample());
    expect(doc.pages).toHaveLength(1);
    const p = doc.pages[0];
    expect(p.width).toBeCloseTo(210, 0);
    expect(p.height).toBeCloseTo(297, 0);
    expect(p.lines).toHaveLength(1);
    const l = p.lines[0];
    expect(l.text).toBe('بسم الله');
    expect(l.style).toBe(2);
    expect(l.color).toBe('#ff0000');
    expect(l.x1).toBeCloseTo(25.4, 1);
    expect(l.repeatCount).toBe(6);
    expect(l.repeatAngle).toBeCloseTo(60);
    expect(l.words[0].text).toBe('بسم');
  });

  it('reads nested page bags', () => {
    const doc = readKlxDocument(
      klxFile([
        ['pagecount', { long: 2 }],
        ['page1', { bag: [['linecount0', { long: 0 }], ['pgwidth0', { long: 5669 }]] }],
        ['page2', { bag: [['linecount0', { long: 0 }], ['pgwidth0', { long: 8504 }]] }],
      ]),
    );
    expect(doc.pages.map((p) => Math.round(p.width))).toEqual([100, 150]);
  });

  it('rejects files that are not KLX', () => {
    expect(() => parseKlxBag(new TextEncoder().encode('<html>not a klx file</html>').buffer)).toThrow(KlxError);
  });

  it('survives truncated and corrupted input without throwing unexpected errors', () => {
    const good = new Uint8Array(sample());
    for (let cut = 12; cut < good.length; cut += 37) {
      const slice = good.slice(0, cut).buffer;
      try {
        readKlxDocument(slice);
      } catch (e) {
        expect(e).toBeInstanceOf(KlxError);
      }
    }
    const noisy = good.slice();
    for (let i = 40; i < noisy.length; i += 13) noisy[i] ^= 0xff;
    try {
      readKlxDocument(noisy.buffer);
    } catch (e) {
      expect(e).toBeInstanceOf(KlxError);
    }
  });

  it('converts VB colours', () => {
    expect(vbColor(0x00ff8040)).toBe('#4080ff');
  });
});

// Optional check against real KLX sample documents, when they are available locally.
const SAMPLES = process.env.KLX_SAMPLES;
describe.runIf(!!SAMPLES && existsSync(SAMPLES))('real KLX samples', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.klx$/i.test(name)) files.push(p);
    }
  };
  if (SAMPLES && existsSync(SAMPLES)) walk(SAMPLES);

  it('parses every sample and decodes Arabic text', () => {
    let lines = 0;
    let arabic = 0;
    for (const f of files) {
      const buf = readFileSync(f);
      const doc = readKlxDocument(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      for (const p of doc.pages)
        for (const l of p.lines) {
          lines++;
          if (/[؀-ۿ]/.test(l.text)) arabic++;
        }
    }
    expect(files.length).toBeGreaterThan(50);
    expect(arabic / lines).toBeGreaterThan(0.8);
  });
});
