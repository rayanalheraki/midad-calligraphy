// Letters drawn as nib strokes, and the layout of a line of them. The shapes here are
// working placeholders for the prototype: each letter is a few centre-line strokes in
// units of 1000 per em (y up, baseline at 0), spanning x from 0 (where it leaves for the
// next letter, on the left) to its advance (where it is joined from the right).
// Replacing them with digitised calligraphy keeps the same structure.

import { joiningType } from './arabic';
import { dotGroup, quadsToPath, sweepQuads, type Nib, type NibStroke, type Vec } from './nib';
import { emptyRect, unionRect, type Rect } from './geom';

export type Form = 'isol' | 'init' | 'medi' | 'fina';

export interface StrokeGlyph {
  advance: number;
  strokes: NibStroke[];
  /** where the letter's dots go, above or below */
  dotsAt?: { below: Vec; above: Vec };
  /** lengthening (مدّ): points left of `cut` move left by up to `length` */
  madd?: { cut: number; length: number };
}

type Family = Partial<Record<Form, StrokeGlyph>>;

const BOWL_TAIL: Vec[] = [[200, -10], [70, 0], [25, 45], [15, 110]];

const FAMILIES: Record<string, Family> = {
  alef: {
    isol: { advance: 130, strokes: [{ pts: [[78, 720], [64, 380], [52, 30]], press: [0.8, 1, 0.9] }] },
    fina: { advance: 175, strokes: [{ pts: [[72, 720], [60, 380], [56, 70], [95, 8], [175, 0]], press: [0.8, 1, 1, 1, 1] }] },
  },
  beh: {
    init: { advance: 180, strokes: [{ pts: [[172, 185], [164, 60], [120, 8], [40, 0], [0, 0]] }], dotsAt: { below: [100, -150], above: [160, 345] } },
    medi: {
      advance: 200,
      strokes: [{ pts: [[200, 0], [100, 2], [0, 0]] }, { pts: [[104, 10], [112, 175]] }],
      dotsAt: { below: [100, -150], above: [110, 345] },
    },
    fina: {
      advance: 640,
      strokes: [{ pts: [[640, 0], [520, 4], [380, -8], ...BOWL_TAIL] }, { pts: [[548, 10], [556, 175]] }],
      dotsAt: { below: [330, -160], above: [330, 150] },
      madd: { cut: 300, length: 900 },
    },
    isol: {
      advance: 580,
      strokes: [{ pts: [[560, 12], [520, 4], [380, -8], ...BOWL_TAIL] }, { pts: [[552, 10], [560, 175]] }],
      dotsAt: { below: [320, -160], above: [320, 150] },
      madd: { cut: 300, length: 900 },
    },
  },
  noon: {
    isol: {
      advance: 330,
      strokes: [{ pts: [[305, 190], [292, 40], [250, -95], [160, -165], [60, -135], [15, -40], [15, 95]] }],
      dotsAt: { below: [160, -260], above: [165, 120] },
      madd: { cut: 170, length: 500 },
    },
    fina: {
      advance: 410,
      strokes: [{ pts: [[410, 0], [315, 12], [280, -60], [200, -150], [95, -160], [25, -80], [15, 70]] }],
      dotsAt: { below: [180, -260], above: [190, 130] },
      madd: { cut: 170, length: 500 },
    },
  },
  yeh: {
    isol: {
      advance: 470,
      strokes: [{ pts: [[455, 175], [400, 95], [300, 55], [215, 20], [215, -55], [150, -140], [45, -130], [0, -40]] }],
      dotsAt: { below: [190, -260], above: [190, 170] },
      madd: { cut: 230, length: 700 },
    },
    fina: {
      advance: 520,
      strokes: [{ pts: [[520, 0], [420, 15], [320, 50], [225, 25], [215, -55], [150, -140], [45, -130], [0, -40]] }],
      dotsAt: { below: [190, -260], above: [190, 170] },
      madd: { cut: 230, length: 700 },
    },
  },
  dal: {
    isol: { advance: 200, strokes: [{ pts: [[75, 330], [150, 170], [168, 50], [115, 6], [10, 0]], press: [0.7, 1, 1, 1, 1] }], dotsAt: { below: [110, -150], above: [95, 460] } },
    fina: {
      advance: 260,
      strokes: [{ pts: [[85, 330], [150, 170], [165, 50], [115, 6], [10, 0]], press: [0.7, 1, 1, 1, 1] }, { pts: [[260, 0], [168, 18]] }],
      dotsAt: { below: [110, -150], above: [100, 460] },
    },
  },
  reh: {
    isol: { advance: 180, strokes: [{ pts: [[150, 190], [160, 85], [140, -35], [60, -145], [-60, -205]], press: [0.7, 1, 1, 1, 0.8] }], dotsAt: { below: [60, -330], above: [150, 330] } },
    fina: { advance: 250, strokes: [{ pts: [[250, 0], [168, 28], [140, -35], [60, -145], [-60, -205]], press: [1, 1, 1, 1, 0.8] }], dotsAt: { below: [60, -330], above: [160, 220] } },
  },
  lam: {
    init: { advance: 150, strokes: [{ pts: [[142, 760], [130, 380], [116, 40], [70, 3], [0, 0]], press: [0.8, 1, 1, 1, 1] }] },
    medi: { advance: 190, strokes: [{ pts: [[190, 0], [95, 2], [0, 0]] }, { pts: [[96, 10], [106, 760]], press: [1, 0.8] }] },
    fina: {
      advance: 430,
      strokes: [{ pts: [[332, 760], [320, 380], [306, 40], [266, -110], [150, -170], [50, -120], [15, -20], [20, 90]], press: [0.8, 1, 1, 1, 1, 1, 1, 1] }, { pts: [[430, 0], [312, 14]] }],
      madd: { cut: 190, length: 500 },
    },
    isol: {
      advance: 345,
      strokes: [{ pts: [[332, 760], [320, 380], [306, 40], [266, -110], [150, -170], [50, -120], [15, -20], [20, 90]], press: [0.8, 1, 1, 1, 1, 1, 1, 1] }],
      madd: { cut: 190, length: 500 },
    },
  },
};

