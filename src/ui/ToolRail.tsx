import type { ComponentType } from 'react';
import { useEditor, type Tool } from '../store/editor';
import { insertImage } from './actions';
import { IconGlyph, IconHand, IconImage, IconMarks, IconSelect, IconText } from './icons';

const TOOLS: { id: Tool; label: string; key: string; icon: ComponentType }[] = [
  { id: 'select', label: 'تحديد وتحريك', key: 'V', icon: IconSelect },
  { id: 'glyph', label: 'تحرير الحروف والنقاط', key: 'G', icon: IconGlyph },
  { id: 'text', label: 'سطر خطي جديد', key: 'T', icon: IconText },
  { id: 'mark', label: 'التشكيل والعناصر', key: 'M', icon: IconMarks },
  { id: 'hand', label: 'تحريك الصفحة', key: 'H', icon: IconHand },
];

export function ToolRail() {
  const tool = useEditor((s) => s.tool);
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
      <button type="button" className="tool" aria-label="إدراج صورة" title="إدراج صورة" onClick={() => insertImage()}>
        <IconImage />
      </button>
    </aside>
  );
}
