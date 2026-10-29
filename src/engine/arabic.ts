// Arabic joining behaviour (subset of Unicode ArabicShaping.txt) and kashida (tatweel) placement.

export type Joining = 'U' | 'R' | 'D' | 'C' | 'T';

type Range = [number, number];
const R_RANGES: Range[] = [
  [0x0622, 0x0625], [0x0627, 0x0627], [0x0629, 0x0629], [0x062f, 0x0632], [0x0648, 0x0648],
  [0x0671, 0x0673], [0x0675, 0x0677], [0x0688, 0x0699], [0x06c0, 0x06c0], [0x06c3, 0x06cb],
  [0x06cd, 0x06cd], [0x06cf, 0x06cf], [0x06d2, 0x06d3], [0x06d5, 0x06d5], [0x06ee, 0x06ef],
  [0x0759, 0x075b], [0x076b, 0x076c], [0x0771, 0x0771], [0x0773, 0x0774], [0x0778, 0x0779],
  [0x08aa, 0x08ac], [0x08ae, 0x08ae], [0x08b1, 0x08b2], [0x08b9, 0x08b9],
];
const D_RANGES: Range[] = [
  [0x0620, 0x0620], [0x0626, 0x0626], [0x0628, 0x0628], [0x062a, 0x062e], [0x0633, 0x063f],
  [0x0641, 0x0647], [0x0649, 0x064a], [0x066e, 0x066f], [0x0678, 0x0687], [0x069a, 0x06bf],
  [0x06c1, 0x06c2], [0x06cc, 0x06cc], [0x06ce, 0x06ce], [0x06d0, 0x06d1], [0x06fa, 0x06fc],
  [0x06ff, 0x06ff], [0x0750, 0x0758], [0x075c, 0x076a], [0x076d, 0x0770], [0x0772, 0x0772],
  [0x0775, 0x0777], [0x077a, 0x077f], [0x08a0, 0x08a9], [0x08af, 0x08b0], [0x08b3, 0x08b8],
  [0x08ba, 0x08c7],
];
const T_RANGES: Range[] = [
  [0x0300, 0x036f], [0x0610, 0x061a], [0x064b, 0x065f], [0x0670, 0x0670], [0x06d6, 0x06dc],
  [0x06df, 0x06e4], [0x06e7, 0x06e8], [0x06ea, 0x06ed], [0x08d3, 0x08e1], [0x08e3, 0x08ff],
  [0xfe20, 0xfe2f],
];

const inRanges = (cp: number, ranges: Range[]) => ranges.some(([a, b]) => cp >= a && cp <= b);

export function joiningType(cp: number): Joining {
  if (cp === 0x0640 || cp === 0x200d || cp === 0x07fa) return 'C';
  if (inRanges(cp, T_RANGES)) return 'T';
  if (inRanges(cp, D_RANGES)) return 'D';
  if (inRanges(cp, R_RANGES)) return 'R';
  return 'U';
}

export const isTransparent = (cp: number) => joiningType(cp) === 'T';
const joinsToNext = (j: Joining) => j === 'D' || j === 'C';
const joinsToPrev = (j: Joining) => j === 'D' || j === 'R' || j === 'C';

export const TATWEEL = 'ـ';

const SEEN_SAD = new Set([0x0633, 0x0634, 0x0635, 0x0636, 0x069a, 0x069b, 0x069c]);
const KAF = new Set([0x0643, 0x06a9, 0x06aa, 0x06ab, 0x06ac, 0x06ad, 0x06ae, 0x06af]);
const BEH = new Set([0x0628, 0x062a, 0x062b, 0x0646, 0x064a, 0x0626, 0x06cc, 0x067e, 0x0679, 0x0649]);
const ALEF = new Set([0x0622, 0x0623, 0x0625, 0x0627, 0x0671, 0x0672, 0x0673]);
const FINAL_PREFERRED = new Set([
  0x062f, 0x0630, 0x0631, 0x0632, 0x0698, // dal, thal, reh, zain, jeh
  0x0645, 0x0646, // meem, noon
  0x0629, 0x0647, 0x06c1, 0x06d5, // teh marbuta, heh
]);

export interface KashidaSlot {
  /** index in the original text after which tatweel is inserted (after trailing diacritics) */
  at: number;
  /** index of the letter that precedes the slot */
  letter: number;
  priority: number;
  word: number;
}

