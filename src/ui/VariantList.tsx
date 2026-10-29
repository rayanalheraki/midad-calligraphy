import type { Variant } from '../engine/variants';

interface Props {
  variants: Variant[];
  onPick: (v: Variant) => void;
  /** compact strip shown on the page next to the selection */
  compact?: boolean;
}

function label(v: Variant, i: number): string {
  if (v.choice.kind === 'original' || (v.choice.kind === 'glyph' && v.choice.name === null)) return 'الشكل الأصلي';
  return `بديل ${i}`;
}

/** Previews of the alternates of the selected segment or letter; the current one is marked. */
export function VariantList({ variants, onPick, compact }: Props) {
  if (variants.length < 2) return null;
  return (
    <div className={'variant-list' + (compact ? ' compact' : '')} role="listbox" aria-label="البدائل">
      {variants.map((v, i) => {
        const pad = Math.max(v.box.maxX - v.box.minX, v.box.maxY - v.box.minY) * 0.08;
        const vb = `${v.box.minX - pad} ${v.box.minY - pad} ${v.box.maxX - v.box.minX + pad * 2} ${v.box.maxY - v.box.minY + pad * 2}`;
        return (
          <button
            key={v.id}
            type="button"
            role="option"
            aria-selected={v.current}
            className={'variant' + (v.current ? ' current' : '')}
            title={label(v, i)}
            aria-label={label(v, i)}
            onClick={() => onPick(v)}
          >
            <svg viewBox={vb} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
              <path d={v.d} />
            </svg>
          </button>
        );
      })}
    </div>
  );
}
