// Reader for legacy calligraphy documents (*.klx).
// A .klx file is a VB6 Byte() array (descriptor 0x2011) holding a PropertyBag.Contents blob:
//   u32 0xB293 signature, u32 length, then records:
//   u16 vartype, u16 nameChars, u32 hash, u32 recordSize, UTF-16 name, value, padding.
// Pages after the first are nested PropertyBags stored as Byte() values named "page1".."pageN".
// Every read is bounds-checked; malformed input stops the parse instead of reading past the buffer.
import { decodeKlxString } from './klxText';

export type KlxValue = number | string | boolean | KlxBag | { bytes: number } | null;
export type KlxBag = Map<string, KlxValue>;

export const KLX_LIMITS = {
  maxFileBytes: 32 * 1024 * 1024,
  maxDepth: 4,
  maxRecords: 400_000,
  maxStringChars: 100_000,
};

export class KlxError extends Error {}

const TWIPS_PER_MM = 1440 / 25.4;

interface ParseState {
  records: number;
}

function readUtf16(view: DataView, off: number, chars: number): string {
  let s = '';
  for (let i = 0; i < chars; i++) s += String.fromCharCode(view.getUint16(off + i * 2, true));
  return s;
}

function parseBag(view: DataView, off: number, end: number, depth: number, st: ParseState): KlxBag {
  if (depth > KLX_LIMITS.maxDepth) throw new KlxError('بنية الملف متداخلة أكثر من اللازم.');
  if (off + 8 > end) throw new KlxError('الملف مقطوع.');
  if (view.getUint32(off, true) !== 0xb293) throw new KlxError('توقيع PropertyBag غير صحيح.');
  const len = view.getUint32(off + 4, true);
  const stop = Math.min(end, off + 8 + len);
  const bag: KlxBag = new Map();
  let p = off + 8;
  while (p + 12 <= stop) {
    const vt = view.getUint16(p, true);
    const nlen = view.getUint16(p + 2, true);
    const rsz = view.getUint32(p + 8, true);
    if (rsz < 12 || p + rsz > stop) break;
    if (++st.records > KLX_LIMITS.maxRecords) throw new KlxError('عدد السجلات في الملف كبير جدًا.');
    const nameEnd = p + 12 + nlen * 2;
    if (nameEnd > p + rsz) break;
    const name = readUtf16(view, p + 12, nlen);
    const v = nameEnd;
    const recEnd = p + rsz;
    const fits = (n: number) => v + n <= recEnd;
    let value: KlxValue = null;
    switch (vt) {
      case 2:
        if (fits(2)) value = view.getInt16(v, true);
        break;
      case 3:
        if (fits(4)) value = view.getInt32(v, true);
        break;
      case 4:
        if (fits(4)) value = view.getFloat32(v, true);
        break;
      case 5:
        if (fits(8)) value = view.getFloat64(v, true);
        break;
      case 11:
        if (fits(2)) value = view.getInt16(v, true) !== 0;
        break;
      case 17:
        if (fits(1)) value = view.getUint8(v);
        break;
      case 8: {
        if (!fits(4)) break;
        const n = view.getUint32(v, true);
        if (n <= KLX_LIMITS.maxStringChars && fits(4 + n * 2)) value = readUtf16(view, v + 4, n);
        break;
      }
      case 0x2011: {
        if (!fits(10)) break;
        const count = view.getUint32(v + 2, true);
        const dataStart = v + 10;
        if (dataStart + count > recEnd) break;
        if (count >= 8 && view.getUint32(dataStart, true) === 0xb293) {
          value = parseBag(view, dataStart, dataStart + count, depth + 1, st);
        } else {
          value = { bytes: count };
        }
        break;
      }
      default:
        value = null; // objects (pictures) and other variant types are not imported
    }
    bag.set(name, value);
    p += rsz;
  }
  return bag;
}

export function parseKlxBag(buffer: ArrayBuffer): KlxBag {
  if (buffer.byteLength > KLX_LIMITS.maxFileBytes) throw new KlxError('حجم الملف أكبر من الحد المسموح.');
  if (buffer.byteLength < 20) throw new KlxError('الملف صغير جدًا ليكون ملف KLX.');
  const view = new DataView(buffer);
  if (view.getUint16(0, true) !== 0x2011) throw new KlxError('هذا الملف ليس بصيغة KLX.');
  const count = view.getUint32(4, true);
  const end = Math.min(buffer.byteLength, 12 + count);
  return parseBag(view, 12, end, 0, { records: 0 });
}

export interface KlxWord {
  text: string;
  x: number;
  y: number;
  size: number;
  angle: number;
}

export interface KlxMark {
  text: string;
  x: number;
  y: number;
  size: number;
  color: string;
}

export interface KlxLine {
  text: string;
  style: number;
  size: number;
  color: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  angle: number;
  repeatCount: number;
  repeatAngle: number;
  words: KlxWord[];
  marks: KlxMark[];
}

