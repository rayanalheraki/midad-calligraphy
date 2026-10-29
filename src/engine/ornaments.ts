// Procedural ornaments, inspired by Kelk's K2kArt.dll (FancyBorder, FancyCircle, FancyLine,
// SimpleBorder, SimpleCircle). All geometry is centred on (0, 0) in millimetres.
import type { ShapeObject } from '../model/types';
import { fmt } from './geom';

export type PartRole = 'filled' | 'outline' | 'solid';
export interface ShapePart {
  d: string;
  role: PartRole;
}

const f = (n: number) => fmt(n, 3);

function rect(x: number, y: number, w: number, h: number): string {
  return `M${f(x)},${f(y)}H${f(x + w)}V${f(y + h)}H${f(x)}Z`;
}

function roundRect(x: number, y: number, w: number, h: number, r: number): string {
  r = Math.min(r, w / 2, h / 2);
  return (
    `M${f(x + r)},${f(y)}H${f(x + w - r)}A${f(r)},${f(r)} 0 0 1 ${f(x + w)},${f(y + r)}` +
    `V${f(y + h - r)}A${f(r)},${f(r)} 0 0 1 ${f(x + w - r)},${f(y + h)}` +
    `H${f(x + r)}A${f(r)},${f(r)} 0 0 1 ${f(x)},${f(y + h - r)}` +
    `V${f(y + r)}A${f(r)},${f(r)} 0 0 1 ${f(x + r)},${f(y)}Z`
  );
}

function circle(cx: number, cy: number, r: number): string {
  return `M${f(cx - r)},${f(cy)}A${f(r)},${f(r)} 0 1 0 ${f(cx + r)},${f(cy)}A${f(r)},${f(r)} 0 1 0 ${f(cx - r)},${f(cy)}Z`;
}

function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  return `M${f(cx - rx)},${f(cy)}A${f(rx)},${f(ry)} 0 1 0 ${f(cx + rx)},${f(cy)}A${f(rx)},${f(ry)} 0 1 0 ${f(cx - rx)},${f(cy)}Z`;
}

