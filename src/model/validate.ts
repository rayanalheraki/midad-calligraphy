// Validation and sanitisation of documents loaded from files or storage.
// Only known fields are copied, numbers are clamped and colours must be #rrggbb.
// Anything else (including images and page backgrounds of older files) is dropped.
import { clamp } from '../engine/geom';
import { currentFontId, findFontDef, DEFAULT_FONT_ID } from '../engine/fonts';
import { MAX_DIP_PERCENT, MAX_STRETCH_EM } from '../engine/layout';
import { createPage, createStrokes, createText, defaultGlyphOverride, uid } from './defaults';
import { findElement } from './elements';
import type {
  DocObject,
  Fill,
  GlyphOverride,
  MidadDoc,
  Page,
  Shadow,
  MarkShape,
  StrokeStyle,
  TextObject,
} from './types';

export const LIMITS = {
  maxPages: 200,
  maxObjectsPerPage: 2000,
  maxTextChars: 5000,
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
      alt: typeof g.alt === 'string' && /^[\x21-\x7e]{1,63}$/.test(g.alt) ? g.alt : null,
      stretch: num(g.stretch, 0, 0, MAX_STRETCH_EM),
      dip: g.dip == null ? null : num(g.dip, 100, 0, MAX_DIP_PERCENT),
    };
  }
  return out;
}

const MARK_SHAPES: readonly MarkShape[] = ['glyph', 'dot1', 'dot2h', 'dot2v', 'dot3', 'dot3i'];
const VARIANT_RE = /^-?[a-z0-9]{4}(?:=\d{1,3})?$/;

function segVariants(v: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!isObj(v)) return out;
  for (const [k, specs] of Object.entries(v).slice(0, LIMITS.maxGlyphOverrides)) {
    if (!/^\d+$/.test(k) || !Array.isArray(specs)) continue;
    const ok = specs.filter((f): f is string => typeof f === 'string' && VARIANT_RE.test(f)).slice(0, 8);
    if (ok.length) out[k] = ok;
  }
  return out;
}

function textObject(v: Obj, warnings: string[]): TextObject {
  const d = createText();
  let fontId = currentFontId(str(v.fontId, DEFAULT_FONT_ID, 80));
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
    segVariants: segVariants(v.segVariants),
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
    case 'mark': {
      const element = str(v.element, '', 40);
      const def = findElement(element);
      let fontId = currentFontId(str(v.fontId, DEFAULT_FONT_ID, 80));
      if (!findFontDef(fontId)) fontId = DEFAULT_FONT_ID;
      const shape = def ? def.shape : oneOf(v.shape, MARK_SHAPES, 'dot1');
      return {
        ...base(v),
        id: uid('m'),
        type: 'mark',
        element: def ? def.id : 'custom',
        shape,
        // Only short runs of text: an element is a mark or sign, not a line.
        text: def ? def.text : str(v.text, '', 8),
        fontId,
        size: num(v.size, 18, 0.5, 2000),
        fill: fill(v.fill, { kind: 'solid', color: '#1b1e27' }),
        ownerId: typeof v.ownerId === 'string' ? v.ownerId.slice(0, 40) : null,
      };
    }
    case 'strokes': {
      const d = createStrokes();
      const nums = (r: unknown, max: number) => {
        const out: Record<string, number> = {};
        if (isObj(r)) for (const [k, n] of Object.entries(r).slice(0, 2000)) if (/^\d+$/.test(k)) out[k] = num(n, 0, 0, max);
        return out;
      };
      return {
        ...d,
        ...base(v),
        id: uid('s'),
        type: 'strokes',
        text: str(v.text, '', 500),
        size: num(v.size, d.size, 1, 2000),
        nibWidth: num(v.nibWidth, d.nibWidth, 0.02, 0.4),
        nibAngle: num(v.nibAngle, d.nibAngle, -180, 180),
        madd: nums(v.madd, 1),
        kashida: nums(v.kashida, 4),
        fill: fill(v.fill, d.fill),
        showSkeleton: bool(v.showSkeleton, false),
      };
    }
    case 'image':
      warnings.push('أُهملت الصور: يقتصر المحرر على الخط وعناصره.');
      return null;
    default:
      return null;
  }
}

function page(v: unknown, warnings: string[]): Page | null {
  if (!isObj(v)) return null;
  const p = createPage(num(v.width, 210, 10, 5000), num(v.height, 297, 10, 5000), str(v.name, 'صفحة', 80));
  if (Array.isArray(v.objects)) {
    // Ids are regenerated, so element-to-line links are mapped from the file's ids.
    const remap = new Map<string, string>();
    for (const o of v.objects.slice(0, LIMITS.maxObjectsPerPage)) {
      const obj = object(o, warnings);
      if (!obj) continue;
      if (isObj(o) && typeof o.id === 'string') remap.set(o.id, obj.id);
      p.objects.push(obj);
    }
    for (const obj of p.objects) {
      if (obj.type !== 'mark' || !obj.ownerId) continue;
      const owner = remap.get(obj.ownerId);
      obj.ownerId = owner && p.objects.some((x) => x.id === owner && x.type === 'text') ? owner : null;
    }
  }
  return p;
}

export function validateDoc(raw: unknown): { doc: MidadDoc; warnings: string[] } {
  if (!isObj(raw) || raw.format !== 'midad') throw new Error('هذا الملف ليس مشروع مِداد.');
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
      format: 'midad',
      version: 1,
      title: str(raw.title, 'عمل بلا عنوان', 200),
      pages,
      meta: { created: str(meta.created, now, 40), modified: str(meta.modified, now, 40) },
    },
    warnings: [...new Set(warnings)],
  };
}
