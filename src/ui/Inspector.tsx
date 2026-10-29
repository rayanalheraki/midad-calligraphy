import { useEffect, useRef } from 'react';
import type { Draft } from 'immer';
import type { DocObject, Fill, ImageObject, InkObject, Page, ShapeKind, ShapeObject, TextObject } from '../model/types';
import { defaultGlyphOverride, PAGE_SIZES, SHAPE_LABELS } from '../model/defaults';
import { applyTextEdit } from '../model/textEdit';
import { featureLabel, findFontDef, getLoadedFont } from '../engine/fonts';
import { kashidaSlots, textGeometry } from '../engine/layout';
import { emptyRect, unionRect } from '../engine/geom';
import { reedPenStroke } from '../engine/pen';
import { PATTERN_LABELS } from '../engine/patterns';
import { worldBox } from '../render/bounds';
import { pickFile, readImageFile } from '../io/images';
import { usePage, useEditor, useSelectedObjects } from '../store/editor';
import { useFonts } from '../store/fonts';
import { ColorInput, FillEditor, NumberInput, Row, Section, Segmented, SliderNumber, Toggle } from './controls';
import { FontPicker } from './FontPicker';
import { MarksPalette } from './MarksPalette';
import { rememberTextStyle, textCaret } from './textDefaults';
import { IconCopy, IconKeyboard, IconTrash } from './icons';

type AnyDraft = Draft<DocObject>;

function ops(id: string) {
  const live = (recipe: (o: AnyDraft) => void) => {
    const st = useEditor.getState();
    st.liveEdit((d) => {
      const o = d.pages[st.pageIndex].objects.find((x) => x.id === id);
      if (o) recipe(o);
    });
  };
  const commit = (recipe: (o: AnyDraft) => void) => useEditor.getState().updateObject(id, recipe);
  return { live, commit };
}

function TransformSection({ o }: { o: DocObject }) {
  const { live, commit } = ops(o.id);
  return (
    <Section title="الموضع والتحويل" open={false}>
      <div className="grid2">
        <Row label="س (أفقي)">
          <NumberInput label="الموضع الأفقي" value={o.x} unit="مم" step={0.5} onChange={(v) => live((d) => void (d.x = v))} />
        </Row>
        <Row label="ص (رأسي)">
          <NumberInput label="الموضع الرأسي" value={o.y} unit="مم" step={0.5} onChange={(v) => live((d) => void (d.y = v))} />
        </Row>
        <Row label="تكبير أفقي">
          <NumberInput label="تكبير أفقي" value={o.scaleX} step={0.05} min={-20} max={20} onChange={(v) => live((d) => void (d.scaleX = v || 0.01))} />
        </Row>
        <Row label="تكبير رأسي">
          <NumberInput label="تكبير رأسي" value={o.scaleY} step={0.05} min={-20} max={20} onChange={(v) => live((d) => void (d.scaleY = v || 0.01))} />
        </Row>
      </div>
      <Row label="الدوران">
        <SliderNumber label="الدوران" value={o.rotation} min={-180} max={180} unit="°" onChange={(v) => live((d) => void (d.rotation = v))} />
      </Row>
      <Row label="الشفافية">
        <SliderNumber label="الشفافية" value={Math.round(o.opacity * 100)} min={5} max={100} unit="٪" onChange={(v) => live((d) => void (d.opacity = v / 100))} />
      </Row>
      <div className="btn-row">
        <button type="button" onClick={() => commit((d) => void (d.scaleX = -d.scaleX))}>قلب أفقي</button>
        <button type="button" onClick={() => commit((d) => void (d.scaleY = -d.scaleY))}>قلب رأسي</button>
        <button type="button" onClick={() => commit((d) => void ((d.rotation = 0), (d.scaleX = 1), (d.scaleY = 1)))}>إلغاء التحويل</button>
      </div>
    </Section>
  );
}

function ObjectActions({ o }: { o: DocObject }) {
  const st = useEditor.getState();
  return (
    <div className="object-actions">
      <button type="button" onClick={() => st.duplicateSelected()}>
        <IconCopy /> تكرار
      </button>
      <button type="button" onClick={() => st.updateObject(o.id, (d) => void (d.locked = !d.locked))}>{o.locked ? 'فك القفل' : 'قفل'}</button>
      <button type="button" className="danger" onClick={() => st.removeSelected()}>
        <IconTrash /> حذف
      </button>
    </div>
  );
}

