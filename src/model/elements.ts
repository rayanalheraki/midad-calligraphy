// Catalogue of standalone elements: diacritics, pen dots, ornamental small letters,
// Qur'anic marks and symbols. Each one is placed on the page as its own object.
import { createMark } from './defaults';
import type { Fill, MarkObject, MarkShape } from './types';

export type ElementGroup = 'harakat' | 'dots' | 'ornaments' | 'quran' | 'symbols';

export interface ElementDef {
  id: string;
  label: string;
  group: ElementGroup;
  shape: MarkShape;
  /** characters drawn for glyph elements */
  text: string;
  /** default size relative to the size of the line it accompanies */
  scale: number;
  /** combining marks need a dotted circle to be visible on a palette button */
  combining?: boolean;
}

export const ELEMENT_GROUPS: { id: ElementGroup; title: string }[] = [
  { id: 'harakat', title: 'الحركات' },
  { id: 'dots', title: 'النقاط' },
  { id: 'ornaments', title: 'علامات التزيين' },
  { id: 'quran', title: 'علامات المصحف' },
  { id: 'symbols', title: 'رموز وعبارات' },
];

const mark = (id: string, label: string, text: string, group: ElementGroup = 'harakat', scale = 1): ElementDef => ({
  id,
  label,
  group,
  shape: 'glyph',
  text,
  scale,
  combining: true,
});

const glyph = (id: string, label: string, text: string, group: ElementGroup, scale: number): ElementDef => ({
  id,
  label,
  group,
  shape: 'glyph',
  text,
  scale,
});

const dots = (id: string, label: string, shape: MarkShape): ElementDef => ({ id, label, group: 'dots', shape, text: '', scale: 1 });

export const ELEMENTS: ElementDef[] = [
  mark('fatha', 'فتحة', 'َ'),
  mark('damma', 'ضمة', 'ُ'),
  mark('kasra', 'كسرة', 'ِ'),
  mark('sukun', 'سكون', 'ْ'),
  mark('shadda', 'شدّة', 'ّ'),
  mark('shadda-fatha', 'شدّة وفتحة', 'َّ'),
  mark('shadda-damma', 'شدّة وضمة', 'ُّ'),
  mark('shadda-kasra', 'شدّة وكسرة', 'ِّ'),
  mark('fathatan', 'تنوين فتح', 'ً'),
  mark('dammatan', 'تنوين ضم', 'ٌ'),
  mark('kasratan', 'تنوين كسر', 'ٍ'),
  mark('madda', 'مدّة', 'ٓ'),
  mark('dagger-alef', 'ألف خنجرية', 'ٰ'),
  mark('subscript-alef', 'ألف خنجرية سفلية', 'ٖ'),
  mark('hamza-above', 'همزة فوقية', 'ٔ'),
  mark('hamza-below', 'همزة تحتية', 'ٕ'),
  glyph('hamza', 'همزة', 'ء', 'harakat', 0.7),

  dots('dot1', 'نقطة', 'dot1'),
  dots('dot2h', 'نقطتان', 'dot2h'),
  dots('dot2v', 'نقطتان رأسيتان', 'dot2v'),
  dots('dot3', 'ثلاث نقاط', 'dot3'),
  dots('dot3i', 'ثلاث نقاط مقلوبة', 'dot3i'),

  glyph('small-ain', 'عين صغيرة', 'ع', 'ornaments', 0.42),
  glyph('small-hah', 'حاء صغيرة', 'ح', 'ornaments', 0.42),
  glyph('small-heh', 'هاء صغيرة', 'ه', 'ornaments', 0.42),
  glyph('small-kaf', 'كاف صغيرة', 'ک', 'ornaments', 0.42),
  mark('small-tah', 'طاء صغيرة', 'ؕ', 'ornaments'),
  mark('small-meem', 'ميم صغيرة', 'ۢ', 'ornaments'),
  mark('small-noon', 'نون صغيرة', 'ۨ', 'ornaments'),
  mark('small-seen', 'سين صغيرة', 'ۜ', 'ornaments'),
  mark('small-waw', 'واو صغيرة', 'ۥ', 'ornaments'),
  mark('small-yeh', 'ياء صغيرة', 'ۦ', 'ornaments'),
  mark('long-madda', 'مدّة مستطيلة', 'ۤ', 'ornaments'),

  mark('waqf-sala', 'صلى', 'ۖ', 'quran'),
  mark('waqf-qala', 'قلى', 'ۗ', 'quran'),
  mark('waqf-jeem', 'جيم', 'ۚ', 'quran'),
  mark('waqf-dots', 'تعانق', 'ۛ', 'quran'),
  mark('waqf-lam-alef', 'لا', 'ۙ', 'quran'),
  mark('waqf-meem', 'ميم لازم', 'ۘ', 'quran'),
  glyph('ayah-end', 'نهاية آية', '۝', 'quran', 0.9),
  glyph('rub-hizb', 'ربع الحزب', '۞', 'quran', 0.9),
  glyph('sajda', 'سجدة', '۩', 'quran', 0.9),
  glyph('paren-right', 'قوس مزخرف أيمن', '﴿', 'quran', 0.9),
  glyph('paren-left', 'قوس مزخرف أيسر', '﴾', 'quran', 0.9),

  glyph('basmala', 'البسملة', '﷽', 'symbols', 1),
  glyph('allah', 'لفظ الجلالة', 'ﷲ', 'symbols', 1),
  glyph('salla', 'صلى الله عليه وسلم', 'ﷺ', 'symbols', 1),
  glyph('jalla', 'جلّ جلاله', 'ﷻ', 'symbols', 1),
  glyph('star', 'نجمة', '٭', 'symbols', 0.9),
  glyph('comma', 'فاصلة', '،', 'symbols', 0.9),
  glyph('semicolon', 'فاصلة منقوطة', '؛', 'symbols', 0.9),
  glyph('question', 'علامة استفهام', '؟', 'symbols', 0.9),
];

export function findElement(id: string): ElementDef | undefined {
  return ELEMENTS.find((e) => e.id === id);
}

export interface ElementStyle {
  fontId: string;
  size: number;
  fill: Fill;
}

/** A new element object sized and coloured like the line it accompanies. */
export function markFromElement(def: ElementDef, style: ElementStyle, ownerId: string | null, x: number, y: number): MarkObject {
  return createMark({
    element: def.id,
    shape: def.shape,
    text: def.text,
    name: def.label,
    fontId: style.fontId,
    size: Math.max(1, style.size * def.scale),
    fill: { ...style.fill },
    ownerId,
    x,
    y,
  });
}
