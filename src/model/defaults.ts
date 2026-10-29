import type {
  GlyphOverride,
  MidadDoc,
  Page,
  MarkObject,
  StrokesObject,
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

export function createPage(w = 210, h = 297, name = 'صفحة'): Page {
  return { id: uid('p'), name, width: w, height: h, objects: [] };
}

export function createDoc(title = 'عمل جديد'): MidadDoc {
  const now = new Date().toISOString();
  return { format: 'midad', version: 1, title, pages: [createPage()], meta: { created: now, modified: now } };
}

export function defaultGlyphOverride(): GlyphOverride {
  return { dx: 0, dy: 0, rotate: 0, scale: 1, color: null, hidden: false, alt: null, stretch: 0, dip: null };
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
    segVariants: {},
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

export function createStrokes(partial: Partial<StrokesObject> = {}): StrokesObject {
  return {
    id: uid('s'),
    type: 'strokes',
    name: 'سطر بالقلم',
    x: 105,
    y: 120,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    locked: false,
    hidden: false,
    text: 'نبيل',
    size: 30,
    nibWidth: 0.1,
    nibAngle: 65,
    madd: {},
    kashida: {},
    fill: { kind: 'solid', color: '#1b1e27' },
    showSkeleton: false,
    ...partial,
  };
}

export function createMark(partial: Partial<MarkObject> & Pick<MarkObject, 'element' | 'shape' | 'text'>): MarkObject {
  return {
    id: uid('m'),
    type: 'mark',
    name: 'عنصر',
    x: 105,
    y: 148,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    locked: false,
    hidden: false,
    fontId: 'amiri',
    size: 18,
    fill: { kind: 'solid', color: '#1b1e27' },
    ownerId: null,
    ...partial,
  };
}
