import { useMemo } from 'react';
import type { Draft } from 'immer';
import type { TextObject } from '../model/types';
import { defaultGlyphOverride } from '../model/defaults';
import { getLoadedFont } from '../engine/fonts';
import { textGeometry, type TextGeometry } from '../engine/layout';
import { letterVariants, segmentGlyphs, segmentVariants, type Variant } from '../engine/variants';
import { useEditor, type GlyphSelection } from '../store/editor';
import { useFonts } from '../store/fonts';

/** Keys of every glyph in the segment of `key` (the letter itself when it has no segment). */
export function segmentKeysOf(geo: TextGeometry, key: string): string[] {
  const g = geo.glyphs.find((x) => x.key === key);
  if (!g) return [];
  return g.seg >= 0 ? segmentGlyphs(geo, g.seg).map((x) => x.key) : [key];
}

/** The segment the selection belongs to, or -1. */
export function selectionSegment(geo: TextGeometry, sel: GlyphSelection): number {
  const g = geo.glyphs.find((x) => sel.keys.includes(x.key));
  return g?.seg ?? -1;
}

export function computeVariants(o: TextObject, sel: GlyphSelection | null): Variant[] {
  if (!sel || sel.objectId !== o.id || !sel.keys.length) return [];
  const lf = getLoadedFont(o.fontId);
  if (!lf) return [];
  if (sel.level === 'letter') return sel.keys.length === 1 ? letterVariants(o, lf, sel.keys[0]) : [];
  const seg = selectionSegment(textGeometry(o, lf), sel);
  return seg >= 0 ? segmentVariants(o, lf, seg) : [];
}

export function useVariants(o: TextObject | null, sel: GlyphSelection | null): Variant[] {
  const fontsVersion = useFonts((s) => s.version);
  return useMemo(
    () => (o ? computeVariants(o, sel) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [o, sel, fontsVersion],
  );
}

export function applyVariant(o: TextObject, sel: GlyphSelection, v: Variant): void {
  const lf = getLoadedFont(o.fontId);
  if (!lf) return;
  const geo = textGeometry(o, lf);
  const seg = selectionSegment(geo, sel);
  const segKeys = seg >= 0 ? segmentGlyphs(geo, seg).map((g) => g.key) : sel.keys;
  useEditor.getState().updateObject(o.id, (d) => {
    const t = d as Draft<TextObject>;
    const setAlt = (key: string, name: string | null) => {
      const prev = t.glyphs[key] ?? defaultGlyphOverride();
      t.glyphs[key] = { ...prev, alt: name };
    };
    const clear = () => {
      if (seg >= 0) delete t.segVariants[String(seg)];
      for (const k of segKeys) if (t.glyphs[k]?.alt) setAlt(k, null);
    };
    switch (v.choice.kind) {
      case 'original':
        clear();
        break;
      case 'features':
        clear();
        if (seg >= 0) t.segVariants[String(seg)] = v.choice.features;
        break;
      case 'glyph':
        setAlt(v.choice.key, v.choice.name);
        break;
    }
  });
}

/** Steps to the previous or next alternate of the current selection. */
export function cycleVariant(dir: number): void {
  const st = useEditor.getState();
  const sel = st.glyphSel;
  if (!sel) return;
  const o = st.doc.pages[st.pageIndex].objects.find((x) => x.id === sel.objectId);
  if (!o || o.type !== 'text') return;
  const list = computeVariants(o, sel);
  if (list.length < 2) return;
  const cur = Math.max(0, list.findIndex((v) => v.current));
  applyVariant(o, sel, list[(cur + dir + list.length) % list.length]);
}