/** Positions where a kashida can extend the connection between two joined letters. */
export function kashidaSlots(text: string): KashidaSlot[] {
  const chars = Array.from(text);
  const cps = chars.map((c) => c.codePointAt(0) ?? 0);
  // Work in UTF-16 indices so slots align with HarfBuzz clusters.
  const idx: number[] = [];
  let u = 0;
  for (const c of chars) {
    idx.push(u);
    u += c.length;
  }
  const slots: KashidaSlot[] = [];
  let word = 0;
  // Words built on the name of God (الله، لله، والله…) are never stretched.
  const sacred = new Set<number>();
  {
    let w = 0;
    let letters = '';
    const flush = () => {
      if (/^(?:[وفبت]?ا?)?لله$/.test(letters) || letters.endsWith('الله')) sacred.add(w);
      letters = '';
    };
    for (const cp of cps) {
      if (cp === 0x20 || cp === 0xa0 || cp === 0x0a) {
        flush();
        w++;
      } else if (joiningType(cp) !== 'T') letters += String.fromCodePoint(cp);
    }
    flush();
  }
  const nextBase = (from: number) => {
    let k = from;
    while (k < cps.length && joiningType(cps[k]) === 'T') k++;
    return k;
  };
  for (let i = 0; i < cps.length; i++) {
    const cp = cps[i];
    const jt = joiningType(cp);
    if (cp === 0x20 || cp === 0xa0 || cp === 0x0a) word++;
    if (jt === 'T' || !joinsToNext(jt) || sacred.has(word)) continue;
    const j = nextBase(i + 1);
    if (j >= cps.length) continue;
    const next = cps[j];
    const njt = joiningType(next);
    if (!joinsToPrev(njt)) continue;
    if (cp === 0x0644 && ALEF.has(next)) continue; // keep the lam-alef ligature intact
    if (cp === 0x0640 || next === 0x0640) continue;
    const k = nextBase(j + 1);
    const nextIsFinal = !(joinsToNext(njt) && k < cps.length && joinsToPrev(joiningType(cps[k])));
    let priority = 1;
    if (SEEN_SAD.has(cp)) priority = 6;
    else if (nextIsFinal && FINAL_PREFERRED.has(next)) priority = 5;
    else if (KAF.has(cp)) priority = 4;
    else if (nextIsFinal) priority = 3;
    else if (BEH.has(cp)) priority = 2;
    const lastMark = j - 1; // last transparent mark attached to letter i (or i itself)
    slots.push({ at: idx[lastMark] + chars[lastMark].length, letter: idx[i], priority, word });
  }
  return slots;
}

/** Best slot of each word: highest priority, latest position on ties. */
export function bestSlotPerWord(slots: KashidaSlot[]): KashidaSlot[] {
  const best = new Map<number, KashidaSlot>();
  for (const s of slots) {
    const cur = best.get(s.word);
    if (!cur || s.priority >= cur.priority) best.set(s.word, s);
  }
  return [...best.values()].sort((a, b) => a.at - b.at);
}

export interface KashidaText {
  text: string;
  /** for every UTF-16 unit of `text`: index of the original character it comes from */
  origin: number[];
  /** true where the unit is an inserted tatweel */
  inserted: boolean[];
}

/** Inserts `counts.get(at)` tatweels at each slot position (keys are UTF-16 offsets in the original text). */
export function insertKashida(text: string, counts: Map<number, number>): KashidaText {
  let out = '';
  const origin: number[] = [];
  const inserted: boolean[] = [];
  for (let i = 0; i <= text.length; i++) {
    const n = counts.get(i) ?? 0;
    for (let k = 0; k < n; k++) {
      out += TATWEEL;
      origin.push(Math.max(0, i - 1));
      inserted.push(true);
    }
    if (i < text.length) {
      out += text[i];
      origin.push(i);
      inserted.push(false);
    }
  }
  return { text: out, origin, inserted };
}

export const MAX_KASHIDA_PER_SLOT = 24;

/**
 * Builds the kashida counts for a line:
 * - `level` tatweels at the best slot of every word,
 * - plus manual counts keyed by the letter index (Kelk's per-letter kashida tool).
 */
export function kashidaCounts(text: string, level: number, manual: Record<string, number>): Map<number, number> {
  const slots = kashidaSlots(text);
  const counts = new Map<number, number>();
  const add = (at: number, n: number) => {
    const v = Math.min(MAX_KASHIDA_PER_SLOT, Math.max(0, (counts.get(at) ?? 0) + n));
    counts.set(at, v);
  };
  if (level > 0) for (const s of bestSlotPerWord(slots)) add(s.at, Math.round(level));
  for (const s of slots) {
    const n = manual[String(s.letter)];
    if (n) add(s.at, Math.round(n));
  }
  return counts;
}

/**
 * Adds tatweels word by word (best slots first) until `measure(text)` reaches `target`.
 * Returns the counts that come closest to the target without a large overshoot.
 */
export function justifyCounts(
  text: string,
  base: Map<number, number>,
  target: number,
  measure: (t: string) => number,
  maxSteps = 240,
): Map<number, number> {
  const best = bestSlotPerWord(kashidaSlots(text)).sort((a, b) => b.priority - a.priority || b.at - a.at);
  const counts = new Map(base);
  if (!best.length) return counts;
  let width = measure(insertKashida(text, counts).text);
  if (width >= target) return counts;
  for (let step = 0; step < maxSteps; step++) {
    const slot = best[step % best.length];
    const prev = counts.get(slot.at) ?? 0;
    if (prev >= MAX_KASHIDA_PER_SLOT) continue;
    counts.set(slot.at, prev + 1);
    const w = measure(insertKashida(text, counts).text);
    if (w >= target) {
      // Keep whichever of the last two states is closer to the target.
      if (w - target > target - width) counts.set(slot.at, prev);
      return counts;
    }
    width = w;
  }
  return counts;
}
