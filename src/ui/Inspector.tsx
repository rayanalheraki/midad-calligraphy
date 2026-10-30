import { useEffect, useRef } from 'react';
import type { Draft } from 'immer';
import type { DocObject, Fill, GlyphOverride, MarkObject, Page, PatternKind, TextObject } from '../model/types';
import { defaultGlyphOverride, PAGE_SIZES } from '../model/defaults';
import { findElement } from '../model/elements';
import { applyTextEdit } from '../model/textEdit';
import { featureLabel, findFontDef, getLoadedFont } from '../engine/fonts';
import { kashidaSlots, MAX_DIP_PERCENT, MAX_STRETCH_EM, textGeometry } from '../engine/layout';
import { dipsByDefault } from '../engine/stretch';
import { segmentOf } from '../engine/arabic';
import { segmentStretchKey } from '../engine/variants';
import { rotateInGroup, scaleInGroup } from '../model/glyphGroup';
import { emptyRect, unionRect } from '../engine/geom';
import { PATTERN_LABELS } from '../engine/patterns';
import { worldBox } from '../render/bounds';
import { pickFile } from '../io/files';
import { usePage, useEditor, useSelectedObjects, type GlyphSelection } from '../store/editor';
import { useFonts } from '../store/fonts';
import { ColorInput, FillEditor, NumberInput, Row, Section, Segmented, SliderNumber, Toggle } from './controls';
import { FontPicker } from './FontPicker';
import { MarksPalette } from './MarksPalette';
import { ElementsPalette } from './ElementsPalette';
import { pendingTextFocus, rememberTextStyle, textCaret } from './textDefaults';
import { IconCopy, IconKeyboard, IconTrash } from './icons';
import { applyVariant, useVariants } from './variantActions';
import { VariantList } from './VariantList';
import { StrokesSection } from './StrokesSection';
import { setBackgroundImage } from './actions';

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
      pendingTextFocus.objectId = '';
      el.focus();
      el.select();
    };
    // A line added a moment ago: its panel mounts after the request was made.
    if (pendingTextFocus.objectId === o.id) setTimeout(focus, 0);
    const caret = () => {
      const el = areaRef.current;
      if (!el || textCaret.objectId !== o.id) return;
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(textCaret.start, textCaret.end);
      });
    };
    window.addEventListener('khattat:focus-text', focus);
    window.addEventListener('khattat:caret', caret);
    return () => {
      window.removeEventListener('khattat:focus-text', focus);
      window.removeEventListener('khattat:caret', caret);
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
            تحرير المقاطع والحروف
          </button>
        </div>
      </Section>

      <Section title="حركات داخل النص" open={false}>
        <p className="note">تُدرج الحركة عند مؤشّر الكتابة في مربّع النص أعلاه، فيضعها الخط تلقائيًّا فوق الحرف.</p>
        <MarksPalette />
        <button type="button" onClick={() => useEditor.getState().startElement('fatha')}>
          وضع الحركات كعناصر منفصلة…
        </button>
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

function ShadowControls({ o }: { o: TextObject }) {
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

function GlyphSection({ o, sel }: { o: TextObject; sel: GlyphSelection }) {
  const { live, commit } = ops(o.id);
  const variants = useVariants(o, sel);
  const lf = getLoadedFont(o.fontId);
  if (!lf) return null;
  const keys = sel.keys;
  const geo = textGeometry(o, lf);
  const chosen = geo.glyphs.filter((g) => keys.includes(g.key));
  const first = chosen[0];
  const ov = (first && o.glyphs[first.key]) || defaultGlyphOverride();
  const segment = sel.level === 'segment';
  const segs = [...new Set(chosen.map((g) => g.seg).filter((s) => s >= 0))];
  const segOf = segmentOf(o.text);
  const segText = (seg: number) => {
    let t = '';
    for (let i = 0; i < o.text.length; i++) if (segOf[i] === seg) t += o.text[i];
    return t;
  };
  const title = segment
    ? segs.length > 1
      ? `${segs.length} مقاطع محددة`
      : `المقطع «${segText(segs[0] ?? -1)}»`
    : chosen.length > 1
      ? `${chosen.length} أجزاء محددة`
      : `الحرف «${first ? o.text[first.origin] ?? '' : ''}»`;

  const stretchKey = segment
    ? segs.length === 1
      ? segmentStretchKey(o, geo, segs[0])
      : null
    : first && first.stretchable && !first.mark
      ? first.key
      : null;
  const stretchMm = stretchKey ? (o.glyphs[stretchKey]?.stretch ?? 0) * o.size : 0;
  const dip = stretchKey ? o.glyphs[stretchKey]?.dip ?? null : null;
  const setDip = (v: number | null) =>
    live((d) => {
      const t = d as TextObject;
      if (stretchKey) t.glyphs[stretchKey] = { ...(t.glyphs[stretchKey] ?? defaultGlyphOverride()), dip: v };
    });

  // Group centre and each glyph's own centre, for turning and resizing as one piece.
  const box = chosen.reduce((acc, g) => unionRect(acc, g.bbox), emptyRect());
  const center = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  const update = (fn: (prev: GlyphOverride, key: string) => GlyphOverride, liveMode = true) => {
    const recipe = (d: AnyDraft) => {
      const t = d as TextObject;
      for (const k of keys) t.glyphs[k] = fn(t.glyphs[k] ?? defaultGlyphOverride(), k);
    };
    if (liveMode) live(recipe);
    else commit(recipe);
  };
  const centers = new Map(chosen.map((g) => [g.key, g.baseCenter]));

  const letterIdx = first && !first.kashida && !segment ? first.origin : -1;
  const slot = lf.def.kashida && letterIdx >= 0 ? kashidaSlots(o.text).find((s) => s.letter === letterIdx) : undefined;
  const manual = slot ? o.kashidaAt[String(letterIdx)] ?? 0 : 0;
  const st = useEditor.getState();
  return (
    <>
      <Section title={title}>
        <p className="note">
          {segment ? 'نقرة تحدد المقطع كاملًا، ونقرتان على حرف تحددانه وحده.' : 'حرف واحد محدد؛ اضغط Esc للعودة إلى المقطع.'}
          {first?.mark && ' هذه حركة أو نقطة؛ اسحبها لتغيير موضعها فوق الحرف.'}
        </p>
        <div className="sub-title">{segment ? 'بدائل المقطع' : 'بدائل الحرف'}</div>
        {variants.length > 1 ? (
          <VariantList variants={variants} onPick={(v) => applyVariant(o, sel, v)} />
        ) : (
          <p className="note">لا يقدّم هذا الخط أشكالًا بديلة {segment ? 'لهذا المقطع' : 'لهذا الحرف'}.</p>
        )}
        <div className="sub-title">المدّ</div>
        {stretchKey ? (
          <Row label={segment ? 'مدّ المقطع' : 'مدّ الحرف'}>
            <SliderNumber
              label="مقدار المدّ"
              value={Math.round(stretchMm * 10) / 10}
              min={0}
              max={Math.round(o.size * MAX_STRETCH_EM)}
              step={0.2}
              unit="مم"
              onChange={(v) =>
                live((d) => {
                  const t = d as TextObject;
                  t.glyphs[stretchKey] = { ...(t.glyphs[stretchKey] ?? defaultGlyphOverride()), stretch: Math.max(0, v / o.size) };
                })
              }
            />
          </Row>
        ) : (
          <p className="note">{segment ? 'لا يحتوي هذا المقطع حرفًا قابلًا للمدّ.' : 'هذا الحرف غير قابل للمدّ.'}</p>
        )}
        {stretchKey && stretchMm > 0 && (
          <Row label="تقعير المدّ" hint={dip === null ? 'تلقائي حسب نوع الخط؛ 0% مدّ مستقيم و100% التقعير المعتاد.' : undefined}>
            <SliderNumber
              label="عمق التقعير"
              value={dip ?? (dipsByDefault(lf) ? 100 : 0)}
              min={0}
              max={MAX_DIP_PERCENT}
              step={5}
              digits={0}
              unit="%"
              onChange={(v) => setDip(Math.min(MAX_DIP_PERCENT, Math.max(0, v)))}
            />
            {dip !== null && (
              <button type="button" className="link" onClick={() => setDip(null)}>
                تلقائي
              </button>
            )}
          </Row>
        )}
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
      </Section>
      <Section title="الموضع والهيئة">
        <div className="grid2">
          <Row label="إزاحة أفقية">
            <NumberInput label="إزاحة أفقية" value={ov.dx} step={0.2} unit="مم" onChange={(v) => update((p) => ({ ...p, dx: p.dx + v - ov.dx }))} />
          </Row>
          <Row label="إزاحة رأسية">
            <NumberInput label="إزاحة رأسية" value={ov.dy} step={0.2} unit="مم" onChange={(v) => update((p) => ({ ...p, dy: p.dy + v - ov.dy }))} />
          </Row>
        </div>
        <Row label="الدوران">
          <SliderNumber
            label="دوران الجزء"
            value={ov.rotate}
            min={-180}
            max={180}
            unit="°"
            onChange={(v) => update((p, k) => (centers.has(k) ? rotateInGroup(p, centers.get(k)!, center, v - ov.rotate) : p))}
          />
        </Row>
        <Row label="الحجم">
          <SliderNumber
            label="حجم الجزء"
            value={Math.round(ov.scale * 100)}
            min={20}
            max={300}
            unit="٪"
            onChange={(v) => update((p, k) => (centers.has(k) ? scaleInGroup(p, centers.get(k)!, center, v / 100 / (ov.scale || 1)) : p))}
          />
        </Row>
        <Toggle label="لون خاص" checked={ov.color !== null} onChange={(v) => update((p) => ({ ...p, color: v ? '#b4402f' : null }), false)} />
        {ov.color !== null && <ColorInput label="لون الجزء" value={ov.color} onChange={(c) => update((p) => ({ ...p, color: c }))} />}
        <Toggle label="إخفاء" checked={ov.hidden} onChange={(v) => update((p) => ({ ...p, hidden: v }), false)} />
        <div className="btn-row">
          <button
            type="button"
            onClick={() =>
              commit((d) => {
                const t = d as TextObject;
                for (const k of keys) delete t.glyphs[k];
                if (segment) for (const sg of segs) delete t.segVariants[String(sg)];
              })
            }
          >
            إعادة الضبط
          </button>
          <button type="button" onClick={() => st.setGlyphSel({ objectId: o.id, keys: geo.glyphs.filter((g) => g.mark).map((g) => g.key), level: 'letter' })}>
            تحديد كل الحركات
          </button>
        </div>
      </Section>
    </>
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
          <>
            <div className="grid2">
              <ColorInput label="بداية التدرج" value={bg.gradient.from} onChange={(c) => live((p) => void (p.background.gradient!.from = c))} />
              <ColorInput label="نهاية التدرج" value={bg.gradient.to} onChange={(c) => live((p) => void (p.background.gradient!.to = c))} />
            </div>
            <Row label="زاوية التدرج">
              <SliderNumber label="زاوية التدرج" value={bg.gradient.angle} min={0} max={360} unit="°" onChange={(v) => live((p) => void (p.background.gradient!.angle = v))} />
            </Row>
          </>
        )}
        <Row label="النقش">
          <select value={bg.pattern.kind} onChange={(e) => commit((p) => void (p.background.pattern.kind = e.target.value as PatternKind))}>
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
              if (file) await setBackgroundImage(file);
            }}
          >
            {bg.image ? 'تغيير الصورة…' : 'صورة خلفية…'}
          </button>
          {bg.image && (
            <button type="button" onClick={() => commit((p) => void (p.background.image = null))}>
              إزالة الصورة
            </button>
          )}
        </div>
        {bg.image && (
          <>
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
            <Row label="وضوح الصورة">
              <SliderNumber label="وضوح الصورة" value={Math.round(bg.image.opacity * 100)} min={5} max={100} unit="٪" onChange={(v) => live((p) => void (p.background.image!.opacity = v / 100))} />
            </Row>
          </>
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

/** Shown while the element tool is active: the palette and where the next element goes. */
function ElementsSection() {
  const owner = useEditor((s) => {
    const page = s.doc.pages[s.pageIndex];
    const o = page.objects.find((x) => x.id === s.elementOwner);
    return o?.type === 'text' ? o : null;
  });
  return (
    <>
      <p className="hint-card">
        اختر حركة أو عنصرًا، ثم انقر في الصفحة لوضعه. يبقى العنصر جاهزًا لتضعه أكثر من مرة؛ اضغط Esc أو اختر أداة التحديد للخروج.
      </p>
      <Section title="التشكيل والعناصر">
        {owner ? (
          <p className="note">
            ستُربط العناصر بالسطر «{owner.text.trim().slice(0, 24)}» وتأخذ خطّه وحجمه ولونه، وتتحرك معه.
          </p>
        ) : (
          <p className="note">لا يوجد سطر محدد، فستوضع العناصر مستقلة. لربطها بسطر، حدّده أولًا ثم اختر هذه الأداة.</p>
        )}
        <ElementsPalette />
      </Section>
    </>
  );
}

function MarkSection({ o }: { o: MarkObject }) {
  const { live, commit } = ops(o.id);
  const def = findElement(o.element);
  const owner = useEditor((s) => {
    const page = s.doc.pages[s.pageIndex];
    const t = page.objects.find((x) => x.id === o.ownerId);
    return t?.type === 'text' ? t : null;
  });
  return (
    <Section title={`عنصر: ${def?.label ?? o.name}`}>
      {o.shape === 'glyph' && (
        <FontPicker value={o.fontId} onChange={(fontId) => commit((d) => void ((d as MarkObject).fontId = fontId))} />
      )}
      <Row label="الحجم">
        <SliderNumber label="حجم العنصر" value={o.size} min={1} max={150} step={0.5} unit="مم" onChange={(v) => live((d) => void ((d as MarkObject).size = v))} />
      </Row>
      <FillEditor
        fill={o.fill}
        onCommit={(f: Fill) => commit((d) => void ((d as MarkObject).fill = f))}
        onLive={(f: Fill) => live((d) => void ((d as MarkObject).fill = f))}
      />
      {owner ? (
        <Row label="مرتبط بسطر">
          <span className="muted">«{owner.text.trim().slice(0, 18)}»</span>
          <button type="button" className="link" onClick={() => commit((d) => void ((d as MarkObject).ownerId = null))}>
            فك الارتباط
          </button>
        </Row>
      ) : (
        <p className="note">عنصر مستقل غير مرتبط بأي سطر.</p>
      )}
      <button type="button" onClick={() => useEditor.getState().startElement(o.element)}>
        إضافة المزيد من هذا العنصر
      </button>
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
  if (tool === 'mark') body = <ElementsSection />;
  else if (selected.length === 0) body = <PageSection page={page} />;
  else if (selected.length > 1) body = <MultiSection objects={selected} />;
  else {
    const o = selected[0];
    body = (
      <>
        {tool === 'stretch' && (
          <p className="hint-card">اسحب حرفًا نحو اليسار لمدّه ونحو اليمين لتقصيره. الحروف المظلَّلة قابلة للمدّ، وإن سحبت حرفًا غيرها مُدّ أنسب حرف في مقطعه.</p>
        )}
        {(tool === 'glyph' || tool === 'stretch') && o.type === 'text' && glyphSel?.objectId === o.id && glyphSel.keys.length > 0 && <GlyphSection o={o} sel={glyphSel} />}
        {tool === 'glyph' && o.type === 'text' && !(glyphSel?.keys.length) && (
          <p className="hint-card">انقر مقطعًا لتحديده وتحريكه وعرض بدائله، وانقر مرتين على حرف لتحديده وحده. Shift لإضافة مقطع آخر، و[ ] للتنقل بين البدائل، وEsc للخروج.</p>
        )}
        {o.type === 'text' && <TextSection o={o} />}
        {o.type === 'mark' && <MarkSection o={o} />}
        {o.type === 'strokes' && <StrokesSection o={o} />}
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
