import { useEditor } from '../store/editor';
import { useCursor } from '../store/cursor';
import { IconFit, IconMinus, IconPlus } from './icons';

const HINTS: Record<string, string> = {
  select: 'انقر عنصرًا لتحديده، وانقر مرتين على سطر لتحرير مقاطعه.',
  glyph: 'نقرة تحدد المقطع ونقرتان تحددان الحرف؛ اسحب للتحريك، و[ ] للتنقل بين البدائل. Esc للخروج.',
  stretch: 'اسحب الحرف نحو اليسار لمدّه ونحو اليمين لتقصيره. Esc للخروج.',
  text: 'انقر في الصفحة لإضافة سطر خطي.',
  mark: 'انقر في الصفحة لوضع الحركة أو العنصر المختار. Esc للخروج.',
  hand: 'اسحب لتحريك الصفحة. يمكنك أيضًا الضغط على المسافة أثناء السحب.',
};

export function StatusBar() {
  const pages = useEditor((s) => s.doc.pages);
  const pageIndex = useEditor((s) => s.pageIndex);
  const zoom = useEditor((s) => s.view.zoom);
  const fitRequest = useEditor((s) => s.view.fitRequest);
  const tool = useEditor((s) => s.tool);
  const pos = useCursor((s) => s.pos);
  const st = useEditor.getState();
  return (
    <footer className="statusbar">
      <div className="pages" role="tablist" aria-label="الصفحات">
        {pages.map((p, i) => (
          <button key={p.id} type="button" role="tab" aria-selected={i === pageIndex} className={i === pageIndex ? 'on' : ''} onClick={() => st.setPageIndex(i)}>
            صفحة {i + 1}
          </button>
        ))}
        <button type="button" className="add-page" aria-label="صفحة جديدة" title="صفحة جديدة" onClick={st.addPage}>
          <IconPlus />
        </button>
      </div>
      <span className="hint">{HINTS[tool]}</span>
      <span className="coords" dir="ltr">
        {pos ? `${pos.x.toFixed(1)} × ${pos.y.toFixed(1)} mm` : ''}
      </span>
      <div className="zoom">
        <button type="button" className="icon-btn" aria-label="تصغير" onClick={() => st.setView({ zoom: Math.max(0.05, zoom / 1.25) })}>
          <IconMinus />
        </button>
        <span className="zoom-value" dir="ltr">
          {Math.round(zoom * 100)}%
        </span>
        <button type="button" className="icon-btn" aria-label="تكبير" onClick={() => st.setView({ zoom: Math.min(16, zoom * 1.25) })}>
          <IconPlus />
        </button>
        <button type="button" className="icon-btn" aria-label="ملاءمة الصفحة" title="ملاءمة الصفحة" onClick={() => st.setView({ fitRequest: fitRequest + 1 })}>
          <IconFit />
        </button>
      </div>
    </footer>
  );
}
