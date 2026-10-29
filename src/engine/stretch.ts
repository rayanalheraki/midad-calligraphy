// Lengthening a letter (مدّ) by stretching its outline: the glyph is cut by a vertical line
// through a stretch of single, thin stroke near the baseline (the connecting stroke or the
// flat tail of a final letter), and everything on the right of the cut is moved right.
// Outline segments that cross the cut get longer, so the stroke grows without a seam.
import type { LoadedFont } from './fonts';
import type { PathCommand } from './geom';
import { glyphOutline } from './shape';

const SAMPLES = 56;
/** Contours smaller than this (in ems, both ways) are dots: they move whole, never stretch. */
const DOT_EM = 0.22;
const cutCache = new WeakMap<LoadedFont, Map<string, number | null>>();

type Seg = [number, number, number, number];

function flatten(cmds: PathCommand[]): Seg[] {
  const segs: Seg[] = [];
  let sx = 0;
  let sy = 0;
  let x = 0;
  let y = 0;
  const steps = 8;
  for (const c of cmds) {
    const v = c.values;
    if (c.type === 'M') {
      x = sx = v[0];
      y = sy = v[1];
    } else if (c.type === 'L') {
      segs.push([x, y, v[0], v[1]]);
      x = v[0];
      y = v[1];
    } else if (c.type === 'Q') {
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        const nx = u * u * x + 2 * u * t * v[0] + t * t * v[2];
        const ny = u * u * y + 2 * u * t * v[1] + t * t * v[3];
        segs.push([i === 1 ? x : segs[segs.length - 1][2], i === 1 ? y : segs[segs.length - 1][3], nx, ny]);
      }
      x = v[2];
      y = v[3];
    } else if (c.type === 'C') {
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        const nx = u * u * u * x + 3 * u * u * t * v[0] + 3 * u * t * t * v[2] + t * t * t * v[4];
        const ny = u * u * u * y + 3 * u * u * t * v[1] + 3 * u * t * t * v[3] + t * t * t * v[5];
        segs.push([i === 1 ? x : segs[segs.length - 1][2], i === 1 ? y : segs[segs.length - 1][3], nx, ny]);
      }
      x = v[4];
      y = v[5];
    } else if (c.type === 'Z') {
      if (x !== sx || y !== sy) segs.push([x, y, sx, sy]);
      x = sx;
      y = sy;
    }
  }
  return segs;
}

/**
 * Filled spans of the outline along the vertical line x = cx, by the nonzero winding rule,
 * so letters built from overlapping contours count as one stroke.
 */
function filledSpans(segs: Seg[], cx: number): [number, number][] {
  const hits: { y: number; dir: number }[] = [];
  for (const [x1, y1, x2, y2] of segs) {
    if ((x1 <= cx && cx < x2) || (x2 <= cx && cx < x1)) hits.push({ y: y1 + ((cx - x1) / (x2 - x1)) * (y2 - y1), dir: x2 > x1 ? 1 : -1 });
  }
  hits.sort((a, b) => a.y - b.y);
  const spans: [number, number][] = [];
  let winding = 0;
  let start = 0;
  for (const h of hits) {
    const before = winding;
    winding += h.dir;
    if (before === 0 && winding !== 0) start = h.y;
    else if (before !== 0 && winding === 0) spans.push([start, h.y]);
  }
  return spans;
}

/**
 * Where `gid` can be stretched (x in font units), or null when the letter has no flat
 * single-stroke part near the baseline. `joinsLeft` prefers the connecting stroke on the
 * left edge; otherwise the longest flat part is used (tails of final letters).
 */
export function stretchCut(lf: LoadedFont, gid: number, joinsLeft: boolean): number | null {
  let m = cutCache.get(lf);
  if (!m) cutCache.set(lf, (m = new Map()));
  const key = `${gid}|${joinsLeft ? 1 : 0}`;
  if (m.has(key)) return m.get(key)!;
  const cut = findCut(lf, gid, joinsLeft);
  m.set(key, cut);
  return cut;
}

