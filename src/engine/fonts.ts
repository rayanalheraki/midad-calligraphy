import type { Face, Font } from 'harfbuzzjs';

export type HarfBuzz = typeof import('harfbuzzjs');

export interface FontDef {
  id: string;
  name: string;
  /** calligraphic style family shown in the UI */
  category: string;
  /** package path, or project path starting with "./" (built-in fonts; used by the tests) */
  file?: string;
  /** OpenType language system used when shaping */
  lang: string;
  /** whether tatweel-based kashida suits this style */
  kashida: boolean;
  builtin: boolean;
}

export interface LoadedFont {
  def: FontDef;
  hb: HarfBuzz;
  face: Face;
  font: Font;
  upem: number;
  ascender: number;
  descender: number;
  /** optional GSUB features offered to the user (stylistic sets, swashes, ...) */
  optionalFeatures: string[];
  /** the font file itself, kept for reading GSUB alternates */
  data: Uint8Array;
  /** CSS family name registered for UI previews (browser only) */
  cssFamily: string;
}

const G = '@expo-google-fonts/';

export const BUILTIN_FONTS: FontDef[] = [
  { id: 'amiri', name: 'أميري', category: 'نسخ', file: G + 'amiri/400Regular/Amiri_400Regular.ttf', lang: 'ar', kashida: true, builtin: true },
  { id: 'amiri-bold', name: 'أميري عريض', category: 'نسخ', file: G + 'amiri/700Bold/Amiri_700Bold.ttf', lang: 'ar', kashida: true, builtin: true },
  { id: 'amiri-quran', name: 'أميري قرآن', category: 'نسخ مصحفي', file: G + 'amiri-quran/400Regular/AmiriQuran_400Regular.ttf', lang: 'ar', kashida: true, builtin: true },
  { id: 'scheherazade', name: 'شهرزاد', category: 'نسخ', file: G + 'scheherazade-new/400Regular/ScheherazadeNew_400Regular.ttf', lang: 'ar', kashida: true, builtin: true },
  { id: 'scheherazade-bold', name: 'شهرزاد عريض', category: 'نسخ', file: G + 'scheherazade-new/700Bold/ScheherazadeNew_700Bold.ttf', lang: 'ar', kashida: true, builtin: true },
  { id: 'lateef', name: 'لطيف', category: 'نسخ', file: G + 'lateef/400Regular/Lateef_400Regular.ttf', lang: 'ar', kashida: true, builtin: true },
  { id: 'mirza', name: 'ميرزا', category: 'نسخ فارسي', file: G + 'mirza/400Regular/Mirza_400Regular.ttf', lang: 'ar', kashida: true, builtin: true },
  { id: 'am-thulth', name: 'ثلث مشرف', category: 'ثلث', file: './src/assets/fonts/amoshref/AMoshref-Thulth.ttf', lang: 'ar', kashida: true, builtin: true },
  { id: 'ruwudu', name: 'رُدود', category: 'ديواني', file: G + 'ruwudu/400Regular/Ruwudu_400Regular.ttf', lang: 'ar', kashida: false, builtin: true },
  { id: 'ruwudu-bold', name: 'رُدود عريض', category: 'ديواني', file: G + 'ruwudu/700Bold/Ruwudu_700Bold.ttf', lang: 'ar', kashida: false, builtin: true },
  { id: 'layla-diwani', name: 'ليلى ديواني', category: 'ديواني', file: './src/assets/fonts/layla/LaylaDiwani.ttf', lang: 'ar', kashida: false, builtin: true },
  { id: 'aref-ruqaa', name: 'عارف رقعة', category: 'رقعة', file: G + 'aref-ruqaa/400Regular/ArefRuqaa_400Regular.ttf', lang: 'ar', kashida: false, builtin: true },
  { id: 'aref-ruqaa-bold', name: 'عارف رقعة عريض', category: 'رقعة', file: G + 'aref-ruqaa/700Bold/ArefRuqaa_700Bold.ttf', lang: 'ar', kashida: false, builtin: true },
  { id: 'reem-kufi', name: 'ريم كوفي', category: 'كوفي', file: G + 'reem-kufi/400Regular/ReemKufi_400Regular.ttf', lang: 'ar', kashida: true, builtin: true },
  { id: 'reem-kufi-bold', name: 'ريم كوفي عريض', category: 'كوفي', file: G + 'reem-kufi/700Bold/ReemKufi_700Bold.ttf', lang: 'ar', kashida: true, builtin: true },
  { id: 'qahiri', name: 'قاهري', category: 'كوفي مملوكي', file: G + 'qahiri/400Regular/Qahiri_400Regular.ttf', lang: 'ar', kashida: true, builtin: true },
  { id: 'nastaliq', name: 'نستعليق نوتو', category: 'نستعليق', file: G + 'noto-nastaliq-urdu/400Regular/NotoNastaliqUrdu_400Regular.ttf', lang: 'ur', kashida: false, builtin: true },
  { id: 'nastaliq-bold', name: 'نستعليق نوتو عريض', category: 'نستعليق', file: G + 'noto-nastaliq-urdu/700Bold/NotoNastaliqUrdu_700Bold.ttf', lang: 'ur', kashida: false, builtin: true },
  { id: 'gulzar', name: 'گلزار', category: 'نستعليق', file: G + 'gulzar/400Regular/Gulzar_400Regular.ttf', lang: 'ur', kashida: false, builtin: true },
  { id: 'alkalami', name: 'القلمي', category: 'خط إفريقي', file: G + 'alkalami/400Regular/Alkalami_400Regular.ttf', lang: 'ar', kashida: true, builtin: true },
  { id: 'katibeh', name: 'كاتبة', category: 'زخرفي', file: G + 'katibeh/400Regular/Katibeh_400Regular.ttf', lang: 'ar', kashida: true, builtin: true },
  { id: 'rakkas', name: 'رقّاص', category: 'زخرفي', file: G + 'rakkas/400Regular/Rakkas_400Regular.ttf', lang: 'ar', kashida: true, builtin: true },
  { id: 'lalezar', name: 'لاله‌زار', category: 'زخرفي', file: G + 'lalezar/400Regular/Lalezar_400Regular.ttf', lang: 'ar', kashida: true, builtin: true },
  { id: 'jomhuria', name: 'جمهورية', category: 'زخرفي', file: G + 'jomhuria/400Regular/Jomhuria_400Regular.ttf', lang: 'ar', kashida: true, builtin: true },
  { id: 'marhey', name: 'مرحي', category: 'زخرفي', file: G + 'marhey/400Regular/Marhey_400Regular.ttf', lang: 'ar', kashida: true, builtin: true },
  { id: 'el-messiri', name: 'المسيري', category: 'حديث', file: G + 'el-messiri/400Regular/ElMessiri_400Regular.ttf', lang: 'ar', kashida: true, builtin: true },
];