function TextSection({ o }: { o: TextObject }) {
  const { live, commit } = ops(o.id);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const lf = getLoadedFont(o.fontId);
  useFonts((s) => s.version);
  const def = findFontDef(o.fontId);

  useEffect(() => {
    const focus = () => {
      const el = areaRef.current;
      if (!el) return;
      el.focus();
      el.select();
    };
    const caret = () => {
      const el = areaRef.current;
      if (!el || textCaret.objectId !== o.id) return;
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(textCaret.start, textCaret.end);
      });
    };
    window.addEventListener('kelk:focus-text', focus);
    window.addEventListener('kelk:caret', caret);
    return () => {
      window.removeEventListener('kelk:focus-text', focus);
      window.removeEventListener('kelk:caret', caret);
    };
  }, [o.id]);

  const saveCaret = () => {
    const el = areaRef.current;
    if (!el) return;
    textCaret.objectId = o.id;
    textCaret.start = el.selectionStart;
    textCaret.end = el.selectionEnd;
  };

  return (
    <>
      <Section title="النص">
        <textarea
          ref={areaRef}
          className="text-input"
          dir="rtl"
          rows={3}
          value={o.text}
          style={lf ? { fontFamily: `"${lf.cssFamily}", var(--font-ui)` } : undefined}
          placeholder="اكتب النص الذي تريد تخطيطه"
          onFocus={() => useEditor.getState().beginGesture()}
          onBlur={() => {
            saveCaret();
            useEditor.getState().endGesture();
          }}
          onSelect={saveCaret}
          onKeyUp={saveCaret}
          onChange={(e) => {
            const next = e.target.value.slice(0, 5000);
            live((d) => applyTextEdit(d as Draft<TextObject>, next));
            textCaret.objectId = o.id;
            textCaret.start = e.target.selectionStart;
            textCaret.end = e.target.selectionEnd;
          }}
        />
        <div className="btn-row">
          <button type="button" onClick={() => useEditor.getState().setKeyboardOpen(!useEditor.getState().keyboardOpen)}>
            <IconKeyboard /> لوحة المفاتيح
          </button>
          <button type="button" onClick={() => useEditor.getState().setTool('glyph')}>
            تحرير الحروف
          </button>
        </div>
        <details className="sub">
          <summary>الحركات والرموز</summary>
          <MarksPalette />
        </details>
      </Section>

      <Section title="الخط والحجم">
        <FontPicker
          value={o.fontId}
          onChange={(fontId) => {
            commit((d) => void ((d as TextObject).fontId = fontId));
            rememberTextStyle({ fontId });
            void useFonts.getState().request(fontId);
          }}
        />
        <Row label="الحجم">
          <SliderNumber
            label="حجم الخط"
            value={o.size}
            min={3}
            max={150}
            step={0.5}
            unit="مم"
            onChange={(size) => {
              live((d) => void ((d as TextObject).size = size));
              rememberTextStyle({ size });
            }}
          />
        </Row>
        <Row label="تباعد الكلمات">
          <SliderNumber label="تباعد الكلمات" value={o.wordSpacing} min={-20} max={60} step={0.5} unit="مم" onChange={(v) => live((d) => void ((d as TextObject).wordSpacing = v))} />
        </Row>
        {lf && lf.optionalFeatures.length > 0 && (
          <Row label="أشكال بديلة">
            <div className="chips">
              {lf.optionalFeatures.map((f) => {
                const on = o.features.includes(f);
                return (
                  <button
                    key={f}
                    type="button"
                    className={'chip' + (on ? ' on' : '')}
                    aria-pressed={on}
                    onClick={() =>
                      commit((d) => {
                        const t = d as TextObject;
                        t.features = on ? t.features.filter((x) => x !== f) : [...t.features, f];
                      })
                    }
                  >
                    {featureLabel(f)}
                  </button>
                );
              })}
            </div>
          </Row>
        )}
      </Section>

      <Section title="الكشيدة والضبط">
        {def && !def.kashida && <p className="note">لا يستخدم هذا النمط الكشيدة (مثل النستعليق والرقعة)، فلن تظهر الإطالة.</p>}
        <Row label="الكشيدة">
          <SliderNumber label="مقدار الكشيدة" value={o.kashida} min={0} max={12} onChange={(v) => live((d) => void ((d as TextObject).kashida = v))} />
        </Row>
        <Toggle
          label="ضبط طول السطر بالكشيدة"
          checked={o.justifyWidth > 0}
          onChange={(on) =>
            commit((d) => {
              const t = d as TextObject;
              t.justifyWidth = on ? Math.round((lf ? textGeometry(o, lf).width : 120) * 1.25) : 0;
            })
          }
        />
        {o.justifyWidth > 0 && (
          <Row label="طول السطر">
            <SliderNumber label="طول السطر" value={o.justifyWidth} min={10} max={600} unit="مم" onChange={(v) => live((d) => void ((d as TextObject).justifyWidth = v))} />
          </Row>
        )}
        {Object.keys(o.kashidaAt).length > 0 && (
          <button type="button" className="link" onClick={() => commit((d) => void ((d as TextObject).kashidaAt = {}))}>
            إزالة الكشيدات اليدوية
          </button>
        )}
      </Section>

      <Section title="المسار والتكوين" open={false}>
        <Segmented
          label="مسار السطر"
          value={o.path.mode}
          options={[
            { value: 'straight', label: 'مستقيم' },
            { value: 'arc', label: 'قوس' },
            { value: 'circle', label: 'دائرة' },
            { value: 'wave', label: 'موجة' },
          ]}
          onChange={(mode) => commit((d) => void ((d as TextObject).path.mode = mode))}
        />
        {o.path.mode === 'arc' && (
          <Row label="نصف القطر">
            <SliderNumber label="نصف قطر القوس" value={o.path.radius} min={10} max={600} unit="مم" onChange={(v) => live((d) => void ((d as TextObject).path.radius = v))} />
          </Row>
        )}
        {o.path.mode === 'circle' && (
          <Row label="امتداد الدائرة">
            <SliderNumber label="امتداد الدائرة" value={o.path.sweep} min={30} max={359} unit="°" onChange={(v) => live((d) => void ((d as TextObject).path.sweep = v))} />
          </Row>
        )}
        {o.path.mode === 'wave' && (
          <>
            <Row label="الارتفاع">
              <SliderNumber label="ارتفاع الموجة" value={o.path.amplitude} min={0} max={60} step={0.5} unit="مم" onChange={(v) => live((d) => void ((d as TextObject).path.amplitude = v))} />
            </Row>
            <Row label="طول الموجة">
              <SliderNumber label="طول الموجة" value={o.path.wavelength} min={10} max={400} unit="مم" onChange={(v) => live((d) => void ((d as TextObject).path.wavelength = v))} />
            </Row>
          </>
        )}
        {o.path.mode !== 'straight' && <Toggle label="عكس الانحناء" checked={o.path.flip} onChange={(v) => commit((d) => void ((d as TextObject).path.flip = v))} />}

        <div className="sub-title">التكرار الدوراني</div>
        <Row label="عدد النسخ">
          <SliderNumber label="عدد النسخ" value={o.repeat.count} min={1} max={36} onChange={(v) => live((d) => void ((d as TextObject).repeat.count = Math.round(v)))} />
        </Row>
        {o.repeat.count > 1 && (
          <>
            <Row label="زاوية الدوران">
              <SliderNumber label="زاوية التكرار" value={o.repeat.angle} min={-180} max={180} unit="°" onChange={(v) => live((d) => void ((d as TextObject).repeat.angle = v))} />
            </Row>
            <Row label="بُعد المركز">
              <SliderNumber label="بعد مركز الدوران" value={o.repeat.offset} min={-200} max={200} unit="مم" onChange={(v) => live((d) => void ((d as TextObject).repeat.offset = v))} />
            </Row>
            <button type="button" className="link" onClick={() => commit((d) => void ((d as TextObject).repeat.angle = 360 / o.repeat.count))}>
              توزيع متساوٍ على الدائرة
            </button>
          </>
        )}

        <div className="sub-title">المُثنّى (المرآة)</div>
        <Segmented
          label="المرآة"
          value={o.mirror}
          options={[
            { value: 'none', label: 'بدون' },
            { value: 'x', label: 'متقابل' },
            { value: 'y', label: 'انعكاس' },
          ]}
          onChange={(mirror) => commit((d) => void ((d as TextObject).mirror = mirror))}
        />
        {o.mirror !== 'none' && (
          <Row label="المسافة">
            <SliderNumber label="مسافة المرآة" value={o.mirrorGap} min={-60} max={60} step={0.5} unit="مم" onChange={(v) => live((d) => void ((d as TextObject).mirrorGap = v))} />
          </Row>
        )}
      </Section>

      <Section title="الألوان والمؤثرات" open={false}>
        <FillEditor
          fill={o.fill}
          onCommit={(fill) => {
            commit((d) => void ((d as TextObject).fill = fill));
            rememberTextStyle({ fill });
          }}
          onLive={(fill) => live((d) => void ((d as TextObject).fill = fill))}
        />
        <Toggle label="لون مستقل للحركات" checked={o.markColor !== null} onChange={(v) => commit((d) => void ((d as TextObject).markColor = v ? '#b4402f' : null))} />
        {o.markColor !== null && <ColorInput label="لون الحركات" value={o.markColor} onChange={(c) => live((d) => void ((d as TextObject).markColor = c))} />}
        <Toggle label="إخفاء الحركات" checked={o.hideMarks} onChange={(v) => commit((d) => void ((d as TextObject).hideMarks = v))} />
        <Toggle label="حدّ خارجي" checked={!!o.stroke} onChange={(v) => commit((d) => void ((d as TextObject).stroke = v ? { color: '#c9a23a', width: 0.8 } : null))} />
        {o.stroke && (
          <div className="grid2">
            <ColorInput label="لون الحد" value={o.stroke.color} onChange={(c) => live((d) => void ((d as TextObject).stroke!.color = c))} />
            <NumberInput label="سماكة الحد" value={o.stroke.width} min={0} max={20} step={0.1} unit="مم" onChange={(v) => live((d) => void ((d as TextObject).stroke!.width = v))} />
          </div>
        )}
        <ShadowControls o={o} />
      </Section>
    </>
  );
}

