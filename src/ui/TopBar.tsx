import { useEffect, useRef, useState } from 'react';
import { SHAPE_LABELS } from '../model/defaults';
import type { ShapeKind } from '../model/types';
import { getLoadedFont } from '../engine/fonts';
import { useEditor } from '../store/editor';
import { useFonts } from '../store/fonts';
import {
  importKlxFile,
  insertImage,
  insertShape,
  insertTextLine,
  newDocument,
  openProjectFile,
  printDocument,
  saveProjectFile,
  saveToWorks,
} from './actions';
import { IconDownload, IconRedo, IconUndo } from './icons';

interface Item {
  label?: string;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
  checked?: boolean;
  separator?: boolean;
}

function MenuButton({ id, label, items, open, setOpen }: { id: string; label: string; items: Item[]; open: string | null; setOpen: (v: string | null) => void }) {
  const isOpen = open === id;
  return (
    <div className="menu">
      <button
        type="button"
        className={'menu-trigger' + (isOpen ? ' on' : '')}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setOpen(isOpen ? null : id)}
        onPointerEnter={() => open && open !== id && setOpen(id)}
      >
        {label}
      </button>
      {isOpen && (
        <div className="menu-list" role="menu">
          {items.map((it, i) =>
            it.separator ? (
              <div key={i} className="menu-sep" role="separator" />
            ) : (
              <button
                key={i}
                type="button"
                role={it.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                aria-checked={it.checked}
                disabled={it.disabled}
                onClick={() => {
                  setOpen(null);
                  it.onClick?.();
                }}
              >
                <span className="menu-check" aria-hidden="true">
                  {it.checked ? '✓' : ''}
                </span>
                <span className="menu-label">{it.label}</span>
                {it.shortcut && (
                  <kbd dir="ltr" className="menu-kbd">
                    {it.shortcut}
                  </kbd>
                )}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function TopBar() {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const view = useEditor((s) => s.view);
  const title = useEditor((s) => s.doc.title);
  const hasSelection = useEditor((s) => s.selection.length > 0);
  const pages = useEditor((s) => s.doc.pages.length);
  useFonts((s) => s.version);
  const brandFont = getLoadedFont('aref-ruqaa-bold');
  const st = useEditor.getState();

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(null);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  const shapes = (Object.keys(SHAPE_LABELS) as ShapeKind[]).map((k) => ({ label: SHAPE_LABELS[k], onClick: () => insertShape(k) }));

  return (
    <header className="topbar">
      <div className="brand" aria-label="كِلك ويب">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name" style={brandFont ? { fontFamily: `"${brandFont.cssFamily}", var(--font-ui)` } : undefined}>
          كِلك
        </span>
      </div>
      <nav className="menubar" ref={ref} aria-label="القوائم">
        <MenuButton
          id="file"
          label="ملف"
          open={open}
          setOpen={setOpen}
          items={[
            { label: 'عمل جديد', shortcut: 'Ctrl+Alt+N', onClick: newDocument },
            { label: 'فتح مشروع…', shortcut: 'Ctrl+O', onClick: () => openProjectFile() },
            { label: 'استيراد مستند كِلك (KLX)…', onClick: () => importKlxFile() },
            { separator: true },
            { label: 'حفظ في أعمالي', shortcut: 'Ctrl+S', onClick: saveToWorks },
            { label: 'تنزيل ملف المشروع', shortcut: 'Ctrl+Shift+S', onClick: saveProjectFile },
            { label: 'أعمالي…', onClick: () => st.setDialog('works') },
            { separator: true },
            { label: 'تصدير صورة أو SVG…', shortcut: 'Ctrl+E', onClick: () => st.setDialog('export') },
            { label: 'طباعة أو حفظ PDF…', shortcut: 'Ctrl+P', onClick: printDocument },
          ]}
        />
        <MenuButton
          id="edit"
          label="تحرير"
          open={open}
          setOpen={setOpen}
          items={[
            { label: 'تراجع', shortcut: 'Ctrl+Z', onClick: st.undo, disabled: !canUndo },
            { label: 'إعادة', shortcut: 'Ctrl+Y', onClick: st.redo, disabled: !canRedo },
            { separator: true },
            { label: 'نسخ', shortcut: 'Ctrl+C', onClick: st.copySelected, disabled: !hasSelection },
            { label: 'لصق', shortcut: 'Ctrl+V', onClick: st.paste },
            { label: 'تكرار', shortcut: 'Ctrl+D', onClick: st.duplicateSelected, disabled: !hasSelection },
            { label: 'حذف', shortcut: 'Delete', onClick: st.removeSelected, disabled: !hasSelection },
            { separator: true },
            {
              label: 'تحديد الكل',
              shortcut: 'Ctrl+A',
              onClick: () => st.select(useEditor.getState().doc.pages[useEditor.getState().pageIndex].objects.filter((o) => !o.locked).map((o) => o.id)),
            },
            { label: 'نص الصفحة…', onClick: () => st.setDialog('pageText') },
          ]}
        />
        <MenuButton
          id="view"
          label="عرض"
          open={open}
          setOpen={setOpen}
          items={[
            { label: 'ملاءمة الصفحة', shortcut: 'Ctrl+0', onClick: () => st.setView({ fitRequest: view.fitRequest + 1 }) },
            { label: 'تكبير', shortcut: 'Ctrl++', onClick: () => st.setView({ zoom: Math.min(16, view.zoom * 1.25) }) },
            { label: 'تصغير', shortcut: 'Ctrl+-', onClick: () => st.setView({ zoom: Math.max(0.05, view.zoom / 1.25) }) },
            { separator: true },
            { label: 'المساطر', checked: view.rulers, onClick: () => st.setView({ rulers: !view.rulers }) },
            { label: 'الشبكة', checked: view.grid, onClick: () => st.setView({ grid: !view.grid }) },
            { label: 'الالتقاط والأدلة', checked: view.snap, onClick: () => st.setView({ snap: !view.snap }) },
            { separator: true },
            { label: 'لوحة المفاتيح العربية', onClick: () => st.setKeyboardOpen(!useEditor.getState().keyboardOpen) },
          ]}
        />
        <MenuButton
          id="insert"
          label="إدراج"
          open={open}
          setOpen={setOpen}
          items={[{ label: 'سطر خطي', shortcut: 'T', onClick: insertTextLine }, { label: 'صورة…', onClick: () => insertImage() }, { separator: true }, ...shapes]}
        />
        <MenuButton
          id="page"
          label="صفحة"
          open={open}
          setOpen={setOpen}
          items={[
            { label: 'إعداد الصفحة والخلفية', onClick: () => st.select([]) },
            { label: 'صفحة جديدة', onClick: st.addPage },
            { label: 'تكرار الصفحة', onClick: st.duplicatePage },
            { label: 'حذف الصفحة', onClick: st.removePage, disabled: pages <= 1 },
          ]}
        />
        <MenuButton
          id="help"
          label="مساعدة"
          open={open}
          setOpen={setOpen}
          items={[
            { label: 'النماذج…', onClick: () => st.setDialog('templates') },
            { label: 'خطوطي…', onClick: () => st.setDialog('fonts') },
            { label: 'اختصارات لوحة المفاتيح', onClick: () => st.setDialog('shortcuts') },
            { separator: true },
            { label: 'عن كِلك ويب والأمان', onClick: () => st.setDialog('about') },
          ]}
        />
      </nav>
      <div className="doc-title" title={title}>
        {title}
      </div>
      <div className="top-actions">
        <button type="button" className="icon-btn" aria-label="تراجع" title="تراجع (Ctrl+Z)" disabled={!canUndo} onClick={st.undo}>
          <IconRedo />
        </button>
        <button type="button" className="icon-btn" aria-label="إعادة" title="إعادة (Ctrl+Y)" disabled={!canRedo} onClick={st.redo}>
          <IconUndo />
        </button>
        <button type="button" className="btn-secondary" onClick={() => st.setDialog('templates')}>
          النماذج
        </button>
        <button type="button" className="btn-primary" onClick={() => st.setDialog('export')}>
          <IconDownload /> تصدير
        </button>
      </div>
    </header>
  );
}
