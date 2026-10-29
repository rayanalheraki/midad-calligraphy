import { useEffect, useMemo } from 'react';
import { createMark } from '../model/defaults';
import { ELEMENT_GROUPS, ELEMENTS } from '../model/elements';
import type { MarkShape } from '../model/types';
import { getLoadedFont } from '../engine/fonts';
import { markGeometry } from '../engine/marks';
import { useEditor } from '../store/editor';
import { useFonts } from '../store/fonts';

const PREVIEW_FONT = 'amiri-quran';
const DOTTED_CIRCLE = '◌';

function DotsPreview({ shape }: { shape: MarkShape }) {
  const d = useMemo(() => markGeometry(createMark({ element: shape, shape, text: '', size: 30 }))?.d ?? '', [shape]);
  return (
    <svg viewBox="-6 -6 12 12" width="22" height="22" aria-hidden="true">
      <path d={d} fill="currentColor" />
    </svg>
  );
}

/** Palette of standalone elements; choosing one arms the element tool. */
export function ElementsPalette() {
  const pending = useEditor((s) => s.pendingElement);
  const tool = useEditor((s) => s.tool);
  useFonts((s) => s.version);
  useEffect(() => void useFonts.getState().request(PREVIEW_FONT), []);
  const lf = getLoadedFont(PREVIEW_FONT);
  const fontStyle = lf ? { fontFamily: `"${lf.cssFamily}", var(--font-ui)` } : undefined;

  return (
    <div className="elements">
      {ELEMENT_GROUPS.map((g) => (
        <div key={g.id} className="elements-group">
          <span className="marks-title">{g.title}</span>
          <div className="elements-grid">
            {ELEMENTS.filter((e) => e.group === g.id).map((e) => {
              const on = tool === 'mark' && pending === e.id;
              return (
                <button
                  key={e.id}
                  type="button"
                  className={'element-btn' + (on ? ' on' : '')}
                  title={e.label}
                  aria-label={e.label}
                  aria-pressed={on}
                  onClick={() => useEditor.getState().startElement(e.id)}
                >
                  {e.shape === 'glyph' ? (
                    <span className="element-glyph" style={fontStyle}>
                      {e.combining ? DOTTED_CIRCLE + e.text : e.text}
                    </span>
                  ) : (
                    <DotsPreview shape={e.shape} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
