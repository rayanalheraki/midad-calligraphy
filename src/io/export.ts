import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Page } from '../model/types';
import { ensureFont } from '../engine/fontLoader';
import { fmt, type Rect } from '../engine/geom';
import { PageContent } from '../render/PageView';
import { markFontIds } from '../engine/marks';

export type MirrorExport = 'none' | 'h' | 'v' | 'both';

export async function ensurePageFonts(pages: Page[]): Promise<void> {
  const ids = new Set<string>();
  for (const p of pages)
    for (const o of p.objects) {
      if (o.type === 'text') ids.add(o.fontId);
      else if (o.type === 'mark') markFontIds(o).forEach((id) => ids.add(id));
    }
  await Promise.all([...ids].map((id) => ensureFont(id).catch(() => undefined)));
}

export interface SvgOptions {
  crop?: Rect | null;
  mirror?: MirrorExport;
  transparent?: boolean;
}

/** Standalone SVG of a page. All text is converted to outlines, so no fonts are needed to view it. */
export function pageSvgString(page: Page, opts: SvgOptions = {}): { svg: string; width: number; height: number } {
  const crop = opts.crop ?? { minX: 0, minY: 0, maxX: page.width, maxY: page.height };
  const w = crop.maxX - crop.minX;
  const h = crop.maxY - crop.minY;
  const renderPage: Page = opts.transparent ? { ...page, background: { ...page.background, color: 'none', gradient: null } } : page;
  const body = renderToStaticMarkup(createElement(PageContent, { page: renderPage, mode: 'export', fontsVersion: 0 }));
  const cx = crop.minX + w / 2;
  const cy = crop.minY + h / 2;
  const mirror = opts.mirror ?? 'none';
  const sx = mirror === 'h' || mirror === 'both' ? -1 : 1;
  const sy = mirror === 'v' || mirror === 'both' ? -1 : 1;
  const content =
    sx === 1 && sy === 1 ? body : `<g transform="translate(${fmt(cx)} ${fmt(cy)}) scale(${sx} ${sy}) translate(${fmt(-cx)} ${fmt(-cy)})">${body}</g>`;
  const svg =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" ` +
    `width="${fmt(w)}mm" height="${fmt(h)}mm" viewBox="${fmt(crop.minX)} ${fmt(crop.minY)} ${fmt(w)} ${fmt(h)}">` +
    `<title>Midad</title>${content}</svg>`;
  return { svg, width: w, height: h };
}

const MAX_SIDE = 14000;
const MAX_PIXELS = 160_000_000;

export async function rasterize(
  svg: string,
  widthMm: number,
  heightMm: number,
  dpi: number,
  type: 'image/png' | 'image/jpeg',
): Promise<{ blob: Blob; dpi: number }> {
  let usedDpi = dpi;
  const px = (mm: number, d: number) => Math.max(1, Math.round((mm / 25.4) * d));
  while ((px(widthMm, usedDpi) > MAX_SIDE || px(heightMm, usedDpi) > MAX_SIDE || px(widthMm, usedDpi) * px(heightMm, usedDpi) > MAX_PIXELS) && usedDpi > 10) {
    usedDpi = Math.floor(usedDpi * 0.8);
  }
  const W = px(widthMm, usedDpi);
  const H = px(heightMm, usedDpi);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    if (type === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
    }
    ctx.drawImage(img, 0, 0, W, H);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.93));
    if (!blob) throw new Error('تعذّر إنشاء الصورة؛ جرّب دقة أقل.');
    return { blob, dpi: usedDpi };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function safeFileName(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().slice(0, 80);
  return cleaned || 'midad';
}

/** Prints the pages through the browser dialog; "Save as PDF" there produces a vector PDF. */
export function printPages(pages: Page[]): void {
  const first = pages[0];
  const root = document.createElement('div');
  root.className = 'print-root';
  const parser = new DOMParser();
  for (const p of pages) {
    const { svg } = pageSvgString(p);
    const node = parser.parseFromString(svg, 'image/svg+xml').documentElement;
    node.setAttribute('class', 'print-page');
    root.appendChild(document.importNode(node, true));
  }
  const style = document.createElement('style');
  style.textContent = `@page { size: ${fmt(first.width)}mm ${fmt(first.height)}mm; margin: 0; }`;
  document.head.appendChild(style);
  document.body.appendChild(root);
  document.body.classList.add('printing');
  const cleanup = () => {
    root.remove();
    style.remove();
    document.body.classList.remove('printing');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  setTimeout(() => {
    window.print();
    setTimeout(cleanup, 1000);
  }, 50);
}
