import type {
  Background,
  GlyphOverride,
  ImageObject,
  InkObject,
  KelkDoc,
  Page,
  ShapeKind,
  ShapeObject,
  TextObject,
} from './types';

export function uid(prefix = 'o'): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return prefix + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export const PAGE_SIZES: { id: string; name: string; w: number; h: number }[] = [
  { id: 'a4', name: 'A4', w: 210, h: 297 },
  { id: 'a3', name: 'A3', w: 297, h: 420 },
  { id: 'a5', name: 'A5', w: 148, h: 210 },
  { id: 'letter', name: 'Letter', w: 215.9, h: 279.4 },
  { id: 'square', name: 'مربع ٢٠٠ مم', w: 200, h: 200 },
  { id: 'card', name: 'بطاقة ١٥٠×١٠٠', w: 150, h: 100 },
  { id: 'banner', name: 'لافتة ٤٢٠×١٤٨', w: 420, h: 148 },
];

export function defaultBackground(): Background {
  return {
    color: '#ffffff',
    gradient: null,
    pattern: { kind: 'none', color: '#1f3a73', size: 18, opacity: 0.12 },
    image: null,
  };
}

export function createPage(w = 210, h = 297, name = 'صفحة'): Page {
  return { id: uid('p'), name, width: w, height: h, background: defaultBackground(), objects: [] };
}

export function createDoc(title = 'عمل جديد'): KelkDoc {
  const now = new Date().toISOString();
  return { format: 'kelk-web', version: 1, title, pages: [createPage()], meta: { created: now, modified: now } };
}

export function defaultGlyphOverride(): GlyphOverride {
  return { dx: 0, dy: 0, rotate: 0, scale: 1, color: null, hidden: false };
}

export function createText(partial: Partial<TextObject> = {}): TextObject {
  return {
    id: uid('t'),
    type: 'text',
    name: 'سطر',
    x: 105,
    y: 120,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    locked: false,
    hidden: false,
    text: 'بسم الله الرحمن الرحيم',
    fontId: 'amiri',
    size: 18,
    wordSpacing: 0,
    kashida: 0,
    kashidaAt: {},
    justifyWidth: 0,
    features: [],
    path: { mode: 'straight', radius: 80, sweep: 300, amplitude: 6, wavelength: 60, flip: false },
    repeat: { count: 1, angle: 45, offset: 0 },
    mirror: 'none',
    mirrorGap: 4,
    fill: { kind: 'solid', color: '#1b1e27' },
    stroke: null,
    shadow: null,
    hideMarks: false,
    markColor: null,
    glyphs: {},
    ...partial,
  };
}

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  frame: 'إطار بسيط',
  doubleFrame: 'إطار مزدوج',
  ornateFrame: 'إطار مزخرف',
  roundFrame: 'إطار مستدير الزوايا',
  arch: 'محراب',
  circle: 'دائرة',
  medallion: 'شمسة',
  rosette: 'وردة',
  star: 'نجمة',
  khatam: 'نجمة ثمانية (خاتم)',
  divider: 'فاصل مزخرف',
  rhombus: 'نقطة القلم',
};

export function createShape(kind: ShapeKind, partial: Partial<ShapeObject> = {}): ShapeObject {
  const square = ['circle', 'medallion', 'rosette', 'star', 'khatam', 'rhombus'].includes(kind);
  const isFrame = ['frame', 'doubleFrame', 'ornateFrame', 'roundFrame', 'arch'].includes(kind);
  return {
    id: uid('s'),
    type: 'shape',
    name: SHAPE_LABELS[kind],
    kind,
    x: 105,
    y: 148,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    locked: false,
    hidden: false,
    w: kind === 'divider' ? 120 : kind === 'rhombus' ? 6 : square ? 70 : 170,
    h: kind === 'divider' ? 10 : kind === 'rhombus' ? 6 : square ? 70 : kind === 'arch' ? 200 : 240,
    points: kind === 'star' ? 12 : kind === 'rosette' ? 16 : 24,
    inner: kind === 'star' ? 0.62 : 0.5,
    fill: isFrame || kind === 'divider' ? null : kind === 'rhombus' ? { kind: 'solid', color: '#1b1e27' } : { kind: 'gold' },
    stroke: kind === 'rhombus' ? null : { color: '#1f3a73', width: isFrame ? 1.2 : 0.6 },
    shadow: null,
    ...partial,
  };
}

export function createImage(src: string, w: number, h: number, partial: Partial<ImageObject> = {}): ImageObject {
  return {
    id: uid('i'),
    type: 'image',
    name: 'صورة',
    x: 105,
    y: 148,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    locked: false,
    hidden: false,
    src,
    w,
    h,
    ...partial,
  };
}

export function createInk(d: string, color: string, x: number, y: number): InkObject {
  return {
    id: uid('k'),
    type: 'ink',
    name: 'خط القلم',
    x,
    y,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    locked: false,
    hidden: false,
    d,
    color,
  };
}