interface LetterDef {
  family: string;
  dots: 0 | 1 | 2 | 3;
  above: boolean;
}

const LETTERS: Record<string, LetterDef> = {
  'ا': { family: 'alef', dots: 0, above: false },
  'ب': { family: 'beh', dots: 1, above: false },
  'ت': { family: 'beh', dots: 2, above: true },
  'ث': { family: 'beh', dots: 3, above: true },
  'ن': { family: 'noon', dots: 1, above: true },
  'ي': { family: 'yeh', dots: 2, above: false },
  'ى': { family: 'yeh', dots: 0, above: false },
  'د': { family: 'dal', dots: 0, above: false },
  'ذ': { family: 'dal', dots: 1, above: true },
  'ر': { family: 'reh', dots: 0, above: false },
  'ز': { family: 'reh', dots: 1, above: true },
  'ل': { family: 'lam', dots: 0, above: false },
};

/** Letters the prototype can draw. */
export const SUPPORTED_LETTERS = Object.keys(LETTERS).join(' ');

/** Initial and medial forms of noon and yeh are those of beh. */
function glyphFor(def: LetterDef, form: Form): StrokeGlyph | undefined {
  const fam = FAMILIES[def.family];
  const own = fam[form];
  if (own) return own;
  if ((form === 'init' || form === 'medi') && (def.family === 'noon' || def.family === 'yeh')) return FAMILIES.beh[form];
  if (form === 'medi') return fam.fina ?? fam.isol;
  if (form === 'init') return fam.isol;
  return fam.isol;
}

const WORD_GAP = 300;

export interface StrokeLineInput {
  text: string;
  /** em size in mm */
  size: number;
  nib: Nib;
  /** lengthening per letter index (0..1 of the letter's range) */
  madd: Record<string, number>;
  /** connector length after a letter index, in ems */
  kashida: Record<string, number>;
}

export interface StrokeLetter {
  /** UTF-16 index in the text */
  index: number;
  char: string;
  form: Form;
  /** can be lengthened */
  maddable: boolean;
  /** joined to the next letter (a connector follows) */
  joinsNext: boolean;
  d: string;
  box: Rect;
}

export interface StrokeLine {
  letters: StrokeLetter[];
  /** connector strokes between letters */
  connectors: { after: number; d: string }[];
  /** centre lines and their through-points, for showing the skeleton */
  skeleton: Vec[][];
  d: string;
  box: Rect;
  width: number;
  unsupported: string[];
}

const cache = new WeakMap<object, StrokeLine>();

