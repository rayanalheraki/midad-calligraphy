import type { TextObject } from '../model/types';
import { insertKashida, justifyCounts, kashidaCounts, segmentOf } from './arabic';
import type { LoadedFont } from './fonts';
import {
  IDENTITY,
  apply,
  chain,
  emptyRect,
  isEmptyRect,
  rotate,
  rotateAbout,
  scale,
  transformPath,
  transformRect,
  translate,
  unionRect,
  type Matrix,
  type Point,
  type Rect,
} from './geom';
import { glyphOutline, measureText, shapeText } from './shape';
import { glyphByName } from './gsub';
import { stretchCut, stretchOutline } from './stretch';

/** Longest lengthening of one letter, in ems. */
export const MAX_STRETCH_EM = 8;

export interface PlacedGlyph {
  /** stable key used for per-glyph overrides: "<origin index>[k].<n>" */
  key: string;
  /** path data in the object's local coordinates (mm) */
  d: string;
  bbox: Rect;
  center: Point;
  /** centre before the glyph's own move/rotate/scale edits */
  baseCenter: Point;
  mark: boolean;
  kashida: boolean;
  /** UTF-16 index of the source character in the object's text */
  origin: number;
  /** connected segment (UTF-16 index of its first letter), -1 for spaces */
  seg: number;
  /** glyph produced by shaping, and the glyph drawn (differs when an alternate is chosen) */
  gid: number;
  drawnGid: number;
  /** the letter has a flat stroke that can be lengthened */
  stretchable: boolean;
  /** joined to the next letter (on its left) */
  joinsLeft: boolean;
  color: string | null;
  hidden: boolean;
}

export interface TextGeometry {
  glyphs: PlacedGlyph[];
  /** bounds of one copy, local coordinates */
  baseBox: Rect;
  /** bounds including repeats and mirror copies */
  box: Rect;
  copies: Matrix[];
  /** natural width of the shaped line in mm */
  width: number;
  shapedText: string;
}

const cache = new WeakMap<TextObject, { lf: LoadedFont; geo: TextGeometry }>();

export function textGeometry(obj: TextObject, lf: LoadedFont): TextGeometry {
  const hit = cache.get(obj);
  if (hit && hit.lf === lf) return hit.geo;
  const geo = computeTextGeometry(obj, lf);
  cache.set(obj, { lf, geo });
  return geo;
}

function curvePoint(obj: TextObject, xc: number, totalWidth: number): { p: Point; angle: number } {
  const path = obj.path;
  if (path.mode === 'arc' || path.mode === 'circle') {
    let r: number;
    if (path.mode === 'arc') r = Math.max(5, Math.abs(path.radius));
    else r = Math.max(2, totalWidth / ((Math.max(20, Math.min(359, path.sweep)) * Math.PI) / 180));
    if (path.flip) r = -r;
    const phi = xc / r;
    return { p: { x: r * Math.sin(phi), y: r - r * Math.cos(phi) }, angle: (phi * 180) / Math.PI };
  }
  if (path.mode === 'wave') {
    const lambda = Math.max(5, path.wavelength);
    const amp = path.flip ? -path.amplitude : path.amplitude;
    const k = (2 * Math.PI) / lambda;
    return { p: { x: xc, y: amp * Math.sin(k * xc) }, angle: (Math.atan(amp * k * Math.cos(k * xc)) * 180) / Math.PI };
  }
  return { p: { x: xc, y: 0 }, angle: 0 };
}

const VARIANT_RE = /^-?[a-z0-9]{4}(?:=\d{1,3})?$/;

