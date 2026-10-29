import { useEffect, useId, useState, type ReactNode } from 'react';
import type { Fill } from '../model/types';
import { useEditor } from '../store/editor';
import { swatchCss } from '../render/paint';

const begin = () => useEditor.getState().beginGesture();
const end = () => useEditor.getState().endGesture();

export function Section({ title, children, open = true }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="section" open={open}>
      <summary>{title}</summary>
      <div className="section-body">{children}</div>
    </details>
  );
}

export function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="row">
      <span className="row-label">{label}</span>
      <div className="row-control">{children}</div>
      {hint && <p className="row-hint">{hint}</p>}
    </div>
  );
}

const fmtNum = (v: number, digits: number) => String(Number(v.toFixed(digits)));

interface NumberProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  digits?: number;
  unit?: string;
  label?: string;
}

/** Number field. All changes while it has focus form a single undo step. */
export function NumberInput({ value, onChange, min = -1e6, max = 1e6, step = 1, digits = 2, unit, label }: NumberProps) {
  const [text, setText] = useState(fmtNum(value, digits));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(fmtNum(value, digits));
  }, [value, digits, focused]);
  return (
    <span className="num">
      <input
        type="number"
        inputMode="decimal"
        dir="ltr"
        aria-label={label}
        value={text}
        min={min}
        max={max}
        step={step}
        onFocus={() => {
          setFocused(true);
          begin();
        }}
        onBlur={() => {
          setFocused(false);
          end();
        }}
        onChange={(e) => {
          setText(e.target.value);
          const v = Number(e.target.value);
          if (e.target.value !== '' && Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      {unit && <span className="unit">{unit}</span>}
    </span>
  );
}

export function Slider({ value, onChange, min, max, step = 1, label }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; label: string }) {
  return (
    <input
      type="range"
      className="slider"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      onPointerDown={begin}
      onPointerUp={end}
      onFocus={begin}
      onBlur={end}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

export function SliderNumber(props: NumberProps & { min: number; max: number; label: string }) {
  return (
    <div className="slider-number">
      <Slider value={props.value} onChange={props.onChange} min={props.min} max={props.max} step={props.step} label={props.label} />
      <NumberInput {...props} />
    </div>
  );
}

export function ColorInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="color-input" title={label}>
      <input type="color" aria-label={label} value={value} onFocus={begin} onBlur={end} onChange={(e) => onChange(e.target.value)} />
      <span dir="ltr">{value.toUpperCase()}</span>
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  const id = useId();
  return (
    <label className="toggle" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}

const FILL_KINDS: { value: Fill['kind']; label: string }[] = [
  { value: 'solid', label: 'لون' },
  { value: 'linear', label: 'تدرّج' },
  { value: 'gold', label: 'ذهبي' },
  { value: 'silver', label: 'فضي' },
];

export function FillEditor({ fill, onCommit, onLive }: { fill: Fill; onCommit: (f: Fill) => void; onLive: (f: Fill) => void }) {
  return (
    <div className="fill-editor">
      <div className="fill-head">
        <span className="swatch" style={{ background: swatchCss(fill) }} />
        <Segmented
          label="نوع التعبئة"
          value={fill.kind}
          options={FILL_KINDS}
          onChange={(kind) => {
            if (kind === 'solid') onCommit({ kind, color: fill.kind === 'linear' ? fill.from : fill.kind === 'solid' ? fill.color : '#1b1e27' });
            else if (kind === 'linear') onCommit({ kind, from: fill.kind === 'solid' ? fill.color : '#1f3a73', to: '#c9a23a', angle: 90 });
            else onCommit({ kind });
          }}
        />
      </div>
      {fill.kind === 'solid' && <ColorInput label="اللون" value={fill.color} onChange={(color) => onLive({ kind: 'solid', color })} />}
      {fill.kind === 'linear' && (
        <>
          <Row label="من">
            <ColorInput label="لون البداية" value={fill.from} onChange={(from) => onLive({ ...fill, from })} />
          </Row>
          <Row label="إلى">
            <ColorInput label="لون النهاية" value={fill.to} onChange={(to) => onLive({ ...fill, to })} />
          </Row>
          <Row label="الزاوية">
            <SliderNumber label="زاوية التدرج" value={fill.angle} min={0} max={360} unit="°" onChange={(angle) => onLive({ ...fill, angle })} />
          </Row>
        </>
      )}
    </div>
  );
}
