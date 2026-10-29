import type { Draft } from 'immer';
import type { DocObject, Fill, StrokesObject } from '../model/types';
import { SUPPORTED_LETTERS, strokeLine } from '../engine/strokeLetters';
import { strokeInput } from '../render/strokesInput';
import { useEditor } from '../store/editor';
import { FillEditor, Row, Section, SliderNumber, Toggle } from './controls';

function ops(id: string) {
  const live = (recipe: (o: Draft<StrokesObject>) => void) => {
    const st = useEditor.getState();
    st.liveEdit((d) => {
      const o = d.pages[st.pageIndex].objects.find((x) => x.id === id);
      if (o && o.type === 'strokes') recipe(o);
    });
  };
  const commit = (recipe: (o: Draft<StrokesObject>) => void) =>
    useEditor.getState().updateObject(id, (o: Draft<DocObject>) => {
      if (o.type === 'strokes') recipe(o);
    });
  return { live, commit };
}

/** Panel of a pen line: its text, the nib, and lengthening per letter and connector. */
export function StrokesSection({ o }: { o: StrokesObject }) {
  const { live, commit } = ops(o.id);
  const line = strokeLine(strokeInput(o));
  return (
    <>
      <p className="hint-card">
        نموذج تجريبي: كل حرف مرسوم بضربات قلم مبريّ (خط مركز يمرّ عليه سنّ القلم)، فيُمدّ الحرف وتطول الوصلات دون أن يتغير سُمك القلم. الأشكال الحالية مؤقتة إلى أن تُرقمَن كتابة الخطاط.
      </p>
      <Section title="النص">
        <input
          type="text"
          className="text-field"
          dir="rtl"
          value={o.text}
          maxLength={500}
          aria-label="نص السطر"
          onFocus={() => useEditor.getState().beginGesture()}
          onBlur={() => useEditor.getState().endGesture()}
          onChange={(e) => {
            const next = e.target.value;
            live((d) => {
              d.text = next;
              // Lengthening is kept per letter position; positions that no longer exist go.
              for (const k of Object.keys(d.madd)) if (Number(k) >= next.length) delete d.madd[k];
              for (const k of Object.keys(d.kashida)) if (Number(k) >= next.length) delete d.kashida[k];
            });
          }}
        />
        <p className="note">الحروف المتاحة في النموذج: {SUPPORTED_LETTERS}</p>
        {line.unsupported.length > 0 && <p className="note warn">حروف غير مرسومة بعد: {line.unsupported.join(' ')}</p>}
      </Section>
      <Section title="القلم">
        <Row label="الحجم">
          <SliderNumber label="حجم الخط" value={o.size} min={5} max={200} step={0.5} unit="مم" onChange={(v) => live((d) => void (d.size = v))} />
        </Row>
        <Row label="عرض السنّ">
          <SliderNumber label="عرض سنّ القلم" value={Math.round(o.nibWidth * 1000) / 10} min={3} max={25} step={0.5} unit="٪" onChange={(v) => live((d) => void (d.nibWidth = v / 100))} />
        </Row>
        <Row label="زاوية القلم">
          <SliderNumber label="زاوية سنّ القلم" value={o.nibAngle} min={0} max={90} unit="°" onChange={(v) => live((d) => void (d.nibAngle = v))} />
        </Row>
        <Toggle label="إظهار خط المركز ونقاطه" checked={o.showSkeleton} onChange={(v) => commit((d) => void (d.showSkeleton = v))} />
      </Section>
      <Section title="المدّ والوصلات">
        {line.letters.length === 0 && <p className="note">لا توجد حروف مرسومة.</p>}
        {line.letters.map((l) => (
          <div key={l.index}>
            {l.maddable && (
              <Row label={`مدّ «${l.char}»`}>
                <SliderNumber
                  label={`مدّ الحرف ${l.char}`}
                  value={Math.round((o.madd[String(l.index)] ?? 0) * 100)}
                  min={0}
                  max={100}
                  unit="٪"
                  onChange={(v) => live((d) => void (d.madd[String(l.index)] = v / 100))}
                />
              </Row>
            )}
            {l.joinsNext && (
              <Row label={`وصلة بعد «${l.char}»`}>
                <SliderNumber
                  label={`طول الوصلة بعد ${l.char}`}
                  value={Math.round((o.kashida[String(l.index)] ?? 0) * 100)}
                  min={0}
                  max={200}
                  unit="٪"
                  onChange={(v) => live((d) => void (d.kashida[String(l.index)] = v / 100))}
                />
              </Row>
            )}
          </div>
        ))}
        {(Object.keys(o.madd).length > 0 || Object.keys(o.kashida).length > 0) && (
          <button type="button" className="link" onClick={() => commit((d) => ((d.madd = {}), (d.kashida = {})))}>
            إلغاء كل المدّ والوصلات
          </button>
        )}
      </Section>
      <Section title="اللون" open={false}>
        <FillEditor fill={o.fill} onCommit={(f: Fill) => commit((d) => void (d.fill = f))} onLive={(f: Fill) => live((d) => void (d.fill = f))} />
      </Section>
    </>
  );
}