export function computeTextGeometry(obj: TextObject, lf: LoadedFont): TextGeometry {
  const features = obj.features.filter((f) => lf.optionalFeatures.includes(f));
  const useKashida = lf.def.kashida;
  let counts = useKashida ? kashidaCounts(obj.text, obj.kashida, obj.kashidaAt) : new Map<number, number>();
  if (useKashida && obj.justifyWidth > 0) {
    counts = justifyCounts(obj.text, counts, obj.justifyWidth, (t) => measureText(lf, t, features, obj.size, obj.wordSpacing));
  }
  const kt = insertKashida(obj.text, counts);
  const segOf = segmentOf(obj.text);

  // A segment's chosen variant becomes feature settings limited to its range of the text.
  const ranged: string[] = [];
  const variants = Object.entries(obj.segVariants ?? {});
  if (variants.length) {
    const ranges = new Map<number, [number, number]>();
    for (let i = 0; i < kt.text.length; i++) {
      const sg = segOf[kt.origin[i]] ?? -1;
      if (sg < 0) continue;
      const r = ranges.get(sg);
      if (r) r[1] = i + 1;
      else ranges.set(sg, [i, i + 1]);
    }
    for (const [key, specs] of variants) {
      const r = ranges.get(Number(key));
      if (r) for (const spec of specs) if (VARIANT_RE.test(spec)) ranged.push(`${spec}@${r[0]}:${r[1]}`);
    }
  }
  const run = shapeText(lf, kt.text, [...features, ...ranged]);
  const s = obj.size / lf.upem;
  const spaceExtra = obj.wordSpacing / s;
  const n = run.glyphs.length;

  // Stable keys, segments and the letters each mark sits on.
  const keys: string[] = [];
  const origins: number[] = [];
  const segs: number[] = [];
  const kashida: boolean[] = [];
  const occurrences = new Map<string, number>();
  for (const g of run.glyphs) {
    const origin = kt.origin[g.cluster] ?? 0;
    const isKashida = kt.inserted[g.cluster] ?? false;
    const keyBase = `${origin}${isKashida ? 'k' : ''}`;
    const k = occurrences.get(keyBase) ?? 0;
    occurrences.set(keyBase, k + 1);
    keys.push(`${keyBase}.${k}`);
    origins.push(origin);
    segs.push(segOf[origin] ?? -1);
    kashida.push(isKashida);
  }
  // Zero-advance glyphs (marks) belong to the next glyph with an advance.
  const baseOf: number[] = [];
  for (let i = 0; i < n; i++) {
    let b = i;
    if (run.glyphs[i].ax === 0) {
      for (let j = i + 1; j < n; j++) {
        if (run.glyphs[j].ax > 0) {
          b = j;
          break;
        }
      }
    }
    baseOf.push(b);
  }

  // Alternate forms and lengthening change the drawn glyph and its advance.
  const gids: number[] = [];
  const advOrig: number[] = [];
  const adv: number[] = [];
  const cuts: (number | null)[] = [];
  const deltas: number[] = [];
  const joinsLeft: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const g = run.glyphs[i];
    const ch = kt.text[g.cluster];
    const extra = ch === ' ' || ch === ' ' ? spaceExtra : 0;
    const ov = obj.glyphs[keys[i]];
    let gid = g.gid;
    let ax = g.ax;
    if (ov?.alt) {
      const alt = glyphByName(lf, ov.alt);
      if (alt !== undefined && alt !== gid && glyphOutline(lf, alt).box) {
        if (ax !== 0) ax += lf.font.glyphHAdvance(alt) - lf.font.glyphHAdvance(gid);
        gid = alt;
      }
    }
    let left = false;
    for (let j = i - 1; j >= 0 && segs[i] >= 0 && segs[j] === segs[i]; j--) {
      if (!run.glyphs[j].mark) {
        left = true;
        break;
      }
    }
    const cut = g.mark ? null : stretchCut(lf, gid, left || kashida[i]);
    const delta = cut !== null && ov?.stretch ? Math.min(MAX_STRETCH_EM, Math.max(0, ov.stretch)) * lf.upem : 0;
    gids.push(gid);
    advOrig.push(g.ax + extra);
    adv.push(ax + extra + delta);
    cuts.push(cut);
    deltas.push(delta);
    joinsLeft.push(left);
  }

  // Pen positions in font units (visual order, left to right).
  const pens: number[] = [];
  const pensOrig: number[] = [];
  let pen = 0;
  let penOrig = 0;
  for (let i = 0; i < n; i++) {
    pens.push(pen);
    pensOrig.push(penOrig);
    pen += adv[i];
    penOrig += advOrig[i];
  }
  const totalUnits = pen;
  const totalMm = totalUnits * s;

  const glyphs: PlacedGlyph[] = [];
  let baseBox = emptyRect();

  for (let i = 0; i < n; i++) {
    const g = run.glyphs[i];
    const key = keys[i];
    const outline = glyphOutline(lf, gids[i]);
    if (!outline.box) continue;
    if (g.mark && obj.hideMarks) continue;

    let cmds = outline.cmds;
    let box = outline.box;
    const cut = cuts[i];
    if (deltas[i] && cut !== null) {
      cmds = stretchOutline(cmds, cut, deltas[i], lf.upem);
      box = { ...box, minX: box.minX + (box.minX >= cut ? deltas[i] : 0), maxX: box.maxX + (box.maxX > cut ? deltas[i] : 0) };
    }

    // A mark keeps its place on its letter when that letter is lengthened or replaced.
    let x = pens[i] + g.dx;
    const b = baseOf[i];
    if (g.mark && b !== i && (deltas[b] || gids[b] !== run.glyphs[b].gid)) {
      const rel = pensOrig[i] + g.dx - pensOrig[b];
      const bc = cuts[b];
      x = pens[b] + rel + (deltas[b] && bc !== null && rel > bc ? deltas[b] : 0);
    }
    const xcMm = (pens[b] + adv[b] / 2 - totalUnits / 2) * s;
    const originX = (x - totalUnits / 2) * s;
    const originY = -g.dy * s;
    const { p, angle } = curvePoint(obj, xcMm, totalMm);
    let m: Matrix = chain(translate(p.x, p.y), rotate(angle), translate(originX - xcMm, originY), scale(s, -s));

    const raw = transformRect(m, box);
    const baseCenter = { x: (raw.minX + raw.maxX) / 2, y: (raw.minY + raw.maxY) / 2 };
    const ov = obj.glyphs[key];
    if (ov && (ov.dx || ov.dy || ov.rotate || ov.scale !== 1)) {
      const { x: cx, y: cy } = baseCenter;
      m = chain(translate(ov.dx, ov.dy), translate(cx, cy), rotate(ov.rotate), scale(ov.scale || 1), translate(-cx, -cy), m);
    }
    const bbox = transformRect(m, box);
    const center = apply(m, (box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2);
    const hidden = !!ov?.hidden;
    glyphs.push({
      key,
      d: transformPath(cmds, m),
      bbox,
      center,
      baseCenter,
      mark: g.mark,
      kashida: kashida[i],
      origin: origins[i],
      seg: segs[i],
      gid: g.gid,
      drawnGid: gids[i],
      stretchable: cut !== null,
      joinsLeft: joinsLeft[i],
      color: ov?.color ?? (g.mark && obj.markColor ? obj.markColor : null),
      hidden,
    });
    if (!hidden) baseBox = unionRect(baseBox, bbox);
  }
  if (isEmptyRect(baseBox)) baseBox = { minX: -obj.size, minY: -obj.size, maxX: obj.size, maxY: obj.size * 0.4 };

  // Copies: rotational repeat then mirror (musanna).
  let copies: Matrix[] = [IDENTITY];
  const count = Math.max(1, Math.min(72, Math.round(obj.repeat.count)));
  if (count > 1) {
    copies = [];
    for (let k = 0; k < count; k++) copies.push(rotateAbout(k * obj.repeat.angle, 0, obj.repeat.offset));
  }
  let box = copies.reduce((acc, c) => unionRect(acc, transformRect(c, baseBox)), emptyRect());
  // Mirror pairs are laid out symmetrically around the anchor, the gap straddling it.
  if (obj.mirror === 'x') {
    const shift = translate(obj.mirrorGap / 2 - box.minX, 0);
    const original = copies.map((c) => chain(shift, c));
    copies = [...original, ...original.map((c) => chain(scale(-1, 1), c))];
  } else if (obj.mirror === 'y') {
    const shift = translate(0, -obj.mirrorGap / 2 - box.maxY);
    const original = copies.map((c) => chain(shift, c));
    copies = [...original, ...original.map((c) => chain(scale(1, -1), c))];
  }
  box = copies.reduce((acc, c) => unionRect(acc, transformRect(c, baseBox)), emptyRect());

  return { glyphs, baseBox, box, copies, width: totalMm, shapedText: kt.text };
}

/** Kashida slot letter indices available for the per-letter tool. */
export { kashidaSlots } from './arabic';
