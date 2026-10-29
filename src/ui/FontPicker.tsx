import { useEffect, useRef, useState } from 'react';
import { allFontDefs, findFontDef, getLoadedFont, type FontDef } from '../engine/fonts';
import { useFonts } from '../store/fonts';
import { useEditor } from '../store/editor';

const SAMPLE = 'بسم الله الرحمن الرحيم';

function previewStyle(def: FontDef) {
  const lf = getLoadedFont(def.id);
  return lf ? { fontFamily: `"${lf.cssFamily}", var(--font-ui)` } : undefined;
}

export function FontPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useFonts((s) => s.version);
  const userFonts = useFonts((s) => s.userFonts);
  const current = findFontDef(value);

  useEffect(() => {
    if (!open) return;
    const req = useFonts.getState().request;
    for (const def of allFontDefs()) void req(def.id);
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  const groups = new Map<string, FontDef[]>();
  for (const def of allFontDefs()) {
    const g = groups.get(def.category) ?? [];
    g.push(def);
    groups.set(def.category, g);
  }

  return (
    <div className="font-picker" ref={ref}>
      <button type="button" className="font-current" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="font-name">{current?.name ?? value}</span>
        <span className="font-cat">{current?.category}</span>
        <span className="font-sample" style={current ? previewStyle(current) : undefined}>
          {SAMPLE}
        </span>
      </button>
      {open && (
        <div className="font-list" role="listbox" aria-label="الخطوط">
          {[...groups.entries()].map(([cat, defs]) => (
            <div key={cat} className="font-group">
              <div className="font-group-title">{cat}</div>
              {defs.map((def) => (
                <button
                  key={def.id}
                  type="button"
                  role="option"
                  aria-selected={def.id === value}
                  className={'font-item' + (def.id === value ? ' on' : '')}
                  onClick={() => {
                    onChange(def.id);
                    setOpen(false);
                  }}
                >
                  <span className="font-name">{def.name}</span>
                  <span className="font-sample" style={previewStyle(def)}>
                    {SAMPLE}
                  </span>
                </button>
              ))}
            </div>
          ))}
          <button type="button" className="font-add" onClick={() => useEditor.getState().setDialog('fonts')}>
            إضافة خط من جهازك…{userFonts.length ? ` (${userFonts.length} مضاف)` : ''}
          </button>
        </div>
      )}
    </div>
  );
}
