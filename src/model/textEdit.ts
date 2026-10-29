import type { Draft } from 'immer';
import type { TextObject } from './types';

/**
 * Replaces the text of a line while keeping per-letter edits (glyph overrides, manual
 * kashida and segment variants) attached to the same letters: indices after the edited range are shifted,
 * edits inside the range are dropped.
 */
export function applyTextEdit(o: Draft<TextObject>, next: string): void {
  const prev = o.text;
  if (prev === next) return;
  let p = 0;
  while (p < prev.length && p < next.length && prev[p] === next[p]) p++;
  let s = 0;
  while (s < prev.length - p && s < next.length - p && prev[prev.length - 1 - s] === next[next.length - 1 - s]) s++;
  const oldEnd = prev.length - s;
  const delta = next.length - prev.length;
  const shift = (n: number): number | null => (n < p ? n : n >= oldEnd ? n + delta : null);

  const glyphs: TextObject['glyphs'] = {};
  for (const [key, ov] of Object.entries(o.glyphs)) {
    const m = /^(\d+)(k?)\.(\d+)$/.exec(key);
    if (!m) continue;
    const n = shift(Number(m[1]));
    if (n !== null) glyphs[`${n}${m[2]}.${m[3]}`] = ov;
  }
  const kashidaAt: TextObject['kashidaAt'] = {};
  for (const [key, count] of Object.entries(o.kashidaAt)) {
    const n = shift(Number(key));
    if (n !== null) kashidaAt[String(n)] = count;
  }
  const segVariants: TextObject['segVariants'] = {};
  for (const [key, specs] of Object.entries(o.segVariants)) {
    const n = shift(Number(key));
    if (n !== null) segVariants[String(n)] = specs;
  }
  o.text = next;
  o.glyphs = glyphs;
  o.kashidaAt = kashidaAt;
  o.segVariants = segVariants;
}