function findCut(lf: LoadedFont, gid: number, joinsLeft: boolean): number | null {
  const { cmds, box } = glyphOutline(lf, gid);
  if (!box) return null;
  const em = lf.upem;
  const w = box.maxX - box.minX;
  if (w < em * 0.06) return null;
  // Dots above or below the stroke would hide the flat part under them, so only the body counts.
  const segs = splitContours(cmds)
    .filter((c) => !isDot(c, em))
    .flatMap((c) => flatten(c));
  const valid: boolean[] = [];
  const xs: number[] = [];
  const thick: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const x = box.minX + w * (0.03 + (0.94 * (i + 0.5)) / SAMPLES);
    const spans = filledSpans(segs, x);
    const [lo, hi] = spans[0] ?? [0, 0];
    const ok = spans.length === 1 && hi - lo > 0 && hi - lo <= em * 0.24 && lo >= -em * 0.4 && hi <= em * 0.5;
    valid.push(ok);
    xs.push(x);
    thick.push(hi - lo);
  }
  const runs: { from: number; to: number }[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    if (!valid[i]) continue;
    if (runs.length && runs[runs.length - 1].to === i - 1) runs[runs.length - 1].to = i;
    else runs.push({ from: i, to: i });
  }
  // A flat stretch must be long enough to be a stroke, not the foot of an alef or a serif.
  const step = (w * 0.94) / SAMPLES;
  const usable = runs.filter((r) => (r.to - r.from + 1) * step >= em * 0.05);
  if (!usable.length) return null;
  const pick = joinsLeft ? usable[0] : usable.reduce((a, b) => (b.to - b.from > a.to - a.from ? b : a));
  // Cut where the stroke is thinnest: the lengthened part keeps that thickness. Samples
  // close to the thinnest one count as equal, and the middle of those is used.
  let min = Infinity;
  for (let i = pick.from; i <= pick.to; i++) min = Math.min(min, thick[i]);
  const thin: number[] = [];
  for (let i = pick.from; i <= pick.to; i++) if (thick[i] <= min * 1.08 + em * 0.004) thin.push(i);
  return xs[thin[Math.floor(thin.length / 2)]];
}

function splitContours(cmds: PathCommand[]): PathCommand[][] {
  const out: PathCommand[][] = [];
  for (const c of cmds) {
    if (c.type === 'M' || !out.length) out.push([]);
    out[out.length - 1].push(c);
  }
  return out;
}

function xRange(contour: PathCommand[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of contour) {
    for (let i = 0; i + 1 < c.values.length; i += 2) {
      minX = Math.min(minX, c.values[i]);
      maxX = Math.max(maxX, c.values[i]);
      minY = Math.min(minY, c.values[i + 1]);
      maxY = Math.max(maxY, c.values[i + 1]);
    }
  }
  return { minX, maxX, minY, maxY };
}

function isDot(contour: PathCommand[], em: number): boolean {
  const r = xRange(contour);
  return r.maxX - r.minX < em * DOT_EM && r.maxY - r.minY < em * DOT_EM;
}

/** Moves the part of the outline right of `cut` by `delta` font units. */
export function stretchOutline(cmds: PathCommand[], cut: number, delta: number, em: number): PathCommand[] {
  if (!delta) return cmds;
  const out: PathCommand[] = [];
  for (const contour of splitContours(cmds)) {
    // Contours on one side of the cut, and dots, move as a whole and keep their shape.
    const r = xRange(contour);
    const whole = r.maxX <= cut ? 0 : r.minX >= cut ? delta : isDot(contour, em) ? ((r.minX + r.maxX) / 2 >= cut ? delta : 0) : null;
    for (const c of contour) {
      const v = c.values.slice();
      for (let i = 0; i + 1 < v.length; i += 2) v[i] += whole ?? (v[i] >= cut ? delta : 0);
      out.push({ type: c.type, values: v });
    }
  }
  return out;
}
