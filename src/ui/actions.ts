import { createDoc, createImage, createText, uid } from '../model/defaults';
import { TEMPLATES } from '../model/templates';
import { useEditor } from '../store/editor';
import { downloadProject, readProjectFile, serializeDoc } from '../io/project';
import { importKlx } from '../io/klxImport';
import { KlxError } from '../io/klx';
import { ensurePageFonts, pageSvgString, printPages, rasterize } from '../io/export';
import { idbPut, type SavedWork } from '../io/storage';
import { pickFile, readImageFile } from '../io/images';
import { lastTextStyle } from './textDefaults';

const st = () => useEditor.getState();
const errorText = (e: unknown) => (e instanceof Error ? e.message : 'حدث خطأ غير متوقع.');

export function newDocument() {
  if (st().past.length && !confirm('سيُغلق العمل الحالي. يُحفظ آخر عمل تلقائيًا في المتصفح، هل تريد المتابعة؟')) return;
  st().loadDoc(createDoc());
  st().toast('بدأت عملًا جديدًا.', 'success');
}

export async function openProjectFile(file?: File | null) {
  const f = file ?? (await pickFile('.json,.midad,application/json'));
  if (!f) return;
  try {
    const { doc, warnings } = await readProjectFile(f);
    st().loadDoc(doc);
    st().toast(`فُتح «${doc.title}».`, 'success');
    if (warnings.length) st().setImportReport({ title: 'ملاحظات عند فتح المشروع', lines: [], warnings });
  } catch (e) {
    st().toast(errorText(e), 'error');
  }
}

export async function importKlxFile(file?: File | null) {
  const f = file ?? (await pickFile('.klx'));
  if (!f) return;
  try {
    if (f.size > 32 * 1024 * 1024) throw new KlxError('حجم الملف أكبر من الحد المسموح.');
    const { doc, report } = await importKlx(await f.arrayBuffer(), f.name);
    st().loadDoc(doc);
    st().setImportReport(report);
  } catch (e) {
    st().toast(e instanceof KlxError ? 'تعذّر قراءة ملف KLX: ' + e.message : errorText(e), 'error');
  }
}

export function saveProjectFile() {
  downloadProject(st().doc);
  st().toast('نُزّل ملف المشروع.', 'success');
}

async function thumbnail(): Promise<string> {
  const page = st().doc.pages[0];
  await ensurePageFonts([page]);
  const { svg, width, height } = pageSvgString(page);
  const dpi = Math.max(8, Math.min(60, (260 / width) * 25.4));
  const { blob } = await rasterize(svg, width, height, dpi, 'image/png');
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(blob);
  });
}

export async function saveToWorks() {
  try {
    const s = st();
    const id = s.savedWorkId ?? uid('w');
    const work: SavedWork = { id, title: s.doc.title, modified: new Date().toISOString(), thumb: await thumbnail(), json: serializeDoc(s.doc) };
    await idbPut('works', id, work);
    s.setSavedWorkId(id);
    s.toast(`حُفظ «${s.doc.title}» في أعمالي.`, 'success');
  } catch (e) {
    st().toast('تعذّر الحفظ في المتصفح: ' + errorText(e), 'error');
  }
}

export function insertTextLine() {
  const s = st();
  const page = s.doc.pages[s.pageIndex];
  s.addObject(createText({ ...lastTextStyle, x: page.width / 2, y: page.height / 2, text: 'اكتب نصّك هنا' }));
  window.dispatchEvent(new CustomEvent('midad:focus-text'));
}

/** Inserts an image file as a new object, sized to fit the page. */
async function insertImageFromFile(file: File) {
  const s = st();
  const page = s.doc.pages[s.pageIndex];
  const img = await readImageFile(file);
  const w = Math.min((img.widthPx * 25.4) / 96, page.width * 0.7);
  const h = (w * img.heightPx) / img.widthPx;
  s.addObject(createImage(img.src, w, h, { x: page.width / 2, y: page.height / 2 }));
}

export async function insertImage(file?: File | null) {
  const f = file ?? (await pickFile('image/png,image/jpeg,image/webp,image/gif'));
  if (!f) return;
  try {
    await insertImageFromFile(f);
  } catch (e) {
    st().toast(errorText(e), 'error');
  }
}

export function addTemplate(id: string) {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) return;
  const s = st();
  const page = t.build();
  const current = s.doc.pages[s.pageIndex];
  if (current.objects.length === 0) {
    s.commit((d) => void d.pages.splice(s.pageIndex, 1, page));
    s.setPageIndex(s.pageIndex);
  } else {
    s.commit((d) => void d.pages.push(page));
    s.setPageIndex(st().doc.pages.length - 1);
  }
  s.setDialog(null);
  s.toast(`أُضيف نموذج «${t.name}».`, 'success');
}

export async function printDocument() {
  try {
    await ensurePageFonts(st().doc.pages);
    printPages(st().doc.pages);
  } catch (e) {
    st().toast(errorText(e), 'error');
  }
}

/** Files dropped on the window: projects, KLX files or images. */
export async function handleDroppedFiles(files: FileList) {
  const f = files[0];
  if (!f) return;
  const name = f.name.toLowerCase();
  if (name.endsWith('.klx')) return importKlxFile(f);
  if (name.endsWith('.json') || name.endsWith('.midad')) return openProjectFile(f);
  if (f.type.startsWith('image/')) return insertImage(f);
  st().toast('نوع الملف غير مدعوم. اسحب مشروعًا أو ملف KLX أو صورة.', 'error');
}
