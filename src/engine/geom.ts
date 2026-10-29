// 2D affine matrices in SVG order: [a, b, c, d, e, f] maps (x, y) to (a*x + c*y + e, b*x + d*y + f).
export type Matrix = [number, number, number, number, number, number];
export interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
export interface Point {
  x: number;
  y: number;
}

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Returns m1 · m2 (m2 is applied first). */
export function mul(m1: Matrix, m2: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export function chain(...ms: Matrix[]): Matrix {
  return ms.reduce((acc, m) => mul(acc, m), IDENTITY);
}

export const translate = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y];
export const scale = (sx: number, sy = sx): Matrix => [sx, 0, 0, sy, 0, 0];
export function rotate(deg: number): Matrix {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, s, -s, c, 0, 0];
}
export function rotateAbout(deg: number, cx: number, cy: number): Matrix {
  return chain(translate(cx, cy), rotate(deg), translate(-cx, -cy));
}

export function apply(m: Matrix, x: number, y: number): Point {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

export function invert(m: Matrix): Matrix {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c || 1e-12;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

export function emptyRect(): Rect {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

export function isEmptyRect(r: Rect): boolean {
  return !(r.maxX >= r.minX && r.maxY >= r.minY);
}

export function addPoint(r: Rect, x: number, y: number): void {
  if (x < r.minX) r.minX = x;
  if (y < r.minY) r.minY = y;
  if (x > r.maxX) r.maxX = x;
  if (y > r.maxY) r.maxY = y;
}

export function unionRect(a: Rect, b: Rect): Rect {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export function transformRect(m: Matrix, r: Rect): Rect {
  const out = emptyRect();
  if (isEmptyRect(r)) return out;
  for (const [x, y] of [
    [r.minX, r.minY],
    [r.maxX, r.minY],
    [r.maxX, r.maxY],
    [r.minX, r.maxY],
  ]) {
    const p = apply(m, x, y);
    addPoint(out, p.x, p.y);
  }
  return out;
}

export function rectCorners(m: Matrix, r: Rect): Point[] {
  return [
    apply(m, r.minX, r.minY),
    apply(m, r.maxX, r.minY),
    apply(m, r.maxX, r.maxY),
    apply(m, r.minX, r.maxY),
  ];
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function fmt(n: number, digits = 3): string {
  if (!Number.isFinite(n)) return '0';
  const v = Number(n.toFixed(digits));
  return Object.is(v, -0) ? '0' : String(v);
}

export function matrixToSvg(m: Matrix): string {
  return `matrix(${m.map((v) => fmt(v, 5)).join(' ')})`;
}

export interface PathCommand {
  type: string;
  values: number[];
}

/** Applies a matrix to absolute M/L/Q/C/Z path commands and serializes them. */
export function transformPath(cmds: PathCommand[], m: Matrix, digits = 3): string {
  let out = '';
  for (const cmd of cmds) {
    const v = cmd.values;
    out += cmd.type;
    for (let i = 0; i + 1 < v.length; i += 2) {
      const p = apply(m, v[i], v[i + 1]);
      out += (i ? ' ' : '') + fmt(p.x, digits) + ',' + fmt(p.y, digits);
    }
  }
  return out;
}

export function objectMatrix(o: { x: number; y: number; rotation: number; scaleX: number; scaleY: number }): Matrix {
  return chain(translate(o.x, o.y), rotate(o.rotation), scale(o.scaleX, o.scaleY));
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
