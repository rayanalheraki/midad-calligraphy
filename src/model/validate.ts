// Validation and sanitisation of documents loaded from files or storage.
// Only known fields are copied, numbers are clamped, colours must be #rrggbb and
// embedded images must be base64 data URLs of raster formats. Anything else is dropped.
import { clamp } from '../engine/geom';
import { findFontDef, DEFAULT_FONT_ID } from '../engine/fonts';
import { createPage, createShape, createText, defaultBackground, defaultGlyphOverride, uid } from './defaults';
import type {
  Background,
  DocObject,
  Fill,
  GlyphOverride,
  KelkDoc,
  Page,
  PatternKind,
  Shadow,
  ShapeKind,
  StrokeStyle,
  TextObject,
} from './types';

export const LIMITS = {
  maxPages: 200,
  maxObjectsPerPage: 2000,
  maxTextChars: 5000,
  maxImageChars: 15 * 1024 * 1024,
  maxPathChars: 2 * 1024 * 1024,
  maxGlyphOverrides: 5000,
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

export const num = (v: unknown, d: number, min = -1e6, max = 1e6): number =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(v, min, max) : d;
export const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
export const color = (v: unknown, d: string): string =>
  typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : d;
const str = (v: unknown, d: string, max: number): string => (typeof v === 'string' ? v.slice(0, max) : d);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], d: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : d;

const IMAGE_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/;
export function safeImageSrc(v: unknown): string | null {
  return typeof v === 'string' && v.length <= LIMITS.maxImageChars && IMAGE_RE.test(v) ? v : null;
}

const PATH_RE = /^[MLHVZmlhvzQqCcAa0-9.,\s-]*$/;
function safePath(v: unknown): string | null {
  return typeof v === 'string' && v.length <= LIMITS.maxPathChars && PATH_RE.test(v) ? v : null;
}

function fill(v: unknown, d: Fill): Fill {
  if (!isObj(v)) return d;
  switch (v.kind) {
    case 'solid':
      return { kind: 'solid', color: color(v.color, '#1b1e27') };
    case 'linear':
      return { kind: 'linear', from: color(v.from, '#1f3a73'), to: color(v.to, '#c9a23a'), angle: num(v.angle, 90, -360, 360) };
    case 'gold':
      return { kind: 'gold' };
    case 'silver':
      return { kind: 'silver' };
    default:
      return d;
  }
}

function stroke(v: unknown): StrokeStyle | null {
  if (!isObj(v)) return null;
  return { color: color(v.color, '#1b1e27'), width: num(v.width, 0.5, 0, 50) };
}

function shadow(v: unknown): Shadow | null {
  if (!isObj(v)) return null;
  return { color: color(v.color, '#000000'), blur: num(v.blur, 1, 0, 50), dx: num(v.dx, 0.6, -100, 100), dy: num(v.dy, 0.6, -100, 100) };
}

function base(v: Obj) {
  return {
    name: str(v.name, '', 120),
    x: num(v.x, 100, -10000, 10000),
    y: num(v.y, 100, -10000, 10000),
    rotation: num(v.rotation, 0, -3600, 3600),
    scaleX: num(v.scaleX, 1, -100, 100) || 1,
    scaleY: num(v.scaleY, 1, -100, 100) || 1,
    opacity: num(v.opacity, 1, 0, 1),
    locked: bool(v.locked, false),
    hidden: bool(v.hidden, false),
  };
}

function glyphOverrides(v: unknown): Record<string, GlyphOverride> {
  const out: Record<string, GlyphOverride> = {};
  if (!isObj(v)) return out;
  let n = 0;
  for (const [k, g] of Object.entries(v)) {
    if (++n > LIMITS.maxGlyphOverrides) break;
    if (!/^\d+k?\.\d+$/.test(k) || !isObj(g)) continue;
    const d = defaultGlyphOverride();
    out[k] = {
      dx: num(g.dx, d.dx, -1000, 1000),
      dy: num(g.dy, d.dy, -1000, 1000),
      rotate: num(g.rotate, d.rotate, -3600, 3600),
      scale: num(g.scale, d.scale, 0.05, 20),
      color: g.color == null ? null : color(g.color, '#1b1e27'),
      hidden: bool(g.hidden, false),
    };
  }
  return out;
}

const SHAPES: readonly ShapeKind[] = ['frame', 'doubleFrame', 'ornateFrame', 'roundFrame', 'arch', 'circle', 'medallion', 'rosette', 'star', 'khatam', 'divider', 'rhombus'];
const PATTERNS: readonly PatternKind[] = ['none', 'dots', 'grid', 'diagonal', 'stars8', 'hexagons', 'circles', 'lattice'];