function ShadowControls({ o }: { o: TextObject | ShapeObject }) {
  const { live, commit } = ops(o.id);
  return (
    <>
      <Toggle label="ظل" checked={!!o.shadow} onChange={(v) => commit((d) => void ((d as TextObject).shadow = v ? { color: '#000000', blur: 1.2, dx: 0.8, dy: 0.8 } : null))} />
      {o.shadow && (
        <div className="grid2">
          <ColorInput label="لون الظل" value={o.shadow.color} onChange={(c) => live((d) => void ((d as TextObject).shadow!.color = c))} />
          <NumberInput label="نعومة الظل" value={o.shadow.blur} min={0} max={20} step={0.1} unit="مم" onChange={(v) => live((d) => void ((d as TextObject).shadow!.blur = v))} />
          <NumberInput label="إزاحة أفقية" value={o.shadow.dx} min={-50} max={50} step={0.1} unit="مم" onChange={(v) => live((d) => void ((d as TextObject).shadow!.dx = v))} />
          <NumberInput label="إزاحة رأسية" value={o.shadow.dy} min={-50} max={50} step={0.1} unit="مم" onChange={(v) => live((d) => void ((d as TextObject).shadow!.dy = v))} />
        </div>
      )}
    </>
  );
}

function GlyphSection({ o, keys }: { o: TextObject; keys: string[] }) {
  const { live, commit } = ops(o.id);
  const lf = getLoadedFont(o.fontId);
  if (!lf) return null;
  const geo = textGeometry(o, lf);
  const sel = geo.glyphs.filter((g) => keys.includes(g.key));
  const first = sel[0];
  const ov = (first && o.glyphs[first.key]) || defaultGlyphOverride();
  const setAll = (patch: Partial<typeof ov>, liveMode = true) => {
    const recipe = (d: AnyDraft) => {
      const t = d as TextObject;
      for (const k of keys) t.glyphs[k] = { ...(t.glyphs[k] ?? defaultGlyphOverride()), ...patch };
    };
    if (liveMode) live(recipe);
    else commit(recipe);
  };
  const letterIdx = first && !first.kashida ? first.origin : -1;
  const slot = lf.def.kashida && letterIdx >= 0 ? kashidaSlots(o.text).find((s) => s.letter === letterIdx) : undefined;
  const manual = slot ? o.kashidaAt[String(letterIdx)] ?? 0 : 0;
  const st = useEditor.getState();
  return (
    <Section title={sel.length > 1 ? `${sel.length} أجزاء محددة` : `الجزء المحدد «${first ? o.text[first.origin] ?? '' : ''}»`}>
      {first?.mark && <p className="note">هذه حركة أو علامة؛ يمكنك تحريكها بحرية فوق الحرف.</p>}
      <div className="grid2">
        <Row label="إزاحة أفقية">
          <NumberInput label="إزاحة أفقية" value={ov.dx} step={0.2} unit="مم" onChange={(v) => setAll({ dx: v })} />
        </Row>
        <Row label="إزاحة رأسية">
          <NumberInput label="إزاحة رأسية" value={ov.dy} step={0.2} unit="مم" onChange={(v) => setAll({ dy: v })} />
        </Row>
      </div>
      <Row label="الدوران">
        <SliderNumber label="دوران الجزء" value={ov.rotate} min={-180} max={180} unit="°" onChange={(v) => setAll({ rotate: v })} />
      </Row>
      <Row label="الحجم">
        <SliderNumber label="حجم الجزء" value={Math.round(ov.scale * 100)} min={20} max={300} unit="٪" onChange={(v) => setAll({ scale: v / 100 })} />
      </Row>
      <Toggle label="لون خاص" checked={ov.color !== null} onChange={(v) => setAll({ color: v ? '#b4402f' : null }, false)} />
      {ov.color !== null && <ColorInput label="لون الجزء" value={ov.color} onChange={(c) => setAll({ color: c })} />}
      <Toggle label="إخفاء" checked={ov.hidden} onChange={(v) => setAll({ hidden: v }, false)} />
      {slot && (
        <Row label="كشيدة بعد الحرف">
          <div className="stepper">
            <button type="button" aria-label="إنقاص الكشيدة" onClick={() => commit((d) => void ((d as TextObject).kashidaAt[String(letterIdx)] = Math.max(0, manual - 1)))}>
              −
            </button>
            <span>{manual}</span>
            <button type="button" aria-label="زيادة الكشيدة" onClick={() => commit((d) => void ((d as TextObject).kashidaAt[String(letterIdx)] = Math.min(24, manual + 1)))}>
              +
            </button>
          </div>
        </Row>
      )}
      <div className="btn-row">
        <button
          type="button"
          onClick={() =>
            commit((d) => {
              const t = d as TextObject;
              for (const k of keys) delete t.glyphs[k];
            })
          }
        >
          إعادة الضبط
        </button>
        <button type="button" onClick={() => st.setGlyphSel({ objectId: o.id, keys: geo.glyphs.filter((g) => g.mark).map((g) => g.key) })}>
          تحديد كل الحركات
        </button>
      </div>
    </Section>
  );
}

