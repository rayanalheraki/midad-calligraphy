import type { ComponentType } from 'react';
import { useEditor, type Tool } from '../store/editor';
import { IconGlyph, IconHand, IconMarks, IconSelect, IconStretch, IconText } from './icons';

const TOOLS: { id: Tool; label: string; key: string; icon: ComponentType }[] = [
  { id: 'select', label: 'تحديد وتحريك', key: 'V', icon: IconSelect },
  { id: 'glyph', label: 'تحرير المقاطع والحروف', key: 'G', icon: IconGlyph },
  { id: 'stretch', label: 'مدّ الحروف والمقاطع', key: 'E', icon: IconStretch },
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
    </aside>
  );
}
