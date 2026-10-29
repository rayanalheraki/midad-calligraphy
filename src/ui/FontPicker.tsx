import { useEffect, useRef, useState } from 'react';
import { allFontDefs, findFontDef, getLoadedFont, type FontDef } from '../engine/fonts';
import { computeTextGeometry } from '../engine/layout';
import { createText } from '../model/defaults';
import { useFonts } from '../store/fonts';
import { useEditor } from '../store/editor';

const SAMPLE = 'بسم الله الرحمن الرحيم';

const samples = new Map<string, { d: string; vb: string }>();

/** The sample drawn by the app's own shaping, so it looks exactly as it will on the page. */
function FontSample({ def }: { def: FontDef }) {
  const lf = getLoadedFont(def.id);
  if (!lf) return <span className="font-sample pending">{SAMPLE}</span>;
  let s = samples.get(def.id);
  if (!s) {
    const geo = computeTextGeometry(createText({ text: SAMPLE, fontId: def.id, size: 10 }), lf);
    const b = geo.baseBox;
    s = { d: geo.glyphs.filter((g) => !g.hidden).map((g) => g.d).join(''), vb: `${b.minX - 1} ${b.minY - 1} ${b.maxX - b.minX + 2} ${b.maxY - b.minY + 2}` };
    samples.set(def.id, s);
  }
  return (
    <svg className="font-sample" viewBox={s.vb} preserveAspectRatio="xMaxYMid meet" role="img" aria-label={SAMPLE}>
      <path d={s.d} />
    </svg>
  );
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
        {current ? <FontSample def={current} /> : <span className="font-sample">{SAMPLE}</span>}
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
                  <FontSample def={def} />
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
