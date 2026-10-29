// Converts a legacy KLX document into an editable document.
// Text, baselines, sizes, colours, rotation and rotational repeats are kept. Each style is
// drawn with the closest open font, and vertical offsets of individually placed sub-words
// are carried over as letter edits.
import { createDoc, createPage, createText, defaultGlyphOverride } from '../model/defaults';
import type { MidadDoc, TextObject } from '../model/types';
import { ensureFont } from '../engine/fontLoader';
import { findFontDef } from '../engine/fonts';
import { computeTextGeometry } from '../engine/layout';
import { clamp } from '../engine/geom';
import { KLX_STYLE_NAMES, readKlxDocument, type KlxLine } from './klx';
import type { ImportReport } from '../store/editor';

const STYLE_FONT: Record<number, string> = {
  1: 'nastaliq',
  2: 'amiri',
  3: 'amiri-bold',
  4: 'nastaliq',
  5: 'nastaliq',
  6: 'amiri',
  7: 'amiri',
  8: 'aref-ruqaa',
  9: 'aref-ruqaa-bold',
  10: 'aref-ruqaa',
  11: 'nastaliq',
  12: 'reem-kufi',
  13: 'aref-ruqaa-bold',
};

function lineObject(line: KlxLine, fontId: string, lf: Awaited<ReturnType<typeof ensureFont>>): TextObject {
  const len = Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
  const angle = len > 0.5 ? (Math.atan2(line.y2 - line.y1, line.x2 - line.x1) * 180) / Math.PI : -line.angle;
  const obj = createText({
    text: line.text,
    fontId,
    x: (line.x1 + line.x2) / 2,
    y: (line.y1 + line.y2) / 2,
    rotation: Math.abs(angle) < 0.01 ? 0 : angle,
    fill: { kind: 'solid', color: line.color },
    name: 'سطر مستورد',
  });
  // Fit the line to the original baseline length.
  const probe = computeTextGeometry({ ...obj, size: 10 }, lf);
  obj.size = len > 5 && probe.width > 0 ? clamp((10 * len) / probe.width, 3, 200) : clamp(line.size * 0.35, 4, 80);
  if (line.repeatCount > 1) obj.repeat = { count: Math.min(36, Math.round(line.repeatCount)), angle: line.repeatAngle || 360 / line.repeatCount, offset: 0 };

  // Sub-words that were raised or lowered (calligraphic composition) keep their vertical offset.
  if (line.words.length > 1 && Math.abs(angle) < 1) {
    const geo = computeTextGeometry(obj, lf);
    let cursor = 0;
    for (const w of line.words) {
      const t = w.text.replace(/\s+/g, '');
      if (!t) continue;
      const at = line.text.indexOf(t[0], cursor);
      if (at < 0) break;
      let end = at;
      let matched = 0;
      while (end < line.text.length && matched < t.length) {
        if (line.text[end] !== ' ') matched++;
        end++;
      }
      cursor = end;
      const dy = w.y - line.y1;
      if (Math.abs(dy) < 0.4) continue;
      for (const g of geo.glyphs) if (g.origin >= at && g.origin < end) obj.glyphs[g.key] = { ...defaultGlyphOverride(), dy };
    }
  }
  return obj;
}

export async function importKlx(buffer: ArrayBuffer, fileName: string): Promise<{ doc: MidadDoc; report: ImportReport }> {
  const kd = readKlxDocument(buffer);
  const doc = createDoc(fileName.replace(/\.klx$/i, '') || 'مستند مستورد');
  doc.pages = [];
  const usedStyles = new Map<number, number>();
  let lines = 0;
  let marks = 0;
  for (const p of kd.pages) {
    const page = createPage(clamp(p.width, 20, 2000), clamp(p.height, 20, 2000));
    for (const line of p.lines) {
      if (!line.text.trim()) continue;
      const fontId = STYLE_FONT[line.style] ?? 'amiri';
      const lf = await ensureFont(fontId);
      page.objects.push(lineObject(line, fontId, lf));
      usedStyles.set(line.style, (usedStyles.get(line.style) ?? 0) + 1);
      lines++;
      // Hand-placed vowels are stored as codes of a non-standard vowel font, not Unicode.
      marks += line.marks.length;
    }
    doc.pages.push(page);
  }
  if (!doc.pages.length) doc.pages.push(createPage());
  const report: ImportReport = {
    title: 'استيراد ملف KLX',
    lines: [
      `الصفحات: ${doc.pages.length}، الأسطر: ${lines}.`,
      ...[...usedStyles.entries()].map(([style, n]) => {
        const font = findFontDef(STYLE_FONT[style] ?? 'amiri');
        return `${KLX_STYLE_NAMES[style] ?? 'نمط ' + style} (${n} سطر) ← ${font?.name ?? 'أميري'}`;
      }),
    ],
    warnings: [
      'رُسمت النصوص بأقرب خط متاح لكل نمط، ويمكنك تغيير الخط من لوحة الخصائص.',
      ...(marks
        ? [`${marks} حركة أو نقطة وُضعت يدويًا في الملف الأصلي لم تُستورد، لأنها محفوظة برموز خط غير قياسي. أضفها من «التشكيل والعناصر» أو اكتبها مع النص.`]
        : []),
      ...kd.warnings,
    ],
  };
  return { doc, report };
}