const SHAPE_KINDS = Object.keys(SHAPE_LABELS) as ShapeKind[];

function ShapeSection({ o }: { o: ShapeObject }) {
  const { live, commit } = ops(o.id);
  const hasPoints = o.kind === 'star' || o.kind === 'rosette' || o.kind === 'medallion';
  return (
    <>
      <Section title="الزخرفة">
        <Row label="النوع">
          <select value={o.kind} onChange={(e) => commit((d) => void ((d as ShapeObject).kind = e.target.value as ShapeKind))}>
            {SHAPE_KINDS.map((k) => (
              <option key={k} value={k}>
                {SHAPE_LABELS[k]}
              </option>
            ))}
          </select>
        </Row>
        <div className="grid2">
          <Row label="العرض">
            <NumberInput label="العرض" value={o.w} min={0.5} max={5000} unit="مم" onChange={(v) => live((d) => void ((d as ShapeObject).w = v))} />
          </Row>
          <Row label="الارتفاع">
            <NumberInput label="الارتفاع" value={o.h} min={0.5} max={5000} unit="مم" onChange={(v) => live((d) => void ((d as ShapeObject).h = v))} />
          </Row>
        </div>
        {hasPoints && (
          <Row label={o.kind === 'star' ? 'عدد الرؤوس' : 'عدد البتلات'}>
            <SliderNumber label="عدد الرؤوس" value={o.points} min={3} max={48} onChange={(v) => live((d) => void ((d as ShapeObject).points = Math.round(v)))} />
          </Row>
        )}
        {(o.kind === 'star' || o.kind === 'ornateFrame') && (
          <Row label={o.kind === 'star' ? 'عمق النجمة' : 'كثافة الزخرفة'}>
            <SliderNumber label="النسبة" value={Math.round(o.inner * 100)} min={10} max={95} unit="٪" onChange={(v) => live((d) => void ((d as ShapeObject).inner = v / 100))} />
          </Row>
        )}
      </Section>
      <Section title="الألوان" open={false}>
        <Toggle label="تعبئة" checked={!!o.fill} onChange={(v) => commit((d) => void ((d as ShapeObject).fill = v ? { kind: 'gold' } : null))} />
        {o.fill && <FillEditor fill={o.fill} onCommit={(f: Fill) => commit((d) => void ((d as ShapeObject).fill = f))} onLive={(f: Fill) => live((d) => void ((d as ShapeObject).fill = f))} />}
        <Toggle label="خط محيط" checked={!!o.stroke} onChange={(v) => commit((d) => void ((d as ShapeObject).stroke = v ? { color: '#1f3a73', width: 0.8 } : null))} />
        {o.stroke && (
          <div className="grid2">
            <ColorInput label="لون الخط" value={o.stroke.color} onChange={(c) => live((d) => void ((d as ShapeObject).stroke!.color = c))} />
            <NumberInput label="سماكة الخط" value={o.stroke.width} min={0} max={30} step={0.1} unit="مم" onChange={(v) => live((d) => void ((d as ShapeObject).stroke!.width = v))} />
          </div>
        )}
        <ShadowControls o={o} />
      </Section>
    </>
  );
}

