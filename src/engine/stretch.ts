// Lengthening a letter (مدّ) the way a pen would draw it longer, not by inserting a ruled bar.
//
// 1. Analysis: the glyph is sampled in vertical columns to find its run of single stroke near
//    the baseline (the connecting stroke, or the body or tail of a final letter). Each column
//    gets a weight: high where the stroke is horizontal and as thick as the font's tatweel,
//    low on slopes, thin joints and solid loop heads, zero outside the run. The weights are
//    smoothed, giving a density along x.
// 2. Warp: the lengthening is spread over the run by that density, x' = x + delta·F(x), where
//    F is the density's running share (0 → 1). The letter's own curves are drawn out in
//    proportion, and since the density falls to zero at the run's ends the warp joins the rest
//    of the letter smoothly (C¹). The drawn-out stroke also dips a little in the middle
//    (تقعير), deeper as it grows, like a hand-drawn madd: by default in cursive styles only,
//    and the user can deepen, flatten or remove it per letter.
// 3. Outline: curves are split exactly where the warp starts and ends. Parts outside move
//    rigidly; parts inside are cut into short cubics and each is mapped by its end points and
//    end tangents (through the warp's Jacobian), so the result stays smooth and accurate.
import type { LoadedFont } from './fonts';
import type { PathCommand } from './geom';
import { glyphOutline } from './shape';

const SAMPLES = 96;
/** Contours smaller than this (in ems, both ways) are dots: they move whole, never stretch. */
const DOT_EM = 0.22;
/** Depth of the standard dip, per unit of lengthening, and its limit in ems. */
const DIP_RATIO = 0.03;
const MAX_DIP_EM = 0.12;
const zoneCache = new WeakMap<LoadedFont, Map<string, StretchZone | null>>();

/**
 * How a glyph is lengthened: a density along x (font units) given at knots, linear between
 * them and zero outside `from`..`to`. It integrates to 1, `cum` being its running integral.
 */
export interface StretchZone {
  xs: number[];
  rho: number[];
  cum: number[];
  from: number;
  to: number;
}

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

/** Filled spans of an outline along x = cx (font units). */
export function outlineSpans(cmds: PathCommand[], cx: number): [number, number][] {
  return filledSpans(flatten(cmds), cx);
}

/**
 * How `gid` is lengthened, or null when the letter has no flat single-stroke part near the
 * baseline. `joinsLeft` prefers the connecting stroke on the left edge; otherwise the longest
 * flat part is used (tails of final letters).
 */
export function stretchZone(lf: LoadedFont, gid: number, joinsLeft: boolean): StretchZone | null {
  let m = zoneCache.get(lf);
  if (!m) zoneCache.set(lf, (m = new Map()));
  const key = `${gid}|${joinsLeft ? 1 : 0}`;
  if (m.has(key)) return m.get(key)!;
  const zone = findZone(lf, gid, joinsLeft);
  m.set(key, zone);
  return zone;
}

