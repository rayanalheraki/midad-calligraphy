import type { KelkDoc } from '../model/types';
import { validateDoc } from '../model/validate';
import { downloadBlob, safeFileName } from './export';

export const MAX_PROJECT_BYTES = 80 * 1024 * 1024;

export function serializeDoc(doc: KelkDoc): string {
  return JSON.stringify(doc);
}

export function parseProject(json: string): { doc: KelkDoc; warnings: string[] } {
  if (json.length > MAX_PROJECT_BYTES) throw new Error('حجم ملف المشروع أكبر من الحد المسموح.');
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('ملف المشروع تالف أو ليس بصيغة JSON.');
  }
  return validateDoc(raw);
}

export async function readProjectFile(file: File): Promise<{ doc: KelkDoc; warnings: string[] }> {
  if (file.size > MAX_PROJECT_BYTES) throw new Error('حجم ملف المشروع أكبر من الحد المسموح.');
  return parseProject(await file.text());
}

export function downloadProject(doc: KelkDoc): void {
  downloadBlob(new Blob([serializeDoc(doc)], { type: 'application/json' }), `${safeFileName(doc.title)}.kelk.json`);
}
