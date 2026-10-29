import { apply, clamp, rotate, type Point } from '../engine/geom';
import type { GlyphOverride } from './types';

// A segment is turned or resized as one piece: every glyph keeps its own rotation/scale
// about its centre, and its offset is moved so the centres follow the group transform.
// `c` is the glyph's centre before its own edits and `g` the centre of the group, both in
// the line's local coordinates.

export function rotateInGroup(ov: GlyphOverride, c: Point, g: Point, deg: number): GlyphOverride {
  const v = apply(rotate(deg), c.x + ov.dx - g.x, c.y + ov.dy - g.y);
  return { ...ov, rotate: ov.rotate + deg, dx: g.x + v.x - c.x, dy: g.y + v.y - c.y };
}

export function scaleInGroup(ov: GlyphOverride, c: Point, g: Point, f: number): GlyphOverride {
  const scale = clamp(ov.scale * f, 0.05, 20);
  const k = scale / (ov.scale || 1);
  return { ...ov, scale, dx: g.x + k * (c.x + ov.dx - g.x) - c.x, dy: g.y + k * (c.y + ov.dy - g.y) - c.y };
}
