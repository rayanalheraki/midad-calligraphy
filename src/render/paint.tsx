import type { ReactNode } from 'react';
import type { Fill, Shadow } from '../model/types';
import { fmt, type Rect } from '../engine/geom';

const GOLD = ['#7a5a12', '#e9cf7a', '#a67c1f', '#f6e6ad', '#8a6516'];
const SILVER = ['#5f6873', '#e6e9ef', '#959fab', '#f6f7f9', '#727b86'];

function gradientLine(box: Rect, angleDeg: number) {
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  const a = (angleDeg * Math.PI) / 180;
  const half = (Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))) / 2 || 1;
  return {
    x1: fmt(cx - half * Math.cos(a)),
    y1: fmt(cy - half * Math.sin(a)),
    x2: fmt(cx + half * Math.cos(a)),
    y2: fmt(cy + half * Math.sin(a)),
  };
}

/** Returns the paint value for `fill` plus any <defs> it needs, spanning `box` in user space. */
export function paintFor(id: string, fill: Fill, box: Rect): { paint: string; defs: ReactNode } {
  if (fill.kind === 'solid') return { paint: fill.color, defs: null };
  const gid = `fill-${id}`;
  if (fill.kind === 'linear') {
    return {
      paint: `url(#${gid})`,
      defs: (
        <linearGradient id={gid} gradientUnits="userSpaceOnUse" {...gradientLine(box, fill.angle)}>
          <stop offset="0" stopColor={fill.from} />
          <stop offset="1" stopColor={fill.to} />
        </linearGradient>
      ),
    };
  }
  const stops = fill.kind === 'gold' ? GOLD : SILVER;
  return {
    paint: `url(#${gid})`,
    defs: (
      <linearGradient id={gid} gradientUnits="userSpaceOnUse" {...gradientLine(box, 90)}>
        {stops.map((c, i) => (
          <stop key={i} offset={fmt(i / (stops.length - 1))} stopColor={c} />
        ))}
      </linearGradient>
    ),
  };
}

export function shadowFilter(id: string, shadow: Shadow | null): { filter?: string; defs: ReactNode } {
  if (!shadow) return { defs: null };
  const fid = `shadow-${id}`;
  return {
    filter: `url(#${fid})`,
    defs: (
      <filter id={fid} x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
        <feDropShadow dx={fmt(shadow.dx)} dy={fmt(shadow.dy)} stdDeviation={fmt(Math.max(0, shadow.blur) / 2)} floodColor={shadow.color} floodOpacity="0.8" />
      </filter>
    ),
  };
}

export function swatchCss(fill: Fill | null): string {
  if (!fill) return 'transparent';
  if (fill.kind === 'solid') return fill.color;
  if (fill.kind === 'linear') return `linear-gradient(${90 - fill.angle}deg, ${fill.from}, ${fill.to})`;
  const stops = fill.kind === 'gold' ? GOLD : SILVER;
  return `linear-gradient(180deg, ${stops.join(', ')})`;
}
