// Geometry of standalone elements (diacritics, dots, signs). The drawing is centred on the
// object's origin so that moving, rotating and scaling act around the element itself.
import type { MarkObject, MarkShape } from '../model/types';
import { getLoadedFont, type LoadedFont } from './fonts';
import { addPoint, emptyRect, fmt, isEmptyRect, scale, chain, translate, transformPath, transformRect, unionRect, type Rect } from './geom';
import { glyphOutline, shapeText } from './shape';

/** Fonts tried, in order, when the chosen font has no glyph for an element. */
export const FALLBACK_FONTS = ['amiri-quran', 'amiri', 'scheherazade'];

export interface MarkGeometry {
  d: string;
  box: Rect;
  /** font actually used (may be a fallback), null for dots */
  fontId: string | null;
}

const cache = new WeakMap<MarkObject, { key: string; geo: MarkGeometry }>();

const DOT_OFFSETS: Record<Exclude<MarkShape, 'glyph'>, [number, number][]> = {
  dot1: [[0, 0]],
  dot2h: [
    [-0.58, 0],
    [0.58, 0],
  ],
  dot2v: [
    [0, -0.58],
    [0, 0.58],
  ],
  dot3: [
    [0, -0.5],
    [-0.58, 0.5],
    [0.58, 0.5],
  ],
  dot3i: [
    [-0.58, -0.5],
    [0.58, -0.5],
    [0, 0.5],
  ],
};

/** A calligrapher's dot is the print of the nib: a rhombus, slightly taller than wide. */
function dotsGeometry(shape: Exclude<MarkShape, 'glyph'>, size: number): MarkGeometry {
  const w = size * 0.16;
  const hx = w * 0.5;
  const hy = w * 0.56;
  const box = emptyRect();
  let d = '';
  for (const [ox, oy] of DOT_OFFSETS[shape]) {
    const cx = ox * w * 1.15;
    const cy = oy * w * 1.15;
    const pts: [number, number][] = [
      [cx + hx * 0.18, cy - hy],
      [cx + hx, cy + hy * 0.08],
      [cx - hx * 0.18, cy + hy],
      [cx - hx, cy - hy * 0.08],
    ];
    d += pts.map(([x, y], i) => `${i ? 'L' : 'M'}${fmt(x)},${fmt(y)}`).join('') + 'Z';
    for (const [x, y] of pts) addPoint(box, x, y);
  }
  return { d, box, fontId: null };
}

function glyphGeometry(o: MarkObject, lf: LoadedFont): MarkGeometry | null {
  const run = shapeText(lf, o.text, []);
  if (!run.glyphs.length || run.glyphs.some((g) => g.gid === 0)) return null;
  const s = o.size / lf.upem;
  let pen = 0;
  const placed: { outline: ReturnType<typeof glyphOutline>; x: number; y: number }[] = [];
  let units = emptyRect();
  for (const g of run.glyphs) {
    const outline = glyphOutline(lf, g.gid);
    const x = pen + g.dx;
    const y = g.dy;
    pen += g.ax;
    if (!outline.box) continue;
    units = unionRect(units, transformRect(translate(x, y), outline.box));
    placed.push({ outline, x, y });
  }
  if (isEmptyRect(units)) return null;
  const cx = (units.minX + units.maxX) / 2;
  const cy = (units.minY + units.maxY) / 2;
  let d = '';
  let box = emptyRect();
  for (const p of placed) {
    const m = chain(scale(s, -s), translate(p.x - cx, p.y - cy));
    d += transformPath(p.outline.cmds, m);
    box = unionRect(box, transformRect(m, p.outline.box!));
  }
  return { d, box, fontId: lf.def.id };
}

/** Fonts to load so that an element can be drawn (its own font plus fallbacks). */
export function markFontIds(o: MarkObject): string[] {
  return o.shape === 'glyph' ? [o.fontId, ...FALLBACK_FONTS] : [];
}

export function markGeometry(o: MarkObject): MarkGeometry | null {
  const fontKey = markFontIds(o)
    .map((id) => (getLoadedFont(id) ? id : ''))
    .join(',');
  const hit = cache.get(o);
  if (hit && hit.key === fontKey) return hit.geo;
  let geo: MarkGeometry | null = null;
  if (o.shape !== 'glyph') geo = dotsGeometry(o.shape, o.size);
  else {
    for (const id of markFontIds(o)) {
      const lf = getLoadedFont(id);
      if (!lf) continue;
      geo = glyphGeometry(o, lf);
      if (geo) break;
    }
  }
  if (geo) cache.set(o, { key: fontKey, geo });
  return geo;
}
