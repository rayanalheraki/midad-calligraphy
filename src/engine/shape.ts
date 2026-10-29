import type { PathCommand, Rect } from './geom';
import type { LoadedFont } from './fonts';

export interface ShapedGlyph {
  gid: number;
  /** UTF-16 index into the shaped text */
  cluster: number;
  ax: number;
  dx: number;
  dy: number;
  mark: boolean;
  /** HarfBuzz says a tatweel may be inserted after this glyph without breaking the shaping */
  tatweelSafe: boolean;
}

export interface ShapedRun {
  glyphs: ShapedGlyph[];
  /** total advance in font units */
  width: number;
}

const RUN_CACHE_LIMIT = 600;
const runCache = new Map<string, ShapedRun>();
const outlineCache = new WeakMap<LoadedFont, Map<number, GlyphOutline>>();
const classCache = new WeakMap<LoadedFont, Map<number, boolean>>();

export interface GlyphOutline {
  cmds: PathCommand[];
  /** bounding box in font units, y-up */
  box: Rect | null;
}

function isMarkGlyph(lf: LoadedFont, gid: number): boolean {
  let m = classCache.get(lf);
  if (!m) classCache.set(lf, (m = new Map()));
  let v = m.get(gid);
  if (v === undefined) {
    v = lf.face.getGlyphClass(gid) === 3;
    m.set(gid, v);
  }
  return v;
}

export function shapeText(lf: LoadedFont, text: string, features: string[]): ShapedRun {
  const key = `${lf.def.id}|${features.join(',')}|${text}`;
  const hit = runCache.get(key);
  if (hit) {
    runCache.delete(key);
    runCache.set(key, hit);
    return hit;
  }
  const { hb } = lf;
  const buf = new hb.Buffer();
  buf.addText(text);
  buf.setDirection(hb.Direction.RTL);
  buf.setScript('Arab');
  buf.setLanguage(lf.def.lang);
  buf.setClusterLevel(hb.ClusterLevel.MONOTONE_CHARACTERS);
  buf.setFlags(
    hb.BufferFlag.BOT | hb.BufferFlag.EOT | hb.BufferFlag.DO_NOT_INSERT_DOTTED_CIRCLE | hb.BufferFlag.PRODUCE_SAFE_TO_INSERT_TATWEEL,
  );
  hb.shape(lf.font, buf, features.map((f) => new hb.Feature(f, 1)));
  const raw = buf.getGlyphInfosAndPositions();
  const glyphs: ShapedGlyph[] = [];
  let width = 0;
  for (const g of raw) {
    const ax = g.xAdvance ?? 0;
    glyphs.push({
      gid: g.codepoint,
      cluster: g.cluster,
      ax,
      dx: g.xOffset ?? 0,
      dy: g.yOffset ?? 0,
      mark: isMarkGlyph(lf, g.codepoint),
      tatweelSafe: (g.flags & hb.GlyphFlag.SAFE_TO_INSERT_TATWEEL) !== 0,
    });
    width += ax;
  }
  const run = { glyphs, width };
  runCache.set(key, run);
  if (runCache.size > RUN_CACHE_LIMIT) {
    const oldest = runCache.keys().next().value;
    if (oldest !== undefined) runCache.delete(oldest);
  }
  return run;
}

export function glyphOutline(lf: LoadedFont, gid: number): GlyphOutline {
  let m = outlineCache.get(lf);
  if (!m) outlineCache.set(lf, (m = new Map()));
  let o = m.get(gid);
  if (!o) {
    const cmds = lf.font.glyphToJson(gid) as PathCommand[];
    const ext = lf.font.glyphExtents(gid);
    const box: Rect | null =
      cmds.length && ext
        ? {
            minX: ext.xBearing,
            maxX: ext.xBearing + ext.width,
            maxY: ext.yBearing,
            minY: ext.yBearing + ext.height,
          }
        : null;
    o = { cmds, box };
    m.set(gid, o);
  }
  return o;
}

/** Width in millimetres of `text` at `size` mm per em, including extra word spacing. */
export function measureText(lf: LoadedFont, text: string, features: string[], size: number, wordSpacing: number): number {
  const run = shapeText(lf, text, features);
  let spaces = 0;
  for (const ch of text) if (ch === ' ' || ch === ' ') spaces++;
  return (run.width * size) / lf.upem + spaces * wordSpacing;
}
