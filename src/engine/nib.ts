// Strokes of a broad-nib pen. A stroke is a centre line through a few points, drawn by a
// flat nib held at a fixed angle: the ink is the area the nib sweeps along the line, so
// strokes are thick across the nib and thin along it, as with a reed pen.
//
// Units are those of the letter definitions (1000 per em, y up). A morph moves stroke
// points by a vector scaled by its value, which is how a letter is lengthened.

export type Vec = [number, number];

export interface Nib {
  /** width of the nib in letter units */
  width: number;
  /** angle of the nib edge from the baseline, degrees counter-clockwise */
  angle: number;
}

export interface NibStroke {
  /** points the centre line passes through */
  pts: Vec[];
  /** nib width factor at each point (pressure); 1 when absent */
  press?: number[];
}

/** Samples per curve segment between two points. */
const STEPS = 14;

/** Centre line through the points (Catmull-Rom), as samples with interpolated pressure. */
export function sampleStroke(s: NibStroke): { p: Vec; k: number }[] {
  const pts = s.pts;
  const press = (i: number) => s.press?.[i] ?? 1;
  if (pts.length === 1) return [{ p: pts[0], k: press(0) }];
  const out: { p: Vec; k: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let j = i === 0 ? 0 : 1; j <= STEPS; j++) {
      const t = j / STEPS;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ p: [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])], k: press(i) + (press(i + 1) - press(i)) * t });
    }
  }
  return out;
}

function nibVector(nib: Nib, k: number): Vec {
  const r = (nib.angle * Math.PI) / 180;
  const h = (nib.width * k) / 2;
  return [h * Math.cos(r), h * Math.sin(r)];
}

/**
 * Outline of the area swept by the nib, as one quadrilateral per sample step. Every
 * quadrilateral is wound the same way, so with the nonzero rule they fill as one shape
 * without gaps or holes where the line turns against the nib.
 */
export function sweepQuads(s: NibStroke, nib: Nib): Vec[][] {
  const smp = sampleStroke(s);
  const quads: Vec[][] = [];
  if (smp.length === 1) {
    // A single point: the nib pressed and drawn a little along its normal (a dot).
    const h = nibVector(nib, smp[0].k);
    const n: Vec = [-h[1] * 0.9, h[0] * 0.9];
    const [x, y] = smp[0].p;
    quads.push(orient([
      [x + h[0] - n[0], y + h[1] - n[1]],
      [x + h[0] + n[0], y + h[1] + n[1]],
      [x - h[0] + n[0], y - h[1] + n[1]],
      [x - h[0] - n[0], y - h[1] - n[1]],
    ]));
    return quads;
  }
  for (let i = 0; i < smp.length - 1; i++) {
    const a = smp[i];
    const b = smp[i + 1];
    const ha = nibVector(nib, a.k);
    const hb = nibVector(nib, b.k);
    quads.push(
      orient([
        [a.p[0] + ha[0], a.p[1] + ha[1]],
        [b.p[0] + hb[0], b.p[1] + hb[1]],
        [b.p[0] - hb[0], b.p[1] - hb[1]],
        [a.p[0] - ha[0], a.p[1] - ha[1]],
      ]),
    );
  }
  return quads;
}

/** Counter-clockwise winding (in y-up coordinates). */
function orient(q: Vec[]): Vec[] {
  let area = 0;
  for (let i = 0; i < q.length; i++) {
    const [x1, y1] = q[i];
    const [x2, y2] = q[(i + 1) % q.length];
    area += x1 * y2 - x2 * y1;
  }
  return area < 0 ? q.slice().reverse() : q;
}

/** A dot of the pen: a nib-width square standing on its corner, as calligraphers make it. */
export function dotStroke(x: number, y: number): NibStroke {
  return { pts: [[x, y]] };
}

/** Dot groups centred on (x, y): one, two side by side, or three in a triangle. */
export function dotGroup(x: number, y: number, count: 1 | 2 | 3, nib: Nib, up: boolean): NibStroke[] {
  const gap = nib.width * 1.05;
  if (count === 1) return [dotStroke(x, y)];
  if (count === 2) return [dotStroke(x - gap / 2, y), dotStroke(x + gap / 2, y)];
  const dy = (up ? 1 : -1) * gap * 0.85;
  return [dotStroke(x - gap / 2, y), dotStroke(x + gap / 2, y), dotStroke(x, y + dy)];
}

/** Path data for quadrilaterals after mapping each point. */
export function quadsToPath(quads: Vec[][], map: (p: Vec) => Vec): string {
  let d = '';
  for (const q of quads) {
    for (let i = 0; i < q.length; i++) {
      const [x, y] = map(q[i]);
      d += (i ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2);
    }
    d += 'Z';
  }
  return d;
}
