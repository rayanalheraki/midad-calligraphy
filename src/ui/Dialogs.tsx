import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Draft } from 'immer';
import type { TextObject } from '../model/types';
import { createText } from '../model/defaults';
import { applyTextEdit } from '../model/textEdit';
import { TEMPLATES } from '../model/templates';
import { emptyRect, unionRect } from '../engine/geom';
import { worldBox } from '../render/bounds';
import { PageContent } from '../render/PageView';
import { downloadBlob, ensurePageFonts, pageSvgString, printPages, rasterize, safeFileName, type MirrorExport } from '../io/export';
import { idbAll, idbDelete, type SavedWork } from '../io/storage';
import { parseProject } from '../io/project';
import { pickFile } from '../io/files';
import { useEditor, usePage } from '../store/editor';
import { useFonts } from '../store/fonts';
import { addTemplate } from './actions';
import { Row, Segmented, Toggle } from './controls';
import { lastTextStyle } from './textDefaults';
import { IconClose, IconTrash } from './icons';

function Modal({ title, children, wide, onClose }: { title: string; children: ReactNode; wide?: boolean; onClose?: () => void }) {
  const close = onClose ?? (() => useEditor.getState().setDialog(null));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', esc);
    ref.current?.querySelector<HTMLElement>('button, input, select, textarea')?.focus();
    return () => window.removeEventListener('keydown', esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="إغلاق" onClick={close}>
            <IconClose />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function ExportDialog() {
  const page = usePage();
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const [format, setFormat] = useState<'png' | 'jpeg' | 'svg' | 'pdf'>('png');
  const [dpi, setDpi] = useState(300);
  const [scope, setScope] = useState<'page' | 'selection' | 'all'>('page');
  const [mirror, setMirror] = useState<MirrorExport>('none');
  const [transparent, setTransparent] = useState(false);
  const [busy, setBusy] = useState(false);
  const st = useEditor.getState();

  const crop = useMemo(() => {
    if (scope !== 'selection' || !selection.length) return null;
    const box = page.objects.filter((o) => selection.includes(o.id)).reduce((acc, o) => unionRect(acc, worldBox(o)), emptyRect());
    return { minX: box.minX - 2, minY: box.minY - 2, maxX: box.maxX + 2, maxY: box.maxY + 2 };
  }, [scope, selection, page]);
  const w = crop ? crop.maxX - crop.minX : page.width;
  const h = crop ? crop.maxY - crop.minY : page.height;
  const raster = format === 'png' || format === 'jpeg';

  const run = async () => {
    setBusy(true);
    try {
      const name = safeFileName(doc.title);
      if (format === 'pdf') {
        const pages = scope === 'all' ? doc.pages : [page];
        await ensurePageFonts(pages);
        st.setDialog(null);
        printPages(pages);
        return;
      }
      await ensurePageFonts([page]);
      const { svg, width, height } = pageSvgString(page, { crop, mirror, transparent: transparent && format === 'png' });
      if (format === 'svg') {
        downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${name}.svg`);
      } else {
        const { blob, dpi: used } = await rasterize(svg, width, height, dpi, format === 'png' ? 'image/png' : 'image/jpeg');
        downloadBlob(blob, `${name}.${format === 'png' ? 'png' : 'jpg'}`);
        if (used < dpi) st.toast(`خُفّضت الدقة إلى ${used} نقطة/بوصة لأن الصورة كبيرة جدًا.`, 'info');
      }
      st.toast('اكتمل التصدير.', 'success');
      st.setDialog(null);
    } catch (e) {
      st.toast((e as Error).message || 'تعذّر التصدير.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="تصدير">
      <Row label="الصيغة">
        <Segmented
          label="صيغة التصدير"
          value={format}
          onChange={(f) => {
            setFormat(f);
            if (f !== 'pdf' && scope === 'all') setScope('page');
          }}
          options={[
            { value: 'png', label: 'PNG' },
            { value: 'jpeg', label: 'JPEG' },
            { value: 'svg', label: 'SVG متجه' },
            { value: 'pdf', label: 'PDF / طباعة' },
          ]}
        />
      </Row>
      <Row label="النطاق">
        <Segmented
          label="نطاق التصدير"
          value={scope}
          onChange={setScope}
          options={
            format === 'pdf'
              ? [
                  { value: 'page', label: 'الصفحة الحالية' },
                  { value: 'all', label: 'كل الصفحات' },
                ]
              : [
                  { value: 'page', label: 'الصفحة الحالية' },
                  { value: 'selection', label: 'العناصر المحددة' },
                ]
          }
        />
      </Row>
      {scope === 'selection' && !selection.length && <p className="note">لم تحدد عناصر بعد؛ ستُصدَّر الصفحة كاملة.</p>}
      {raster && (
        <Row label="الدقة">
          <select value={dpi} onChange={(e) => setDpi(Number(e.target.value))}>
            {[72, 150, 300, 600].map((d) => (
              <option key={d} value={d}>
                {d} نقطة/بوصة
              </option>
            ))}
          </select>
          <span className="muted" dir="ltr">
            {Math.round((w / 25.4) * dpi)} × {Math.round((h / 25.4) * dpi)} px
          </span>
        </Row>
      )}
      {format !== 'pdf' && (
        <Row label="عكس الصورة">
          <Segmented
            label="عكس الصورة"
            value={mirror}
            onChange={setMirror}
            options={[
              { value: 'none', label: 'بدون' },
              { value: 'h', label: 'أفقي' },
              { value: 'v', label: 'رأسي' },
              { value: 'both', label: 'كلاهما' },
            ]}
          />
        </Row>
      )}
      {format === 'png' && <Toggle label="خلفية شفافة" checked={transparent} onChange={setTransparent} />}
      {format === 'pdf' && <p className="note">سيفتح مربع الطباعة؛ اختر «حفظ بتنسيق PDF» للحصول على ملف PDF متجه بمقاس الصفحة.</p>}
      {format === 'svg' && <p className="note">تُحوَّل الحروف إلى مسارات، فيُفتح الملف في أي برنامج رسم دون الحاجة إلى الخطوط.</p>}
      <div className="modal-actions">
        <button type="button" className="btn-primary" disabled={busy} onClick={run}>
          {busy ? 'جارٍ التصدير…' : format === 'pdf' ? 'فتح مربع الطباعة' : 'تصدير وتنزيل'}
        </button>
      </div>
    </Modal>
  );
}

function TemplatesDialog() {
  const version = useFonts((s) => s.version);
  const pages = useMemo(() => TEMPLATES.map((t) => ({ t, page: t.build() })), []);
  useEffect(() => {
    const req = useFonts.getState().request;
    for (const { page } of pages) for (const o of page.objects) if (o.type === 'text') void req(o.fontId);
  }, [pages]);
  return (
    <Modal title="النماذج" wide>
      <p className="lead">اختر نموذجًا ليُضاف صفحةً جديدة، ثم عدّل نصوصه وألوانه كما تشاء.</p>
      <div className="template-grid">
        {pages.map(({ t, page }) => (
          <button key={t.id} type="button" className="template-card" onClick={() => addTemplate(t.id)}>
            <svg viewBox={`0 0 ${page.width} ${page.height}`} className="template-preview" aria-hidden="true">
              <PageContent page={page} mode="export" fontsVersion={version} />
            </svg>
            <span className="template-name">{t.name}</span>
            <span className="template-desc">{t.description}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function WorksDialog() {
  const [works, setWorks] = useState<SavedWork[] | null>(null);
  const st = useEditor.getState();
  const load = () =>
    idbAll<SavedWork>('works')
      .then((w) => setWorks(w.sort((a, b) => b.modified.localeCompare(a.modified))))
      .catch(() => setWorks([]));
  useEffect(() => void load(), []);
  return (
    <Modal title="أعمالي" wide>
      {works === null ? (
        <p className="lead">جارٍ التحميل…</p>
      ) : works.length === 0 ? (
        <p className="lead">لا توجد أعمال محفوظة بعد. استخدم «حفظ في أعمالي» من قائمة ملف (Ctrl+S).</p>
      ) : (
        <div className="template-grid">
          {works.map((w) => (
            <div key={w.id} className="template-card work">
              <button
                type="button"
                className="work-open"
                onClick={() => {
                  try {
                    const { doc } = parseProject(w.json);
                    st.loadDoc(doc, w.id);
                    st.setDialog(null);
                  } catch (e) {
                    st.toast((e as Error).message, 'error');
                  }
                }}
              >
                {/^data:image\/png;base64,/.test(w.thumb) && <img src={w.thumb} alt="" className="template-preview" />}
                <span className="template-name">{w.title}</span>
                <span className="template-desc">{new Date(w.modified).toLocaleString('ar')}</span>
              </button>
              <button
                type="button"
                className="mini danger"
                aria-label={`حذف ${w.title}`}
                onClick={async () => {
                  if (!confirm(`حذف «${w.title}» من أعمالي؟`)) return;
                  await idbDelete('works', w.id);
                  if (st.savedWorkId === w.id) st.setSavedWorkId(null);
                  void load();
                }}
              >
                <IconTrash />
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function PageTextDialog() {
  const page = usePage();
  const lines = useMemo(() => page.objects.filter((o): o is TextObject => o.type === 'text').sort((a, b) => a.y - b.y), [page]);
  const [value, setValue] = useState(lines.map((l) => l.text).join('\n'));
  const st = useEditor.getState();
  const apply = () => {
    const rows = value.split('\n').map((r) => r.trim());
    st.commit((d) => {
      const objs = d.pages[st.pageIndex].objects;
      let lastY = lines.length ? lines[lines.length - 1].y : page.height * 0.25;
      let size = lines.length ? lines[lines.length - 1].size : (lastTextStyle.size ?? 18);
      rows.forEach((row, i) => {
        if (i < lines.length) {
          const o = objs.find((x) => x.id === lines[i].id);
          if (o && o.type === 'text') applyTextEdit(o as Draft<TextObject>, row);
        } else if (row) {
          lastY += Math.max(12, size * 1.9);
          objs.push(createText({ ...lastTextStyle, text: row, x: page.width / 2, y: lastY }) as Draft<TextObject>);
          size = lastTextStyle.size ?? size;
        }
      });
    });
    st.setDialog(null);
  };
  return (
    <Modal title="نص الصفحة">
      <p className="lead">كل سطر هنا يقابل سطرًا خطيًا في الصفحة، من الأعلى إلى الأسفل. الأسطر الإضافية تُضاف أسفل الصفحة.</p>
      <textarea className="text-input tall" dir="rtl" value={value} onChange={(e) => setValue(e.target.value.slice(0, 20000))} />
      <div className="modal-actions">
        <button type="button" className="btn-primary" onClick={apply}>
          تطبيق على الصفحة
        </button>
      </div>
    </Modal>
  );
}

function FontsDialog() {
  const userFonts = useFonts((s) => s.userFonts);
  const st = useEditor.getState();
  return (
    <Modal title="خطوطي">
      <p className="lead">
        أضف خطوطًا من جهازك (TTF أو OTF) لتستخدمها في التخطيط، مثل خطوط الثلث والديواني التي تملك ترخيص استخدامها. تُحفظ الخطوط في متصفحك فقط.
      </p>
      {userFonts.length === 0 ? (
        <p className="empty">لم تُضف خطوطًا بعد.</p>
      ) : (
        <ul className="font-files">
          {userFonts.map((f) => (
            <li key={f.id}>
              <span>{f.name}</span>
              <button type="button" className="mini danger" aria-label={`حذف ${f.name}`} onClick={() => void useFonts.getState().deleteUserFont(f.id)}>
                <IconTrash />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="modal-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={async () => {
            const file = await pickFile('.ttf,.otf,font/ttf,font/otf');
            if (!file) return;
            try {
              const def = await useFonts.getState().addUserFont(file);
              st.toast(`أُضيف الخط «${def.name}».`, 'success');
            } catch (e) {
              st.toast((e as Error).message, 'error');
            }
          }}
        >
          إضافة خط…
        </button>
      </div>
    </Modal>
  );
}

function ImportDialog() {
  const report = useEditor((s) => s.importReport);
  const st = useEditor.getState();
  if (!report) return null;
  return (
    <Modal title={report.title} onClose={() => (st.setImportReport(null), st.setDialog(null))}>
      {report.lines.length > 0 && (
        <ul className="report">
          {report.lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
      {report.warnings.length > 0 && (
        <>
          <h3 className="sub-title">ملاحظات</h3>
          <ul className="report warn">
            {report.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}

const SHORTCUTS: [string, string][] = [
  ['V', 'أداة التحديد'],
  ['G', 'تحرير المقاطع والحروف'],
  ['نقرتان', 'تحديد حرف واحد داخل المقطع (Esc للعودة إلى المقطع)'],
  ['[ / ]', 'البديل السابق / التالي للمقطع أو الحرف'],
  ['E', 'مدّ الحروف والمقاطع'],
  ['T', 'سطر خطي جديد'],
  ['M', 'التشكيل والعناصر المنفصلة'],
  ['H أو المسافة', 'تحريك الصفحة'],
  ['Ctrl+Z / Ctrl+Y', 'تراجع / إعادة'],
  ['Ctrl+C / Ctrl+V', 'نسخ / لصق'],
  ['Ctrl+D', 'تكرار العنصر'],
  ['Delete', 'حذف المحدد'],
  ['الأسهم (+Shift)', 'تحريك المحدد ١ مم (١٠ مم)'],
  ['Ctrl+S', 'حفظ في أعمالي'],
  ['Ctrl+E', 'تصدير'],
  ['Ctrl+عجلة الفأرة', 'تكبير وتصغير'],
  ['Shift أثناء التدوير', 'تدوير بخطوات ١٥°'],
  ['Alt أثناء السحب', 'تعطيل الالتقاط'],
  ['Esc', 'إلغاء التحديد / الخروج من تحرير المقاطع'],
];

function ShortcutsDialog() {
  return (
    <Modal title="اختصارات لوحة المفاتيح">
      <table className="shortcuts">
        <tbody>
          {SHORTCUTS.map(([k, d]) => (
            <tr key={k}>
              <td>
                <kbd dir="ltr">{k}</kbd>
              </td>
              <td>{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

function AboutDialog() {
  return (
    <Modal title="عن مِداد">
      <p className="lead">
        مِداد محرر للخط العربي يعمل بالكامل داخل المتصفح: أسطر خطية بأنماط النسخ والثلث والديواني والرقعة والنستعليق والكوفي، وتحرير كل مقطع وحرف ونقطة وحركة، وبدائل الأشكال، ومدّ الحروف، والكشيدة، والتكرار الدوراني، والمرآة، والحركات والعناصر المنفصلة، والتصدير.
      </p>
      <h3 className="sub-title">الخصوصية والأمان</h3>
      <ul className="report">
        <li>لا يتصل التطبيق بأي خادم خارجي؛ الخطوط ومحرك تشكيل الحروف (HarfBuzz) مضمّنة فيه.</li>
        <li>أعمالك تبقى في متصفحك (IndexedDB) أو في ملف تنزّله بنفسك.</li>
        <li>الملفات المفتوحة تُفحص قبل استخدامها: المشاريع تُقبل حقولها المعروفة فقط، وملفات KLX تُقرأ بقارئ محدود الحجم والعمق.</li>
        <li>لا يحتاج إلى صلاحيات مدير النظام ولا تعريفات ولا مفاتيح حماية، ولا يطلب تعطيل أي إعداد أمان.</li>
      </ul>
      <h3 className="sub-title">مكونات مفتوحة المصدر</h3>
      <p className="muted">
        HarfBuzz (رخصة MIT). الخطوط: أميري، أميري قرآن، شهرزاد، لطيف، ميرزا، ثلث مشرف، رُدود، ليلى ديواني، عارف رقعة، ريم كوفي، قاهري، نوتو نستعليق، گلزار، القلمي، كاتبة، رقّاص، لاله‌زار، جمهورية، مرحي، المسيري، تجوال — جميعها برخصة SIL Open Font License.
      </p>
    </Modal>
  );
}

export function Dialogs() {
  const dialog = useEditor((s) => s.dialog);
  switch (dialog) {
    case 'export':
      return <ExportDialog />;
    case 'templates':
      return <TemplatesDialog />;
    case 'works':
      return <WorksDialog />;
    case 'pageText':
      return <PageTextDialog />;
    case 'fonts':
      return <FontsDialog />;
    case 'import':
      return <ImportDialog />;
    case 'shortcuts':
      return <ShortcutsDialog />;
    case 'about':
      return <AboutDialog />;
    default:
      return null;
  }
}

export function Toasts() {
  const toasts = useEditor((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={'toast ' + t.kind} onClick={() => useEditor.getState().dismissToast(t.id)}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
