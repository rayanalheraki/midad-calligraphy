// Reed pen (qalam) simulation: a flat nib held at a fixed angle produces thick strokes
// across the nib and hairlines along it.
import { addPoint, emptyRect, fmt, type Rect } from './geom';

export interface PenPoint {
  x: number;
  y: number;
  p: number;
}

/** Chaikin corner cutting; keeps the first and last points. */
export function smoothPoints(points: PenPoint[], iterations = 2): PenPoint[] {
  let pts = points;
  for (let it = 0; it < iterations && pts.length > 2; it++) {
    const out: PenPoint[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25, p: a.p * 0.75 + b.p * 0.25 });
      out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75, p: a.p * 0.25 + b.p * 0.75 });
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

export interface PenStroke {
  /** path data in page millimetres */
  d: string;
  box: Rect;
}

/**
 * Builds the filled outline of a flat-nib stroke as a union of parallelograms
 * (one per segment), all wound the same way so the non-zero fill merges them.
 */
export function reedPenStroke(points: PenPoint[], nibWidth: number, angleDeg: number, usePressure: boolean): PenStroke {
  const pts = smoothPoints(points, 2);
  const a = (angleDeg * Math.PI) / 180;
  const ux = Math.cos(a);
  const uy = -Math.sin(a);
  const box = emptyRect();
  const half = (p: number) => (nibWidth / 2) * (usePressure ? 0.35 + 0.65 * Math.min(1, Math.max(0, p)) : 1);
  const f = (n: number) => fmt(n, 3);
  let d = '';
  const quad = (q: [number, number][]) => {
    let area = 0;
    for (let i = 0; i < q.length; i++) {
      const [x1, y1] = q[i];
      const [x2, y2] = q[(i + 1) % q.length];
      area += x1 * y2 - x2 * y1;
    }
    if (area < 0) q.reverse();
    d += q.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)},${f(y)}`).join('') + 'Z';
    for (const [x, y] of q) addPoint(box, x, y);
  };
  if (pts.length === 1) {
    const p = pts[0];
    const h = half(p.p);
    // A single tap leaves the nib's rhombic dot.
    quad([
      [p.x + ux * h, p.y + uy * h],
      [p.x + ux * h * 0.2 - uy * h * 0.9, p.y + uy * h * 0.2 + ux * h * 0.9],
      [p.x - ux * h, p.y - uy * h],
      [p.x - ux * h * 0.2 + uy * h * 0.9, p.y - uy * h * 0.2 - ux * h * 0.9],
    ]);
    return { d, box };
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    const hp = half(p.p);
    const hq = half(q.p);
    quad([
      [p.x + ux * hp, p.y + uy * hp],
      [q.x + ux * hq, q.y + uy * hq],
      [q.x - ux * hq, q.y - uy * hq],
      [p.x - ux * hp, p.y - uy * hp],
    ]);
  }
  return { d, box };
}

/** Moves path data so that (cx, cy) becomes the origin. Works for the M/L/Z paths built above. */
export function translatePath(d: string, cx: number, cy: number): string {
  return d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x, y) => `${fmt(Number(x) - cx, 3)},${fmt(Number(y) - cy, 3)}`);
}