function findZone(lf: LoadedFont, gid: number, joinsLeft: boolean): StretchZone | null {
  const { cmds, box } = glyphOutline(lf, gid);
  if (!box) return null;
  const em = lf.upem;
  const w = box.maxX - box.minX;
  if (w < em * 0.06) return null;
  // Dots above or below the stroke would hide the flat part under them, so only the body counts.
  const contours = splitContours(cmds);
  const body = bodyContours(contours, em);
  const segs = contours.filter((_, i) => body[i]).flatMap((c) => flatten(c));
  const valid: boolean[] = [];
  const xs: number[] = [];
  const thick: number[] = [];
  const mid: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const x = box.minX + w * (0.03 + (0.94 * (i + 0.5)) / SAMPLES);
    const spans = filledSpans(segs, x);
    const [lo, hi] = spans[0] ?? [0, 0];
    const ok = spans.length === 1 && hi - lo > 0 && hi - lo <= em * 0.24 && lo >= -em * 0.4 && hi <= em * 0.5;
    valid.push(ok);
    xs.push(x);
    thick.push(hi - lo);
    mid.push((lo + hi) / 2);
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

  // Weight of each column: horizontal strokes of even thickness, as thick as the font's tatweel
  // (the kashida its designer drew), take most of the lengthening; steep parts, hooks, thin
  // joints and solid loop heads (medial meem) keep their shape. Gentle slopes still take a
  // share, so a bowl (noon, the tail of yeh) widens as a whole instead of gaining a flat bottom
  // between round sides. A tapering part is never drawn out, as it would turn into a long wedge.
  const ref = tatweelThickness(lf) ?? median(thick.slice(pick.from, pick.to + 1));
  const even: number[] = new Array(SAMPLES).fill(0);
  const weight: number[] = new Array(SAMPLES).fill(0);
  for (let i = pick.from; i <= pick.to; i++) {
    const a = Math.max(pick.from, i - 1);
    const b = Math.min(pick.to, i + 1);
    const slope = a === b ? 0 : (mid[b] - mid[a]) / (xs[b] - xs[a]);
    const taper = a === b ? 0 : (thick[b] - thick[a]) / (xs[b] - xs[a]);
    even[i] = Math.max(0, 1 - Math.abs(taper) / 0.6) ** 2 * Math.min(thick[i] / ref, ref / thick[i]) ** 2;
    weight[i] = even[i] / (1 + (slope / 0.5) ** 2) ** 2;
  }
  // With no level part, a sloping stroke of even thickness (the tail of a Thuluth meem) is
  // drawn out flatter. A letter whose only flat part tapers to a point is not lengthened.
  if (Math.max(...weight) < 0.05) weight.splice(0, SAMPLES, ...even);
  if (Math.max(...weight) < 0.05) return null;
  // One place takes the whole lengthening: spread over separate places it would cut the letter
  // apart (a tooth of seen left standing in the middle of the stroke). A joined letter is
  // lengthened at its connecting stroke (the first part), unless that part is negligible.
  const top = Math.max(...weight);
  const parts: { from: number; to: number; sum: number }[] = [];
  for (let i = pick.from; i <= pick.to; i++) {
    if (weight[i] < top * 0.1) continue;
    const last = parts[parts.length - 1];
    if (last && last.to === i - 1) {
      last.to = i;
      last.sum += weight[i];
    } else parts.push({ from: i, to: i, sum: weight[i] });
  }
  const biggest = parts.reduce((a, b) => (b.sum > a.sum ? b : a), parts[0] ?? { from: pick.from, to: pick.to, sum: 0 });
  const chosen = { ...(joinsLeft && parts.length && parts[0].sum >= biggest.sum * 0.25 ? parts[0] : biggest) };
  while (chosen.to - chosen.from < 4 && (chosen.from > pick.from || chosen.to < pick.to)) {
    if (chosen.from > pick.from) chosen.from--;
    if (chosen.to < pick.to) chosen.to++;
  }
  // The density stays inside the part: past it other strokes may share the columns (the flick
  // at the end of a tail, a tooth), and they would be drawn out too. Within the part it must
  // change slowly: the curve's bend is divided by the local rate of lengthening, so every bump
  // in the density shows as a ripple in the stroke and every quick change as a knee. So the
  // weights are smoothed over a good share of the part and shaped by a bell (Hann window) that
  // fades to zero at both ends, where the drawn-out part meets the rest of the letter.
  const raw = weight.slice(chosen.from, chosen.to + 1).map((v) => Math.max(0.01, v));
  const n = raw.length;
  const sigma = Math.max(1.5, n * 0.15);
  const reach = Math.ceil(sigma * 3);
  const rho = raw.map((_, i) => {
    let s = 0;
    let wsum = 0;
    for (let k = -reach; k <= reach; k++) {
      const w = Math.exp(-((k / sigma) ** 2) / 2);
      s += raw[Math.min(n - 1, Math.max(0, i + k))] * w;
      wsum += w;
    }
    return s / wsum;
  });
  const kx = xs.slice(chosen.from, chosen.to + 1);
  const kr = rho.map((r, i) => r * (n > 1 ? 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)) : 1));
  if (n < 3) {
    // A part of one or two columns: a short bump around them.
    kx.unshift(kx[0] - step / 2);
    kx.push(kx[kx.length - 1] + step / 2);
    kr.splice(0, kr.length, 0, ...rho, 0);
  }
  const last = kx.length - 1;
  const cum = [0];
  for (let j = 1; j <= last; j++) cum.push(cum[j - 1] + ((kx[j] - kx[j - 1]) * (kr[j] + kr[j - 1])) / 2);
  const total = cum[last];
  return {
    xs: kx,
    rho: kr.map((r) => r / total),
    cum: cum.map((c) => c / total),
    from: kx[0],
    to: kx[last],
  };
}

const tatweelCache = new WeakMap<LoadedFont, number | null>();

/** Stroke thickness of the font's tatweel (U+0640) at its middle, or null when it has none. */
function tatweelThickness(lf: LoadedFont): number | null {
  if (tatweelCache.has(lf)) return tatweelCache.get(lf)!;
  let t: number | null = null;
  const gid = lf.font.glyph(0x0640);
  const { cmds, box } = gid ? glyphOutline(lf, gid) : { cmds: [], box: null };
  if (box) {
    const spans = filledSpans(flatten(cmds), (box.minX + box.maxX) / 2);
    if (spans.length === 1 && spans[0][1] - spans[0][0] <= lf.upem * 0.24) t = spans[0][1] - spans[0][0];
  }
  tatweelCache.set(lf, t);
  return t;
}