export const DEFAULT_FONT_ID = 'amiri';

const OPTIONAL_FEATURE_RE = /^(ss\d\d|salt|swsh|cswh|dlig|hlig)$/;

export const FEATURE_LABELS: Record<string, string> = {
  salt: 'أشكال بديلة',
  swsh: 'تذييلات',
  cswh: 'تذييلات سياقية',
  dlig: 'ربطات اختيارية',
  hlig: 'ربطات تاريخية',
};

export function featureLabel(tag: string): string {
  const ss = /^ss(\d\d)$/.exec(tag);
  if (ss) return `مجموعة أسلوبية ${Number(ss[1])}`;
  return FEATURE_LABELS[tag] ?? tag;
}

let hbPromise: Promise<HarfBuzz> | null = null;
export function loadHarfBuzz(): Promise<HarfBuzz> {
  if (!hbPromise) hbPromise = import('harfbuzzjs');
  return hbPromise;
}

const registry = new Map<string, LoadedFont>();
const userDefs = new Map<string, FontDef>();

export function getLoadedFont(id: string): LoadedFont | undefined {
  return registry.get(id);
}

export function allFontDefs(): FontDef[] {
  return [...BUILTIN_FONTS, ...userDefs.values()];
}

/** Built-in fonts that were replaced: documents using them open with the successor. */
const RENAMED: Record<string, string> = { 'layla-thuluth': 'am-thulth' };

export function findFontDef(id: string): FontDef | undefined {
  return BUILTIN_FONTS.find((f) => f.id === (RENAMED[id] ?? id)) ?? userDefs.get(id);
}

/** Current id of a font, following replaced built-in fonts. */
export function currentFontId(id: string): string {
  return RENAMED[id] ?? id;
}

export function addUserFontDef(def: FontDef): void {
  userDefs.set(def.id, def);
}

export function removeUserFont(id: string): void {
  userDefs.delete(id);
  registry.delete(id);
}

/** sfnt magic numbers: TrueType, OpenType/CFF, Apple TrueType. Collections and WOFF are rejected. */
export function isSfnt(data: Uint8Array): boolean {
  if (data.length < 12) return false;
  const tag = (data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3];
  return tag === 0x00010000 || tag === 0x4f54544f || tag === 0x74727565;
}

export const MAX_FONT_BYTES = 20 * 1024 * 1024;

export async function loadFontFromBuffer(def: FontDef, data: ArrayBuffer): Promise<LoadedFont> {
  const bytes = new Uint8Array(data);
  if (bytes.length > MAX_FONT_BYTES) throw new Error('ملف الخط أكبر من الحد المسموح (٢٠ ميغابايت).');
  if (!isSfnt(bytes)) throw new Error('هذا الملف ليس خط TrueType أو OpenType صالحًا.');
  const hb = await loadHarfBuzz();
  const face = new hb.Face(new hb.Blob(bytes), 0);
  if (!face.upem || face.upem < 16) throw new Error('تعذّرت قراءة الخط.');
  const font = new hb.Font(face);
  const ext = font.hExtents();
  const gsub = new Set(face.getTableFeatureTags('GSUB'));
  const optionalFeatures = [...gsub].filter((t) => OPTIONAL_FEATURE_RE.test(t)).sort();
  const cssFamily = 'khattatfont-' + def.id.replace(/[^a-z0-9-]/gi, '');
  const loaded: LoadedFont = {
    def,
    hb,
    face,
    font,
    upem: face.upem,
    ascender: ext.ascender,
    descender: ext.descender,
    optionalFeatures,
    data: bytes,
    cssFamily,
  };
  if (typeof document !== 'undefined' && typeof FontFace !== 'undefined') {
    try {
      const ff = new FontFace(cssFamily, data.slice(0));
      await ff.load();
      document.fonts.add(ff);
    } catch {
      // UI previews fall back to the system font; shaping still uses HarfBuzz.
    }
  }
  registry.set(def.id, loaded);
  return loaded;
}
