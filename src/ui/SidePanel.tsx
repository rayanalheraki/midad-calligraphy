import { useState } from 'react';
import type { DocObject } from '../model/types';
import { findElement } from '../model/elements';
import { usePage, useEditor } from '../store/editor';
import { Inspector } from './Inspector';
import { IconDown, IconEye, IconLock, IconUp } from './icons';

function describe(o: DocObject): string {
  switch (o.type) {
    case 'text':
      return o.text.trim().slice(0, 28) || 'سطر فارغ';
    case 'mark':
      return (findElement(o.element)?.label ?? o.name) + (o.ownerId ? ' (مرتبط)' : '');
    case 'image':
      return 'صورة';
  }
}

const TYPE_LABEL: Record<DocObject['type'], string> = { text: 'سطر', mark: 'عنصر', image: 'صورة' };

function Layers() {
  const page = usePage();
  const selection = useEditor((s) => s.selection);
  const st = useEditor.getState();
  const items = [...page.objects].reverse();
  if (!items.length) return <p className="empty">الصفحة فارغة. أضف سطرًا خطيًا أو حركة أو نموذجًا جاهزًا.</p>;
  return (
    <ul className="layers" aria-label="عناصر الصفحة">
      {items.map((o) => (
        <li key={o.id} className={selection.includes(o.id) ? 'on' : ''}>
          <button
            type="button"
            className="layer-main"
            onClick={(e) => (e.shiftKey ? st.toggleSelect(o.id) : st.select([o.id]))}
            onDoubleClick={() => o.type === 'text' && (st.select([o.id]), st.setTool('glyph'))}
          >
            <span className="layer-type">{TYPE_LABEL[o.type]}</span>
            <span className={'layer-name' + (o.hidden ? ' muted' : '')}>{describe(o)}</span>
          </button>
          <span className="layer-tools">
            <button type="button" className="mini" aria-label="إلى الأمام" title="إلى الأمام" onClick={() => st.reorder(o.id, 'up')}>
              <IconUp />
            </button>
            <button type="button" className="mini" aria-label="إلى الخلف" title="إلى الخلف" onClick={() => st.reorder(o.id, 'down')}>
              <IconDown />
            </button>
            <button type="button" className="mini" aria-label={o.hidden ? 'إظهار' : 'إخفاء'} title={o.hidden ? 'إظهار' : 'إخفاء'} onClick={() => st.updateObject(o.id, (d) => void (d.hidden = !d.hidden))}>
              <IconEye off={o.hidden} />
            </button>
            <button type="button" className="mini" aria-label={o.locked ? 'فك القفل' : 'قفل'} title={o.locked ? 'فك القفل' : 'قفل'} onClick={() => st.updateObject(o.id, (d) => void (d.locked = !d.locked))}>
              <IconLock open={!o.locked} />
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SidePanel() {
  const [tab, setTab] = useState<'props' | 'layers'>('props');
  return (
    <aside className="sidepanel">
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'props'} className={tab === 'props' ? 'on' : ''} onClick={() => setTab('props')}>
          الخصائص
        </button>
        <button type="button" role="tab" aria-selected={tab === 'layers'} className={tab === 'layers' ? 'on' : ''} onClick={() => setTab('layers')}>
          العناصر
        </button>
      </div>
      <div className="panel-scroll" role="tabpanel">
        {tab === 'props' ? <Inspector /> : <Layers />}
      </div>
    </aside>
  );
}