function median(v: number[]): number {
  const s = v.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
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

/**
 * Which contours make up the letter's body: the largest one and those touching it, directly or
 * through others. The rest (dots, pairs of dots drawn as one contour, detached signs) are not
 * part of the stroke and move whole.
 */
function bodyContours(contours: PathCommand[][], em: number): boolean[] {
  const r = contours.map(xRange);
  const dot = contours.map((c) => isDot(c, em));
  const body = contours.map(() => false);
  let main = -1;
  const area = (b: (typeof r)[number]) => (b.maxX - b.minX) * (b.maxY - b.minY);
  for (let i = 0; i < contours.length; i++) if (!dot[i] && (main < 0 || area(r[i]) > area(r[main]))) main = i;
  if (main < 0) return body;
  body[main] = true;
  const pad = em * 0.01;
  const touch = (a: (typeof r)[number], b: (typeof r)[number]) =>
    a.minX <= b.maxX + pad && b.minX <= a.maxX + pad && a.minY <= b.maxY + pad && b.minY <= a.maxY + pad;
  for (let grew = true; grew; ) {
    grew = false;
    for (let i = 0; i < contours.length; i++) {
      if (body[i] || dot[i] || !body.some((b, j) => b && touch(r[i], r[j]))) continue;
      body[i] = true;
      grew = true;
    }
  }
  return body;
}

/** Share of the lengthening taken left of `x` (0 → 1) and the density there. */
function share(z: StretchZone, x: number): [number, number] {
  if (x <= z.from) return [0, 0];
  if (x >= z.to) return [1, 0];
  let j = 0;
  while (j < z.xs.length - 2 && z.xs[j + 1] <= x) j++;
  const f = (x - z.xs[j]) / (z.xs[j + 1] - z.xs[j]);
  const r = z.rho[j] + (z.rho[j + 1] - z.rho[j]) * f;
  return [z.cum[j] + ((x - z.xs[j]) * (z.rho[j] + r)) / 2, r];
}

/** Whether a lengthened stroke dips by default: yes in cursive styles, not in geometric ones (Kufi). */
export function dipsByDefault(lf: LoadedFont): boolean {
  return !/كوفي|حديث/.test(lf.def.category);
}

/** Deepest dip (font units) of a stroke lengthened by `delta`; `dip` scales the standard depth (1). */
export function dipDepth(delta: number, em: number, dip: number): number {
  return Math.min(delta * DIP_RATIO, em * MAX_DIP_EM) * dip;
}

/** Where `x` (font units) ends up when `zone` is lengthened by `delta`. */
export function stretchX(zone: StretchZone, delta: number, x: number): number {
  return x + delta * share(zone, x)[0];
}

/** How far down (font units) the stroke at `x` is moved by the dip of the lengthened part. */
export function stretchDip(zone: StretchZone, delta: number, x: number, em: number, dip: number): number {
  const u = share(zone, x)[0];
  return dipDepth(delta, em, dip) * 4 * u * (1 - u);
}

type P = [number, number];

function lerpPoints(q: P[], t: number): P[] {
  return q.slice(1).map((b, i) => [q[i][0] + (b[0] - q[i][0]) * t, q[i][1] + (b[1] - q[i][1]) * t]);
}

function bezierAt(p: P[], t: number): P {
  let q = p;
  while (q.length > 1) q = lerpPoints(q, t);
  return q[0];
}

/** de Casteljau split of a Bézier of any degree at `t`. */
function splitBezier(p: P[], t: number): [P[], P[]] {
  const left: P[] = [p[0]];
  const right: P[] = [p[p.length - 1]];
  let q = p;
  while (q.length > 1) {
    q = lerpPoints(q, t);
    left.push(q[0]);
    right.unshift(q[q.length - 1]);
  }
  return [left, right];
}

function toCubic(p: P[]): P[] {
  if (p.length === 4) return p;
  if (p.length === 3) {
    const [a, c, b] = p;
    return [a, [a[0] + ((c[0] - a[0]) * 2) / 3, a[1] + ((c[1] - a[1]) * 2) / 3], [b[0] + ((c[0] - b[0]) * 2) / 3, b[1] + ((c[1] - b[1]) * 2) / 3], b];
  }
  const [a, b] = p;
  return [a, [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3], [a[0] + ((b[0] - a[0]) * 2) / 3, a[1] + ((b[1] - a[1]) * 2) / 3], b];
}

/** Adds to `out` the parameters in (0, 1) where the curve crosses the vertical line x = X. */
function crossings(p: P[], X: number, out: number[]) {
  const n = p.length === 2 ? 1 : 24;
  let t0 = 0;
  let f0 = p[0][0] - X;
  for (let i = 1; i <= n; i++) {
    const t1 = i / n;
    const f1 = bezierAt(p, t1)[0] - X;
    if (f0 < 0 !== f1 < 0) {
      let a = t0;
      let b = t1;
      let fa = f0;
      for (let k = 0; k < 40; k++) {
        const m = (a + b) / 2;
        const fm = bezierAt(p, m)[0] - X;
        if (fa < 0 === fm < 0) {
          a = m;
          fa = fm;
        } else b = m;
      }
      const t = (a + b) / 2;
      if (t > 1e-9 && t < 1 - 1e-9) out.push(t);
    }
    t0 = t1;
    f0 = f1;
  }
}

/** Lengthens the outline by `delta` font units as described by `zone`, dipping by `dip` (see dipDepth). */
export function stretchOutline(cmds: PathCommand[], zone: StretchZone, delta: number, em: number, dip: number): PathCommand[] {
  if (!delta) return cmds;
  const depth = dipDepth(delta, em, dip);
  // The warp at a point, and its Jacobian applied to a direction (dx, dy).
  const warp = (x: number, y: number): { p: P; jac: (dx: number, dy: number) => P } => {
    const [u, r] = share(zone, x);
    const kx = 1 + delta * r;
    const ky = depth * 4 * (1 - 2 * u) * r;
    return { p: [x + delta * u, y - depth * 4 * u * (1 - u)], jac: (dx, dy) => [dx * kx, dy - dx * ky] };
  };
  const out: PathCommand[] = [];
  const emit = (type: string, p: P[]) => {
    // Control points can lie outside the piece's side, so the side is taken from the curve.
    const xm = bezierAt(p, 0.5)[0];
    if (xm <= zone.from || xm >= zone.to) {
      const dx = xm <= zone.from ? 0 : delta;
      const values: number[] = [];
      for (const [x, y] of p.slice(1)) values.push(x + dx, y);
      out.push({ type, values });
      return;
    }
    // Inside: short cubics, each fixed by its mapped end points and end tangents.
    let rest = toCubic(p);
    const xs = rest.map((q) => q[0]);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const span = stretchX(zone, delta, x1) - stretchX(zone, delta, x0);
    const n = Math.max(1, Math.min(48, Math.ceil(span / (em * 0.08)), Math.ceil((x1 - x0) / ((zone.to - zone.from) / 32))));
    for (let i = 0; i < n; i++) {
      let c: P[];
      if (i < n - 1) [c, rest] = splitBezier(rest, 1 / (n - i));
      else c = rest;
      const a = warp(c[0][0], c[0][1]);
      const b = warp(c[3][0], c[3][1]);
      const ta = a.jac(c[1][0] - c[0][0], c[1][1] - c[0][1]);
      const tb = b.jac(c[2][0] - c[3][0], c[2][1] - c[3][1]);
      out.push({ type: 'C', values: [a.p[0] + ta[0], a.p[1] + ta[1], b.p[0] + tb[0], b.p[1] + tb[1], b.p[0], b.p[1]] });
    }
  };
  const piece = (type: string, p: P[]) => {
    const ts: number[] = [];
    crossings(p, zone.from, ts);
    crossings(p, zone.to, ts);
    ts.sort((a, b) => a - b);
    let rest = p;
    let done = 0;
    for (const t of ts) {
      const [a, b] = splitBezier(rest, (t - done) / (1 - done));
      emit(type, a);
      rest = b;
      done = t;
    }
    emit(type, rest);
  };
  const contours = splitContours(cmds);
  const body = bodyContours(contours, em);
  for (const [ci, contour] of contours.entries()) {
    if (!body[ci]) {
      // Dots move whole with the stroke under them.
      const r = xRange(contour);
      const c = (r.minX + r.maxX) / 2;
      const { p } = warp(c, 0);
      for (const cmd of contour) {
        const v = cmd.values.slice();
        for (let i = 0; i + 1 < v.length; i += 2) {
          v[i] += p[0] - c;
          v[i + 1] += p[1];
        }
        out.push({ type: cmd.type, values: v });
      }
      continue;
    }
    let cur: P = [0, 0];
    let start: P = [0, 0];
    for (const c of contour) {
      const v = c.values;
      if (c.type === 'M') {
        cur = start = [v[0], v[1]];
        out.push({ type: 'M', values: warp(v[0], v[1]).p });
      } else if (c.type === 'L' || c.type === 'Q' || c.type === 'C') {
        const p: P[] = [cur];
        for (let i = 0; i + 1 < v.length; i += 2) p.push([v[i], v[i + 1]]);
        piece(c.type, p);
        cur = p[p.length - 1];
      } else if (c.type === 'Z') {
        // The implicit closing line can cross the zone too.
        if (cur[0] !== start[0] || cur[1] !== start[1]) piece('L', [cur, start]);
        out.push({ type: 'Z', values: [] });
        cur = start;
      }
    }
  }
  return out;
}