export interface KlxPage {
  width: number;
  height: number;
  lines: KlxLine[];
  pictures: number;
}

export interface KlxDocument {
  pages: KlxPage[];
  warnings: string[];
}

export const KLX_STYLE_NAMES: Record<number, string> = {
  1: 'نستعليق',
  2: 'نسخ',
  3: 'ثلث',
  4: 'تحريري',
  5: 'شكسته',
  6: 'نسخ نيريزي',
  7: 'نسخ بغدادي',
  8: 'ديواني خفي',
  9: 'ديواني جلي',
  10: 'رقعة',
  11: 'نستعليق لاهوري',
  12: 'كوفي',
  13: 'معلّى',
};

const num = (v: KlxValue | undefined, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: KlxValue | undefined): string => (typeof v === 'string' ? v : '');

/** VB colours are 0x00BBGGRR. */
export function vbColor(c: number): string {
  const v = c >>> 0;
  if (v & 0x80000000) return '#1b1e27'; // system colour constants
  const r = v & 0xff;
  const g = (v >> 8) & 0xff;
  const b = (v >> 16) & 0xff;
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

const mm = (twips: number) => twips / TWIPS_PER_MM;

function readPage(bag: KlxBag, warnings: string[]): KlxPage {
  const width = mm(num(bag.get('pgwidth0'), 11906));
  const height = mm(num(bag.get('pgheight0'), 16838));
  const lineCount = Math.min(2000, Math.max(0, num(bag.get('linecount0'))));
  const lines: KlxLine[] = [];
  for (let i = 1; i <= lineCount; i++) {
    const k = `0_${i}`;
    if (!bag.has('lx' + k)) continue;
    const words: KlxWord[] = [];
    const wordCount = Math.min(5000, num(bag.get('ltextcount' + k)));
    for (let j = 1; j <= wordCount; j++) {
      const wk = `${k}_${j}`;
      if (!bag.has('attx' + wk)) continue;
      words.push({
        text: decodeKlxString(str(bag.get('attrawstr' + wk))).trim(),
        x: mm(num(bag.get('attx' + wk))),
        y: mm(num(bag.get('atty' + wk))),
        size: num(bag.get('attfntsize' + wk)),
        angle: num(bag.get('attangle' + wk)),
      });
    }
    const marks: KlxMark[] = [];
    const markCount = Math.min(5000, num(bag.get('lpunccount' + k)));
    for (let j = 1; j <= markCount; j++) {
      const pk = `${k}_${j}`;
      if (!bag.has('punx' + pk)) continue;
      marks.push({
        text: decodeKlxString(str(bag.get('punrawstr' + pk))).trim(),
        x: mm(num(bag.get('punx' + pk))),
        y: mm(num(bag.get('puny' + pk))),
        size: num(bag.get('punfntsize' + pk)),
        color: vbColor(num(bag.get('punfntcolor' + pk))),
      });
    }
    let text = decodeKlxString(str(bag.get('ltextstr' + k))).trim();
    if (!text && words.length) text = words.map((w) => w.text).join(' ');
    lines.push({
      text,
      style: num(bag.get('lfntstyle' + k), 2),
      size: num(bag.get('lfntsize' + k), 20),
      color: vbColor(num(bag.get('lfntcolor' + k))),
      x1: mm(num(bag.get('lx' + k))),
      y1: mm(num(bag.get('ly' + k))),
      x2: mm(num(bag.get('lxx' + k))),
      y2: mm(num(bag.get('lyy' + k))),
      angle: num(bag.get('langle' + k)),
      repeatCount: Math.max(1, num(bag.get('lrepeatcount' + k), 1)),
      repeatAngle: num(bag.get('lrepeatangle' + k)),
      words,
      marks,
    });
  }
  const pictures = num(bag.get('picturecount0'));
  if (pictures > 0) warnings.push(`تحتوي الصفحة على ${pictures} صورة لم تُستورد (الصور مخزّنة ككائنات VB).`);
  if (num(bag.get('beziercount0')) > 0 || num(bag.get('guidelinecount0')) > 0) {
    warnings.push('خطوط الدليل والمنحنيات المرسومة في الملف الأصلي لم تُستورد.');
  }
  return { width, height, lines, pictures };
}

export function readKlxDocument(buffer: ArrayBuffer): KlxDocument {
  const root = parseKlxBag(buffer);
  const warnings: string[] = [];
  const pageCount = Math.min(500, num(root.get('pagecount'), 1));
  const pages: KlxPage[] = [];
  for (let i = 1; i <= pageCount; i++) {
    const nested = root.get('page' + i);
    if (nested instanceof Map) pages.push(readPage(nested, warnings));
  }
  if (!pages.length) pages.push(readPage(root, warnings));
  return { pages, warnings: [...new Set(warnings)] };
}
