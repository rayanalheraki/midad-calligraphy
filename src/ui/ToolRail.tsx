import { useEffect, useRef, useState, type ComponentType } from 'react';
import { SHAPE_LABELS } from '../model/defaults';
import type { ShapeKind } from '../model/types';
import { useEditor, type Tool } from '../store/editor';
import { insertImage, insertShape } from './actions';
import { IconGlyph, IconHand, IconImage, IconPen, IconSelect, IconShapes, IconText } from './icons';

const TOOLS: { id: Tool; label: string; key: string; icon: ComponentType }[] = [
  { id: 'select', label: 'تحديد وتحريك', key: 'V', icon: IconSelect },
  { id: 'glyph', label: 'تحرير الحروف والنقاط', key: 'G', icon: IconGlyph },
  { id: 'text', label: 'سطر خطي جديد', key: 'T', icon: IconText },
  { id: 'pen', label: 'قلم القصب', key: 'P', icon: IconPen },
  { id: 'hand', label: 'تحريك الصفحة', key: 'H', icon: IconHand },
];

export function ToolRail() {
  const tool = useEditor((s) => s.tool);
  const [shapesOpen, setShapesOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!shapesOpen) return;
    const close = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setShapesOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [shapesOpen]);

  return (
    <aside className="toolrail" aria-label="الأدوات">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={'tool' + (tool === t.id ? ' on' : '')}
          aria-pressed={tool === t.id}
          aria-label={t.label}
          title={`${t.label} (${t.key})`}
          onClick={() => useEditor.getState().setTool(t.id)}
        >
          <t.icon />
        </button>
      ))}
      <span className="rail-sep" aria-hidden="true" />
      <div className="rail-pop" ref={ref}>
        <button type="button" className={'tool' + (shapesOpen ? ' on' : '')} aria-label="زخارف وأشكال" title="زخارف وأشكال" aria-expanded={shapesOpen} onClick={() => setShapesOpen((v) => !v)}>
          <IconShapes />
        </button>
        {shapesOpen && (
          <div className="rail-menu" role="menu">
            {(Object.keys(SHAPE_LABELS) as ShapeKind[]).map((k) => (
              <button
                key={k}
                type="button"
                role="menuitem"
                onClick={() => {
                  insertShape(k);
                  setShapesOpen(false);
                }}
              >
                {SHAPE_LABELS[k]}
              </button>
            ))}
          </div>
        )}
      </div>
      <button type="button" className="tool" aria-label="إدراج صورة" title="إدراج صورة" onClick={() => insertImage()}>
        <IconImage />
      </button>
    </aside>
  );
}