function ImageSection({ o }: { o: ImageObject }) {
  const { live, commit } = ops(o.id);
  const ratio = o.h / o.w;
  return (
    <Section title="الصورة">
      <div className="grid2">
        <Row label="العرض">
          <NumberInput label="عرض الصورة" value={o.w} min={1} max={5000} unit="مم" onChange={(v) => live((d) => void (((d as ImageObject).w = v), ((d as ImageObject).h = v * ratio)))} />
        </Row>
        <Row label="الارتفاع">
          <NumberInput label="ارتفاع الصورة" value={o.h} min={1} max={5000} unit="مم" onChange={(v) => live((d) => void (((d as ImageObject).h = v), ((d as ImageObject).w = v / ratio)))} />
        </Row>
      </div>
      <button
        type="button"
        onClick={async () => {
          const file = await pickFile('image/png,image/jpeg,image/webp,image/gif');
          if (!file) return;
          try {
            const img = await readImageFile(file);
            commit((d) => {
              const im = d as ImageObject;
              im.src = img.src;
              im.h = (im.w * img.heightPx) / img.widthPx;
            });
          } catch (e) {
            useEditor.getState().toast((e as Error).message, 'error');
          }
        }}
      >
        استبدال الصورة…
      </button>
    </Section>
  );
}