function polygon(points: [number, number][]): string {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)},${f(y)}`).join('') + 'Z';
}

function diamond(cx: number, cy: number, rx: number, ry: number): string {
  return polygon([
    [cx, cy - ry],
    [cx + rx, cy],
    [cx, cy + ry],
    [cx - rx, cy],
  ]);
}

export function starPoints(n: number, rOuter: number, rInner: number, rotation = -90): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const a = ((rotation + (i * 180) / n) * Math.PI) / 180;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts;
}

function squarePoints(r: number, rotationDeg: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < 4; i++) {
    const a = ((rotationDeg + 45 + i * 90) * Math.PI) / 180;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts;
}

export function shapeParts(o: Pick<ShapeObject, 'kind' | 'w' | 'h' | 'points' | 'inner'>): ShapePart[] {
  const w = Math.max(0.5, o.w);
  const h = Math.max(0.5, o.h);
  const x = -w / 2;
  const y = -h / 2;
  const n = Math.max(3, Math.min(64, Math.round(o.points)));
  const R = Math.min(w, h) / 2;
  switch (o.kind) {
    case 'frame':
      return [{ d: rect(x, y, w, h), role: 'filled' }];
    case 'roundFrame':
      return [{ d: roundRect(x, y, w, h, Math.min(w, h) * 0.08), role: 'filled' }];
    case 'doubleFrame': {
      const t = Math.max(1.5, Math.min(w, h) * 0.025);
      return [
        { d: rect(x, y, w, h), role: 'filled' },
        { d: rect(x + t, y + t, w - 2 * t, h - 2 * t), role: 'outline' },
      ];
    }
    case 'ornateFrame': {
      const t = Math.max(3, Math.min(w, h) * 0.05);
      const parts: ShapePart[] = [
        { d: rect(x, y, w, h), role: 'filled' },
        { d: rect(x + t, y + t, w - 2 * t, h - 2 * t), role: 'outline' },
      ];
      // Corner rosettes.
      for (const [cx, cy] of [
        [x + t / 2, y + t / 2],
        [x + w - t / 2, y + t / 2],
        [x + w - t / 2, y + h - t / 2],
        [x + t / 2, y + h - t / 2],
      ]) {
        parts.push({ d: circle(cx, cy, t * 0.42), role: 'outline' });
        parts.push({ d: diamond(cx, cy, t * 0.22, t * 0.22), role: 'solid' });
      }
      // Diamonds along the band, spaced by the density setting.
      const step = t * (2.2 + (1 - Math.min(1, Math.max(0.1, o.inner))) * 3);
      const along = (len: number) => Math.max(1, Math.floor((len - 2 * t) / step));
      const nx = along(w);
      const ny = along(h);
      for (let i = 1; i < nx; i++) {
        const cx = x + t + ((w - 2 * t) * i) / nx;
        parts.push({ d: diamond(cx, y + t / 2, t * 0.28, t * 0.3), role: 'solid' });
        parts.push({ d: diamond(cx, y + h - t / 2, t * 0.28, t * 0.3), role: 'solid' });
      }
      for (let i = 1; i < ny; i++) {
        const cy = y + t + ((h - 2 * t) * i) / ny;
        parts.push({ d: diamond(x + t / 2, cy, t * 0.3, t * 0.28), role: 'solid' });
        parts.push({ d: diamond(x + w - t / 2, cy, t * 0.3, t * 0.28), role: 'solid' });
      }
      return parts;
    }
    case 'arch': {
      // Pointed (mihrab) arch: two circular arcs meeting at the apex.
      const archR = w * 0.8;
      const rise = Math.min(h * 0.55, archR - Math.sqrt(Math.max(0, archR * archR - (w / 2) * (w / 2))) + w * 0.38);
      const springY = y + rise;
      const outer =
        `M${f(x)},${f(y + h)}V${f(springY)}` +
        `A${f(archR)},${f(archR)} 0 0 1 0,${f(y)}` +
        `A${f(archR)},${f(archR)} 0 0 1 ${f(x + w)},${f(springY)}V${f(y + h)}Z`;
      const t = Math.max(2, w * 0.04);
      const ix = x + t;
      const iw = w - 2 * t;
      const ir = archR - t;
      const innerD =
        `M${f(ix)},${f(y + h - t)}V${f(springY + t * 0.3)}` +
        `A${f(ir)},${f(ir)} 0 0 1 0,${f(y + t * 1.6)}` +
        `A${f(ir)},${f(ir)} 0 0 1 ${f(ix + iw)},${f(springY + t * 0.3)}V${f(y + h - t)}Z`;
      return [
        { d: outer, role: 'filled' },
        { d: innerD, role: 'outline' },
      ];
    }
    case 'circle':
      return [{ d: ellipse(0, 0, w / 2, h / 2), role: 'filled' }];
    case 'medallion': {
      // Shamsa: scalloped edge, inner rings.
      const parts: ShapePart[] = [];
      const scallop = (R * Math.PI) / n;
      let d = '';
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2;
        const a1 = ((i + 1) / n) * Math.PI * 2;
        const rr = R - scallop * 0.9;
        const p0 = [rr * Math.cos(a0), rr * Math.sin(a0)];
        const p1 = [rr * Math.cos(a1), rr * Math.sin(a1)];
        const am = (a0 + a1) / 2;
        const c = [(R + scallop * 0.35) * Math.cos(am), (R + scallop * 0.35) * Math.sin(am)];
        d += `${i ? '' : `M${f(p0[0])},${f(p0[1])}`}Q${f(c[0])},${f(c[1])} ${f(p1[0])},${f(p1[1])}`;
      }
      parts.push({ d: d + 'Z', role: 'filled' });
      parts.push({ d: circle(0, 0, R * 0.72), role: 'outline' });
      parts.push({ d: circle(0, 0, R * 0.64), role: 'outline' });
      return parts;
    }
    case 'rosette': {
      let d = '';
      const petalW = Math.PI / n;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const tip = [R * Math.cos(a), R * Math.sin(a)];
        const c1 = [R * 0.55 * Math.cos(a - petalW), R * 0.55 * Math.sin(a - petalW)];
        const c2 = [R * 0.55 * Math.cos(a + petalW), R * 0.55 * Math.sin(a + petalW)];
        d += `M0,0Q${f(c1[0])},${f(c1[1])} ${f(tip[0])},${f(tip[1])}Q${f(c2[0])},${f(c2[1])} 0,0Z`;
      }
      return [
        { d, role: 'filled' },
        { d: circle(0, 0, R * 0.18), role: 'filled' },
      ];
    }
    case 'star':
      return [{ d: polygon(starPoints(n, R, R * Math.max(0.15, Math.min(0.95, o.inner)))), role: 'filled' }];
    case 'khatam':
      // Two overlapping squares (rub el hizb / khatam).
      return [
        { d: polygon(squarePoints(R, 0)) + polygon(squarePoints(R, 45)), role: 'filled' },
        { d: circle(0, 0, R * 0.3), role: 'outline' },
      ];
    case 'divider': {
      const cy = 0;
      const t = Math.max(0.6, h * 0.12);
      const parts: ShapePart[] = [
        { d: `M${f(x)},${f(cy)}H${f(-h * 0.9)}M${f(h * 0.9)},${f(cy)}H${f(x + w)}`, role: 'outline' },
        { d: diamond(0, cy, h * 0.75, h / 2), role: 'solid' },
        { d: diamond(x + t, cy, t, t), role: 'solid' },
        { d: diamond(x + w - t, cy, t, t), role: 'solid' },
      ];
      const dots = Math.max(0, Math.round((w / h) / 4));
      for (let i = 1; i <= dots; i++) {
        const off = (h * 0.9) + ((w / 2 - h * 0.9) * i) / (dots + 1);
        parts.push({ d: circle(off, cy, t * 0.8), role: 'solid' });
        parts.push({ d: circle(-off, cy, t * 0.8), role: 'solid' });
      }
      return parts;
    }
    case 'rhombus':
      return [{ d: diamond(0, 0, w / 2, h / 2), role: 'solid' }];
    default:
      return [{ d: rect(x, y, w, h), role: 'filled' }];
  }
}
