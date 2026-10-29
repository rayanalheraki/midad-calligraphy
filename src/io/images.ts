// Images are decoded by the browser and re-encoded through a canvas before they enter a
// document. This strips metadata and any non-image payload (polyglot files), and rejects
// formats that can carry scripts (SVG is not accepted).
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const MAX_IMAGE_FILE = 15 * 1024 * 1024;
const MAX_SIDE = 4000;

export interface LoadedImage {
  src: string;
  widthPx: number;
  heightPx: number;
}

export async function readImageFile(file: File): Promise<LoadedImage> {
  if (!ACCEPTED.includes(file.type)) throw new Error('الصيغ المدعومة: PNG وJPEG وWebP وGIF.');
  if (file.size > MAX_IMAGE_FILE) throw new Error('حجم الصورة أكبر من ١٥ ميغابايت.');
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('تعذّرت قراءة الصورة؛ قد يكون الملف تالفًا.');
  });
  const f = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * f));
  const h = Math.max(1, Math.round(bitmap.height * f));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('المتصفح لا يدعم معالجة الصور.');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const src = file.type === 'image/jpeg' ? canvas.toDataURL('image/jpeg', 0.92) : canvas.toDataURL('image/png');
  return { src, widthPx: w, heightPx: h };
}
