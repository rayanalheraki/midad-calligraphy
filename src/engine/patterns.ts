// Background pattern tiles (geometric Islamic motifs), sizes in millimetres.
import type { PatternKind } from '../model/types';
import { fmt } from './geom';

function starPoints(n: number, rOuter: number, rInner: number, rotation = -90): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const a = ((rotation + (i * 180) / n) * Math.PI) / 180;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts;
}

export interface PatternTile {
  w: number;
  h: number;
  d: string;
  mode: 'fill' | 'stroke';
}

const f = (n: number) => fmt(n, 3);

function poly(points: [number, number][], ox = 0, oy = 0): string {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x + ox)},${f(y + oy)}`).join('') + 'Z';
}

function circle(cx: number, cy: number, r: number): string {
  return `M${f(cx - r)},${f(cy)}A${f(r)},${f(r)} 0 1 0 ${f(cx + r)},${f(cy)}A${f(r)},${f(r)} 0 1 0 ${f(cx - r)},${f(cy)}Z`;
}

function hexagon(cx: number, cy: number, r: number): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const a = ((-90 + i * 60) * Math.PI) / 180;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return poly(pts);
}

export const PATTERN_LABELS: Record<PatternKind, string> = {
  none: 'بدون',
  dots: 'نقاط',
  grid: 'شبكة',
  diagonal: 'خطوط مائلة',
  stars8: 'نجوم ثمانية',
  hexagons: 'خلايا سداسية',
  circles: 'دوائر متداخلة',
  lattice: 'معيّنات',
};

export function patternTile(kind: PatternKind, size: number): PatternTile | null {
  const s = Math.max(3, size);
  switch (kind) {
    case 'dots':
      return { w: s, h: s, d: circle(s / 2, s / 2, s * 0.09), mode: 'fill' };
    case 'grid':
      return { w: s, h: s, d: `M0,0H${f(s)}M0,0V${f(s)}`, mode: 'stroke' };
    case 'diagonal':
      return { w: s, h: s, d: `M0,${f(s)}L${f(s)},0M${f(-s / 2)},${f(s / 2)}L${f(s / 2)},${f(-s / 2)}M${f(s / 2)},${f(s * 1.5)}L${f(s * 1.5)},${f(s / 2)}`, mode: 'stroke' };
    case 'stars8': {
      const r = s * 0.42;
      const square = (rot: number) => {
        const pts: [number, number][] = [];
        for (let i = 0; i < 4; i++) {
          const a = ((rot + 45 + i * 90) * Math.PI) / 180;
          pts.push([r * Math.cos(a), r * Math.sin(a)]);
        }
        return pts;
      };
      const star = poly(square(0), s / 2, s / 2) + poly(square(45), s / 2, s / 2);
      const cross = starPoints(4, s * 0.14, s * 0.05, 0);
      const corners = [
        [0, 0],
        [s, 0],
        [0, s],
        [s, s],
      ].map(([cx, cy]) => poly(cross, cx, cy));
      return { w: s, h: s, d: star + corners.join(''), mode: 'stroke' };
    }
    case 'hexagons': {
      const r = s / 2;
      const w = Math.sqrt(3) * r;
      const h = 3 * r;
      const d = hexagon(w / 2, r, r) + hexagon(0, 2.5 * r, r) + hexagon(w, 2.5 * r, r) + hexagon(0, -0.5 * r, r) + hexagon(w, -0.5 * r, r);
      return { w, h, d, mode: 'stroke' };
    }
    case 'circles': {
      const r = s / 2;
      const d = circle(r, r, r) + circle(0, 0, r) + circle(s, 0, r) + circle(0, s, r) + circle(s, s, r);
      return { w: s, h: s, d, mode: 'stroke' };
    }
    case 'lattice': {
      const d = poly([
        [0, s / 2],
        [s / 2, 0],
        [s, s / 2],
        [s / 2, s],
      ]) + circle(0, 0, s * 0.08) + circle(s, 0, s * 0.08) + circle(0, s, s * 0.08) + circle(s, s, s * 0.08) + circle(s / 2, s / 2, s * 0.08);
      return { w: s, h: s, d, mode: 'stroke' };
    }
    default:
      return null;
  }
}