function textObject(v: Obj, warnings: string[]): TextObject {
  const d = createText();
  let fontId = str(v.fontId, DEFAULT_FONT_ID, 80);
  if (!findFontDef(fontId)) {
    warnings.push(`الخط «${fontId}» غير متوفر، استُخدم خط أميري بدلًا منه.`);
    fontId = DEFAULT_FONT_ID;
  }
  const path = isObj(v.path) ? v.path : {};
  const repeat = isObj(v.repeat) ? v.repeat : {};
  const kashidaAt: Record<string, number> = {};
  if (isObj(v.kashidaAt)) {
    for (const [k, n] of Object.entries(v.kashidaAt)) if (/^\d+$/.test(k)) kashidaAt[k] = num(n, 0, 0, 24);
  }
  return {
    ...d,
    ...base(v),
    id: uid('t'),
    type: 'text',
    text: str(v.text, '', LIMITS.maxTextChars),
    fontId,
    size: num(v.size, 18, 0.5, 2000),
    wordSpacing: num(v.wordSpacing, 0, -200, 500),
    kashida: num(v.kashida, 0, 0, 24),
    kashidaAt,
    justifyWidth: num(v.justifyWidth, 0, 0, 10000),
    features: Array.isArray(v.features) ? v.features.filter((f): f is string => typeof f === 'string' && /^[a-z0-9]{4}$/.test(f)).slice(0, 30) : [],
    path: {
      mode: oneOf(path.mode, ['straight', 'arc', 'circle', 'wave'] as const, 'straight'),
      radius: num(path.radius, 80, 5, 5000),
      sweep: num(path.sweep, 300, 20, 359),
      amplitude: num(path.amplitude, 6, -500, 500),
      wavelength: num(path.wavelength, 60, 5, 5000),
      flip: bool(path.flip, false),
    },
    repeat: {
      count: Math.round(num(repeat.count, 1, 1, 72)),
      angle: num(repeat.angle, 45, -360, 360),
      offset: num(repeat.offset, 0, -5000, 5000),
    },
    mirror: oneOf(v.mirror, ['none', 'x', 'y'] as const, 'none'),
    mirrorGap: num(v.mirrorGap, 4, -500, 500),
    fill: fill(v.fill, d.fill),
    stroke: stroke(v.stroke),
    shadow: shadow(v.shadow),
    hideMarks: bool(v.hideMarks, false),
    markColor: v.markColor == null ? null : color(v.markColor, '#b4402f'),
    glyphs: glyphOverrides(v.glyphs),
  };
}

function object(v: unknown, warnings: string[]): DocObject | null {
  if (!isObj(v)) return null;
  switch (v.type) {
    case 'text':
      return textObject(v, warnings);
    case 'shape': {
      const kind = oneOf(v.kind, SHAPES, 'frame');
      const d = createShape(kind);
      return {
        ...d,
        ...base(v),
        id: uid('s'),
        kind,
        w: num(v.w, d.w, 0.5, 10000),
        h: num(v.h, d.h, 0.5, 10000),
        points: Math.round(num(v.points, d.points, 3, 64)),
        inner: num(v.inner, d.inner, 0.05, 0.98),
        fill: v.fill == null ? null : fill(v.fill, { kind: 'solid', color: '#1b1e27' }),
        stroke: stroke(v.stroke),
        shadow: shadow(v.shadow),
      };
    }
    case 'image': {
      const src = safeImageSrc(v.src);
      if (!src) {
        warnings.push('أُهملت صورة لأن مصدرها ليس صورة مضمّنة آمنة.');
        return null;
      }
      return { ...base(v), id: uid('i'), type: 'image', src, w: num(v.w, 50, 0.5, 10000), h: num(v.h, 50, 0.5, 10000) };
    }
    case 'ink': {
      const d = safePath(v.d);
      if (!d) return null;
      return { ...base(v), id: uid('k'), type: 'ink', d, color: color(v.color, '#1b1e27') };
    }
    default:
      return null;
  }
}

function background(v: unknown): Background {
  const d = defaultBackground();
  if (!isObj(v)) return d;
  const pat = isObj(v.pattern) ? v.pattern : {};
  const grad = isObj(v.gradient) ? v.gradient : null;
  const img = isObj(v.image) ? v.image : null;
  const imgSrc = img ? safeImageSrc(img.src) : null;
  return {
    color: color(v.color, d.color),
    gradient: grad ? { from: color(grad.from, '#ffffff'), to: color(grad.to, '#e9edf5'), angle: num(grad.angle, 90, -360, 360) } : null,
    pattern: {
      kind: oneOf(pat.kind, PATTERNS, 'none'),
      color: color(pat.color, d.pattern.color),
      size: num(pat.size, d.pattern.size, 3, 300),
      opacity: num(pat.opacity, d.pattern.opacity, 0, 1),
    },
    image: img && imgSrc ? { src: imgSrc, fit: oneOf(img.fit, ['cover', 'contain', 'stretch'] as const, 'cover'), opacity: num(img.opacity, 1, 0, 1) } : null,
  };
}

function page(v: unknown, warnings: string[]): Page | null {
  if (!isObj(v)) return null;
  const p = createPage(num(v.width, 210, 10, 5000), num(v.height, 297, 10, 5000), str(v.name, 'صفحة', 80));
  p.background = background(v.background);
  if (Array.isArray(v.objects)) {
    for (const o of v.objects.slice(0, LIMITS.maxObjectsPerPage)) {
      const obj = object(o, warnings);
      if (obj) p.objects.push(obj);
    }
  }
  return p;
}

export function validateDoc(raw: unknown): { doc: KelkDoc; warnings: string[] } {
  if (!isObj(raw) || raw.format !== 'kelk-web') throw new Error('هذا الملف ليس مشروع كِلك ويب.');
  if (raw.version !== 1) throw new Error('إصدار المشروع غير مدعوم.');
  const warnings: string[] = [];
  const pages: Page[] = [];
  if (Array.isArray(raw.pages)) {
    for (const p of raw.pages.slice(0, LIMITS.maxPages)) {
      const pg = page(p, warnings);
      if (pg) pages.push(pg);
    }
  }
  if (!pages.length) pages.push(createPage());
  const meta = isObj(raw.meta) ? raw.meta : {};
  const now = new Date().toISOString();
  return {
    doc: {
      format: 'kelk-web',
      version: 1,
      title: str(raw.title, 'عمل بلا عنوان', 200),
      pages,
      meta: { created: str(meta.created, now, 40), modified: str(meta.modified, now, 40) },
    },
    warnings: [...new Set(warnings)],
  };
}