function InkSection({ o }: { o: InkObject }) {
  const { live } = ops(o.id);
  return (
    <Section title="خط القلم">
      <ColorInput label="لون الحبر" value={o.color} onChange={(c) => live((d) => void ((d as InkObject).color = c))} />
    </Section>
  );
}

function MultiSection({ objects }: { objects: DocObject[] }) {
  const st = useEditor.getState();
  const box = objects.reduce((acc, o) => unionRect(acc, worldBox(o)), emptyRect());
  const align = (mode: 'right' | 'hcenter' | 'left' | 'top' | 'vcenter' | 'bottom') =>
    st.commit((d) => {
      for (const o of d.pages[st.pageIndex].objects) {
        if (!objects.some((x) => x.id === o.id) || o.locked) continue;
        const b = worldBox(o as DocObject);
        if (mode === 'right') o.x += box.maxX - b.maxX;
        if (mode === 'left') o.x += box.minX - b.minX;
        if (mode === 'hcenter') o.x += (box.minX + box.maxX) / 2 - (b.minX + b.maxX) / 2;
        if (mode === 'top') o.y += box.minY - b.minY;
        if (mode === 'bottom') o.y += box.maxY - b.maxY;
        if (mode === 'vcenter') o.y += (box.minY + box.maxY) / 2 - (b.minY + b.maxY) / 2;
      }
    });
  const distribute = (axis: 'x' | 'y') =>
    st.commit((d) => {
      const objs = d.pages[st.pageIndex].objects.filter((o) => objects.some((x) => x.id === o.id) && !o.locked);
      if (objs.length < 3) return;
      const centers = objs.map((o) => {
        const b = worldBox(o as DocObject);
        return { o, c: axis === 'x' ? (b.minX + b.maxX) / 2 : (b.minY + b.maxY) / 2 };
      });
      centers.sort((a, b) => a.c - b.c);
      const first = centers[0].c;
      const last = centers[centers.length - 1].c;
      centers.forEach(({ o, c }, i) => {
        const target = first + ((last - first) * i) / (centers.length - 1);
        if (axis === 'x') o.x += target - c;
        else o.y += target - c;
      });
    });
  return (
    <Section title={`${objects.length} عناصر محددة`}>
      <div className="sub-title">محاذاة</div>
      <div className="btn-grid">
        <button type="button" onClick={() => align('right')}>يمين</button>
        <button type="button" onClick={() => align('hcenter')}>وسط</button>
        <button type="button" onClick={() => align('left')}>يسار</button>
        <button type="button" onClick={() => align('top')}>أعلى</button>
        <button type="button" onClick={() => align('vcenter')}>منتصف</button>
        <button type="button" onClick={() => align('bottom')}>أسفل</button>
      </div>
      <div className="sub-title">توزيع متساوٍ</div>
      <div className="btn-row">
        <button type="button" onClick={() => distribute('x')}>أفقيًا</button>
        <button type="button" onClick={() => distribute('y')}>رأسيًا</button>
      </div>
      <div className="object-actions">
        <button type="button" onClick={() => st.duplicateSelected()}>
          <IconCopy /> تكرار
        </button>
        <button type="button" className="danger" onClick={() => st.removeSelected()}>
          <IconTrash /> حذف
        </button>
      </div>
    </Section>
  );
}