export function strokeLine(o: StrokeLineInput & object): StrokeLine {
  const hit = cache.get(o);
  if (hit) return hit;
  const line = layoutStrokeLine(o);
  cache.set(o, line);
  return line;
}

export function layoutStrokeLine(o: StrokeLineInput): StrokeLine {
  const chars = [...o.text];
  const idx: number[] = [];
  {
    let u = 0;
    for (const c of chars) {
      idx.push(u);
      u += c.length;
    }
  }
  const unsupported = new Set<string>();
  const known = chars.map((c) => LETTERS[c]);
  const joinsNext = (i: number) => {
    const c = chars[i];
    if (!known[i]) return false;
    const j = joiningType(c.codePointAt(0) ?? 0);
    return j === 'D';
  };

  // Pieces in letter units (x grows to the right; the line is written leftwards from 0).
  type Piece = { strokes: NibStroke[]; letter?: number; connectorAfter?: number };
  const pieces: Piece[] = [];
  const letterMeta: Omit<StrokeLetter, 'd' | 'box'>[] = [];
  let pen = 0;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const def = known[i];
    if (c === ' ' || c === ' ' || c === '\n') {
      pen -= WORD_GAP;
      continue;
    }
    if (!def) {
      if (joiningType(c.codePointAt(0) ?? 0) !== 'T') unsupported.add(c);
      continue;
    }
    const fromPrev = i > 0 && joinsNext(i - 1);
    const toNext = joinsNext(i) && i + 1 < chars.length && !!known[i + 1];
    const form: Form = fromPrev ? (toNext ? 'medi' : 'fina') : toNext ? 'init' : 'isol';
    const g = glyphFor(def, form);
    if (!g) continue;
    const L = g.madd ? Math.max(0, Math.min(1, o.madd[String(idx[i])] ?? 0)) * g.madd.length : 0;
    const ox = pen - g.advance;
    const move = (p: Vec): Vec => {
      const x = g.madd && p[0] < g.madd.cut ? p[0] - L : p[0];
      return [x + ox, p[1]];
    };
    const strokes: NibStroke[] = g.strokes.map((s) => ({ pts: s.pts.map(move), press: s.press }));
    if (def.dots && g.dotsAt) {
      const at = move(def.above ? g.dotsAt.above : g.dotsAt.below);
      strokes.push(...dotGroup(at[0], at[1], def.dots, o.nib, def.above));
    }
    pieces.push({ strokes, letter: letterMeta.length });
    letterMeta.push({ index: idx[i], char: c, form, maddable: !!g.madd, joinsNext: toNext });
    pen = ox - L;
    if (toNext) {
      const k = Math.max(0, Math.min(4, o.kashida[String(idx[i])] ?? 0)) * 1000;
      if (k > 0) {
        const sag = Math.min(22, k * 0.05);
        pieces.push({ strokes: [{ pts: [[pen, 0], [pen - k / 2, -sag], [pen - k, 0]] }], connectorAfter: idx[i] });
        pen -= k;
      }
    }
  }

  const width = -pen;
  const s = o.size / 1000;
  const toMm = (p: Vec): Vec => [(p[0] + width / 2) * s, -p[1] * s];
  const letters: StrokeLetter[] = [];
  const connectors: StrokeLine['connectors'] = [];
  const skeleton: Vec[][] = [];
  let all = '';
  let box = emptyRect();
  for (const piece of pieces) {
    let d = '';
    let pb = emptyRect();
    for (const st of piece.strokes) {
      const quads = sweepQuads(st, o.nib);
      d += quadsToPath(quads, toMm);
      for (const q of quads) {
        for (const p of q) {
          const [x, y] = toMm(p);
          pb = unionRect(pb, { minX: x, minY: y, maxX: x, maxY: y });
        }
      }
      if (st.pts.length > 1) skeleton.push(st.pts.map(toMm));
    }
    all += d;
    box = unionRect(box, pb);
    if (piece.letter !== undefined) letters.push({ ...letterMeta[piece.letter], d, box: pb });
    else if (piece.connectorAfter !== undefined) connectors.push({ after: piece.connectorAfter, d });
  }
  if (!all) box = { minX: -o.size, minY: -o.size, maxX: o.size, maxY: o.size * 0.3 };
  return { letters, connectors, skeleton, d: all, box, width: width * s, unsupported: [...unsupported] };
}