function PageSection({ page }: { page: Page }) {
  const st = useEditor.getState();
  const title = useEditor((s) => s.doc.title);
  const live = (recipe: (p: Draft<Page>) => void) => st.liveEdit((d) => recipe(d.pages[st.pageIndex]));
  const commit = (recipe: (p: Draft<Page>) => void) => st.updatePage(recipe);
  const bg = page.background;
  const preset = PAGE_SIZES.find((s) => (Math.abs(s.w - page.width) < 0.5 && Math.abs(s.h - page.height) < 0.5) || (Math.abs(s.h - page.width) < 0.5 && Math.abs(s.w - page.height) < 0.5));
  return (
    <>
      <Section title="العمل">
        <Row label="العنوان">
          <input
            type="text"
            className="text-field"
            value={title}
            maxLength={200}
            onFocus={() => st.beginGesture()}
            onBlur={() => st.endGesture()}
            onChange={(e) => st.liveEdit((d) => void (d.title = e.target.value))}
          />
        </Row>
      </Section>
      <Section title="الصفحة">
        <Row label="المقاس">
          <select
            value={preset?.id ?? 'custom'}
            onChange={(e) => {
              const p = PAGE_SIZES.find((s) => s.id === e.target.value);
              if (!p) return;
              const landscape = page.width > page.height;
              commit((pg) => {
                pg.width = landscape ? p.h : p.w;
                pg.height = landscape ? p.w : p.h;
              });
              st.setView({ fitRequest: st.view.fitRequest + 1 });
            }}
          >
            {PAGE_SIZES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option value="custom">مقاس مخصص</option>
          </select>
        </Row>
        <div className="grid2">
          <Row label="العرض">
            <NumberInput label="عرض الصفحة" value={page.width} min={10} max={5000} unit="مم" onChange={(v) => live((p) => void (p.width = v))} />
          </Row>
          <Row label="الارتفاع">
            <NumberInput label="ارتفاع الصفحة" value={page.height} min={10} max={5000} unit="مم" onChange={(v) => live((p) => void (p.height = v))} />
          </Row>
        </div>
        <button
          type="button"
          onClick={() => {
            commit((p) => void ([p.width, p.height] = [p.height, p.width]));
            st.setView({ fitRequest: st.view.fitRequest + 1 });
          }}
        >
          تبديل الاتجاه (طولي/عرضي)
        </button>
      </Section>
      <Section title="الخلفية">
        <Row label="اللون">
          <ColorInput label="لون الخلفية" value={bg.color} onChange={(c) => live((p) => void (p.background.color = c))} />
        </Row>
        <Toggle label="تدرّج لوني" checked={!!bg.gradient} onChange={(v) => commit((p) => void (p.background.gradient = v ? { from: '#fbf6e9', to: '#e8dcc0', angle: 90 } : null))} />
        {bg.gradient && (
          <div className="grid2">
            <ColorInput label="بداية التدرج" value={bg.gradient.from} onChange={(c) => live((p) => void (p.background.gradient!.from = c))} />
            <ColorInput label="نهاية التدرج" value={bg.gradient.to} onChange={(c) => live((p) => void (p.background.gradient!.to = c))} />
          </div>
        )}
        <Row label="النقش">
          <select value={bg.pattern.kind} onChange={(e) => commit((p) => void (p.background.pattern.kind = e.target.value as Page['background']['pattern']['kind']))}>
            {Object.entries(PATTERN_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </Row>
        {bg.pattern.kind !== 'none' && (
          <>
            <ColorInput label="لون النقش" value={bg.pattern.color} onChange={(c) => live((p) => void (p.background.pattern.color = c))} />
            <Row label="حجم النقش">
              <SliderNumber label="حجم النقش" value={bg.pattern.size} min={4} max={80} unit="مم" onChange={(v) => live((p) => void (p.background.pattern.size = v))} />
            </Row>
            <Row label="وضوح النقش">
              <SliderNumber label="وضوح النقش" value={Math.round(bg.pattern.opacity * 100)} min={2} max={100} unit="٪" onChange={(v) => live((p) => void (p.background.pattern.opacity = v / 100))} />
            </Row>
          </>
        )}
        <div className="btn-row">
          <button
            type="button"
            onClick={async () => {
              const file = await pickFile('image/png,image/jpeg,image/webp,image/gif');
              if (!file) return;
              try {
                const img = await readImageFile(file);
                commit((p) => void (p.background.image = { src: img.src, fit: 'cover', opacity: 1 }));
              } catch (e) {
                st.toast((e as Error).message, 'error');
              }
            }}
          >
            صورة خلفية…
          </button>
          {bg.image && (
            <button type="button" onClick={() => commit((p) => void (p.background.image = null))}>
              إزالة الصورة
            </button>
          )}
        </div>
        {bg.image && (
          <Row label="الملاءمة">
            <Segmented
              label="ملاءمة الصورة"
              value={bg.image.fit}
              options={[
                { value: 'cover', label: 'تغطية' },
                { value: 'contain', label: 'احتواء' },
                { value: 'stretch', label: 'تمديد' },
              ]}
              onChange={(fit) => commit((p) => void (p.background.image!.fit = fit))}
            />
          </Row>
        )}
        <button
          type="button"
          className="link"
          onClick={() =>
            st.commit((d) => {
              for (const p of d.pages) p.background = JSON.parse(JSON.stringify(page.background));
            })
          }
        >
          تطبيق الخلفية على كل الصفحات
        </button>
      </Section>
    </>
  );
}

function PenSection() {
  const pen = useEditor((s) => s.pen);
  const set = useEditor.getState().setPen;
  const sample = reedPenStroke(
    Array.from({ length: 40 }, (_, i) => {
      const t = i / 39;
      return { x: 6 + t * 88, y: 22 + Math.sin(t * Math.PI * 2) * 12, p: 1 };
    }),
    pen.width * 2.2,
    pen.angle,
    false,
  ).d;
  return (
    <Section title="قلم القصب">
      <svg className="pen-sample" viewBox="0 0 100 44" aria-hidden="true">
        <path d={sample} fill={pen.color} />
      </svg>
      <p className="note">يحاكي قلم القصب المبريّ: يغلظ الخط حين تتحرك عموديًا على سنّ القلم ويرقّ حين تتحرك موازيًا له.</p>
      <Row label="عرض السنّ">
        <SliderNumber label="عرض سن القلم" value={pen.width} min={0.5} max={20} step={0.1} unit="مم" onChange={(width) => set({ width })} />
      </Row>
      <Row label="زاوية القلم">
        <SliderNumber label="زاوية القلم" value={pen.angle} min={0} max={90} unit="°" onChange={(angle) => set({ angle })} />
      </Row>
      <ColorInput label="لون الحبر" value={pen.color} onChange={(color) => set({ color })} />
      <Toggle label="تأثّر بضغط القلم الرقمي" checked={pen.pressure} onChange={(pressure) => set({ pressure })} />
    </Section>
  );
}

export function Inspector() {
  const page = usePage();
  const tool = useEditor((s) => s.tool);
  const glyphSel = useEditor((s) => s.glyphSel);
  const selected = useSelectedObjects();
  useFonts((s) => s.version);

  let body;
  if (tool === 'pen') body = <PenSection />;
  else if (selected.length === 0) body = <PageSection page={page} />;
  else if (selected.length > 1) body = <MultiSection objects={selected} />;
  else {
    const o = selected[0];
    body = (
      <>
        {tool === 'glyph' && o.type === 'text' && glyphSel?.objectId === o.id && glyphSel.keys.length > 0 && <GlyphSection o={o} keys={glyphSel.keys} />}
        {tool === 'glyph' && o.type === 'text' && !(glyphSel?.keys.length) && (
          <p className="hint-card">انقر حرفًا أو نقطة أو حركة لتحديدها، ثم اسحبها لتغيير موضعها. استخدم Shift لتحديد أكثر من جزء، وEsc للخروج من وضع تحرير الحروف.</p>
        )}
        {o.type === 'text' && <TextSection o={o} />}
        {o.type === 'shape' && <ShapeSection o={o} />}
        {o.type === 'image' && <ImageSection o={o} />}
        {o.type === 'ink' && <InkSection o={o} />}
        <TransformSection o={o} />
        <ObjectActions o={o} />
      </>
    );
  }
  return (
    <div className="inspector" aria-label="الخصائص">
      {body}
    </div>
  );
}
