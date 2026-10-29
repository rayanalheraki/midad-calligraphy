import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent, type ReactElement } from 'react';
import { createText, defaultGlyphOverride } from '../model/defaults';
import { findElement, markFromElement, type ElementStyle } from '../model/elements';
import type { DocObject, GlyphOverride, MarkObject, TextObject } from '../model/types';
import { getLoadedFont } from '../engine/fonts';
import { MAX_STRETCH_EM, textGeometry, type PlacedGlyph, type TextGeometry } from '../engine/layout';
import { segmentStretchKey } from '../engine/variants';
import { rotateInGroup, scaleInGroup } from '../model/glyphGroup';
import {
  apply,
  chain,
  clamp,
  emptyRect,
  invert,
  isEmptyRect,
  objectMatrix,
  rectCorners,
  rotate,
  unionRect,
  type Matrix,
  type Point,
  type Rect,
} from '../engine/geom';
import { markFontIds } from '../engine/marks';
import { ObjectView, PageContent } from '../render/PageView';
import { localBox, worldBox } from '../render/bounds';
import { usePage, useEditor, withAttached, type GlyphSelection } from '../store/editor';
import { useFonts } from '../store/fonts';
import { useCursor } from '../store/cursor';
import { lastTextStyle, requestTextFocus } from './textDefaults';
import { RULER, Rulers } from './Rulers';
import { applyVariant, cycleVariant, segmentKeysOf, useVariants } from './variantActions';
import { VariantList } from './VariantList';

export const MM = 96 / 25.4;

type Handle = 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w' | 'rot';

interface ItemSnap {
  id: string;
  type: DocObject['type'];
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  /** an element that follows its line rather than being selected itself */
  attached: boolean;
}

type Drag =
  | { kind: 'pan'; sx: number; sy: number; panX: number; panY: number }
  | { kind: 'move'; start: Point; items: ItemSnap[]; box: Rect; xs: number[]; ys: number[] }
  | { kind: 'scale'; handle: Handle; start: Point; items: ItemSnap[]; pivot: Point; rot: number; single: boolean }
  | { kind: 'rotate'; start: Point; center: Point; items: ItemSnap[]; single: boolean }
  | { kind: 'marquee'; start: Point; additive: boolean }
  | { kind: 'gmove'; objectId: string; keys: string[]; start: Point; inv: Matrix; base: Record<string, GlyphOverride> }
  | {
      kind: 'grotate' | 'gscale';
      objectId: string;
      keys: string[];
      start: Point;
      /** group centre on the page and in the line's local coordinates */
      center: Point;
      local: Point;
      centers: Record<string, Point>;
      base: Record<string, GlyphOverride>;
      /** the line is mirrored, so angles turn the other way locally */
      flipped: boolean;
    }
  | { kind: 'stretch'; objectId: string; key: string; start: Point; inv: Matrix; base: GlyphOverride; size: number; anchor: Point | null; origin: Point };

const snapItem = (o: DocObject, attached = false): ItemSnap => ({
  id: o.id,
  type: o.type,
  x: o.x,
  y: o.y,
  rotation: o.rotation,
  scaleX: o.scaleX,
  scaleY: o.scaleY,
  attached,
});

function linearOnly(m: Matrix): Matrix {
  return [m[0], m[1], m[2], m[3], 0, 0];
}

function isTyping(): boolean {
  const el = document.activeElement;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el as HTMLElement).isContentEditable);
}

export function Stage() {
  const page = usePage();
  const tool = useEditor((s) => s.tool);
  const selection = useEditor((s) => s.selection);
  const glyphSel = useEditor((s) => s.glyphSel);
  const view = useEditor((s) => s.view);
  const pendingElement = useEditor((s) => s.pendingElement);
  const elementOwner = useEditor((s) => s.elementOwner);
  const fontsVersion = useFonts((s) => s.version);
  const cursor = useCursor((s) => s.pos);

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const drag = useRef<Drag | null>(null);
  const lastClick = useRef<{ objectId: string; key: string; time: number } | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const [spaceDown, setSpaceDown] = useState(false);

  const k = view.zoom * MM;

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Fit the page into the viewport when requested (new document, page switch, menu command),
  // and keep it fitted on window resizes until the user zooms or pans by hand.
  const autoFit = useRef(true);
  useEffect(() => {
    autoFit.current = true;
  }, [view.fitRequest]);
  useEffect(() => {
    if (!size.w || !size.h || !autoFit.current) return;
    const pad = Math.min(48, size.w * 0.06);
    const availW = size.w - pad * 2 - (view.rulers ? RULER : 0);
    const availH = size.h - pad * 2 - (view.rulers ? RULER : 0);
    const zoom = clamp(Math.min(availW / (page.width * MM), availH / (page.height * MM)), 0.05, 8);
    const kk = zoom * MM;
    useEditor.getState().setView({
      zoom,
      panX: (size.w - (view.rulers ? RULER : 0) - page.width * kk) / 2,
      panY: (size.h + (view.rulers ? RULER : 0) - page.height * kk) / 2,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.fitRequest, size.w, size.h, page.width, page.height]);

  // Load fonts used on this page.
  useEffect(() => {
    const req = useFonts.getState().request;
    for (const o of page.objects) {
      if (o.type === 'text') void req(o.fontId);
      else if (o.type === 'mark') for (const id of markFontIds(o)) void req(id);
    }
  }, [page.objects]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping()) {
        setSpaceDown(true);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpaceDown(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Wheel: Ctrl/⌘ zooms around the pointer, otherwise scrolls.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      autoFit.current = false;
      const { view: v } = useEditor.getState();
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        const cx = e.clientX - r.left;
        const cy = e.clientY - r.top;
        const zoom = clamp(v.zoom * Math.exp(-e.deltaY * 0.0015), 0.05, 16);
        const f = zoom / v.zoom;
        useEditor.getState().setView({ zoom, panX: cx - (cx - v.panX) * f, panY: cy - (cy - v.panY) * f });
      } else {
        const dx = e.shiftKey ? e.deltaY : e.deltaX;
        const dy = e.shiftKey ? 0 : e.deltaY;
        useEditor.getState().setView({ panX: v.panX - dx, panY: v.panY - dy });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const toPage = useCallback(
    (clientX: number, clientY: number): Point => {
      const r = svgRef.current!.getBoundingClientRect();
      return { x: (clientX - r.left - view.panX) / k, y: (clientY - r.top - view.panY) / k };
    },
    [view.panX, view.panY, k],
  );

  const objectsById = useMemo(() => new Map(page.objects.map((o) => [o.id, o])), [page.objects]);
  const selectedObjects = selection.map((id) => objectsById.get(id)).filter((o): o is DocObject => !!o);

  /** Unlocked elements attached to the given lines that are not themselves in `ids`. */
  const attachedTo = (ids: string[]): DocObject[] => {
    const all = new Set(withAttached(page.objects, ids));
    return page.objects.filter((o) => all.has(o.id) && !ids.includes(o.id) && !o.locked);
  };

  // Element placement: new elements take the font, size and colour of their line.
  const ownerCandidate = elementOwner ? objectsById.get(elementOwner) : undefined;
  const ownerObject: TextObject | null = ownerCandidate?.type === 'text' ? ownerCandidate : null;
  const elementStyle: ElementStyle = useMemo(
    () =>
      ownerObject
        ? { fontId: ownerObject.fontId, size: ownerObject.size * Math.abs(ownerObject.scaleY), fill: ownerObject.fill }
        : { fontId: lastTextStyle.fontId ?? 'amiri', size: lastTextStyle.size ?? 18, fill: lastTextStyle.fill ?? { kind: 'solid', color: '#1b1e27' } },
    [ownerObject],
  );
  const ghost: MarkObject | null = useMemo(() => {
    if (tool !== 'mark') return null;
    const def = findElement(pendingElement);
    return def ? markFromElement(def, elementStyle, null, 0, 0) : null;
  }, [tool, pendingElement, elementStyle]);
  useEffect(() => {
    if (!ghost) return;
    const req = useFonts.getState().request;
    for (const id of markFontIds(ghost)) void req(id);
  }, [ghost]);

  const glyphObject: TextObject | null = (() => {
    if (tool !== 'glyph' && tool !== 'stretch') return null;
    const o = selectedObjects[0];
    return o && o.type === 'text' ? o : null;
  })();
  const variants = useVariants(tool === 'glyph' ? glyphObject : null, glyphSel);

  /** Glyph of a line under a page point: the smallest box wins, marks before letters. */
  const glyphAt = (o: TextObject, q: Point): { geo: TextGeometry; g: PlacedGlyph } | null => {
    const lf = getLoadedFont(o.fontId);
    if (!lf) return null;
    const geo = textGeometry(o, lf);
    const l = apply(invert(chain(objectMatrix(o), geo.copies[0])), q.x, q.y);
    let best: PlacedGlyph | null = null;
    let bestArea = Infinity;
    for (const g of geo.glyphs) {
      const b = g.bbox;
      if (g.hidden || l.x < b.minX || l.x > b.maxX || l.y < b.minY || l.y > b.maxY) continue;
      const area = (b.maxX - b.minX) * (b.maxY - b.minY) * (g.mark ? 0.25 : 1);
      if (area < bestArea) {
        best = g;
        bestArea = area;
      }
    }
    return best ? { geo, g: best } : null;
  };

  useEffect(() => {
    const cycle = (e: Event) => cycleVariant(Number((e as CustomEvent).detail) || 1);
    const up = () => {
      const st = useEditor.getState();
      const sel = st.glyphSel;
      const o = sel && st.doc.pages[st.pageIndex].objects.find((x) => x.id === sel.objectId);
      const lf = o && o.type === 'text' ? getLoadedFont(o.fontId) : undefined;
      if (!sel || !o || o.type !== 'text' || !lf) return;
      st.setGlyphSel({ objectId: o.id, keys: segmentKeysOf(textGeometry(o, lf), sel.keys[0]), level: 'segment' });
    };
    window.addEventListener('midad:cycle-variant', cycle);
    window.addEventListener('midad:segment-level', up);
    return () => {
      window.removeEventListener('midad:cycle-variant', cycle);
      window.removeEventListener('midad:segment-level', up);
    };
  }, []);

  const selectionBox = (): Rect => selectedObjects.reduce((acc, o) => unionRect(acc, worldBox(o)), emptyRect());

  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (e.button === 2) return;
    const st = useEditor.getState();
    const p = toPage(e.clientX, e.clientY);
    const target = e.target as Element;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);

    if (e.button === 1 || tool === 'hand' || spaceDown) {
      autoFit.current = false;
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, panX: view.panX, panY: view.panY };
      return;
    }

    if (tool === 'mark') {
      // Like the vowel window of desktop calligraphy editors: every click places the chosen
      // element; the tool stays active until another tool is picked or Esc is pressed.
      const def = findElement(pendingElement);
      if (def) st.addObject(markFromElement(def, elementStyle, ownerObject?.id ?? null, p.x, p.y), false);
      return;
    }

    if (tool === 'text') {
      const t = createText({ ...lastTextStyle, x: p.x, y: p.y, text: 'اكتب نصّك هنا' });
      // No mouse-down default: it would move the focus away from the new line's text box.
      e.preventDefault();
      st.addObject(t);
      st.setTool('select');
      requestTextFocus(t.id);
      return;
    }

    if (tool === 'stretch') {
      const sid = target.closest('[data-oid]')?.getAttribute('data-oid');
      const so = sid ? objectsById.get(sid) : undefined;
      if (!so || so.type !== 'text' || so.locked) {
        st.select([]);
        return;
      }
      const hit = glyphAt(so, p);
      if (!hit) return;
      const key = hit.g.stretchable && !hit.g.mark ? hit.g.key : segmentStretchKey(so, hit.geo, hit.g.seg);
      if (!key) {
        st.toast('لا يوجد في هذا المقطع حرف قابل للمدّ.', 'info');
        return;
      }
      if (!selection.includes(so.id) || selection.length > 1) st.select([so.id]);
      st.setGlyphSel({ objectId: so.id, keys: [key], level: 'letter' });
      const W = linearOnly(chain(objectMatrix(so), hit.geo.copies[0]));
      // A straight line keeps its right end in place, so the letter grows leftwards as in writing.
      const anchored = so.path.mode === 'straight' && so.repeat.count <= 1 && so.mirror === 'none';
      st.beginGesture();
      drag.current = {
        kind: 'stretch',
        objectId: so.id,
        key,
        start: p,
        inv: invert(W),
        base: so.glyphs[key] ?? defaultGlyphOverride(),
        size: so.size,
        anchor: anchored ? apply(W, -1, 0) : null,
        origin: { x: so.x, y: so.y },
      };
      return;
    }

    const handle = target.closest('[data-handle]')?.getAttribute('data-handle') as Handle | null;
    const ghandle = target.closest('[data-ghandle]')?.getAttribute('data-ghandle');

    if (tool === 'glyph' && glyphObject) {
      const lf = getLoadedFont(glyphObject.fontId);
      if (ghandle && glyphSel?.keys.length && lf) {
        const geo = textGeometry(glyphObject, lf);
        const W = chain(objectMatrix(glyphObject), geo.copies[0]);
        const sel = geo.glyphs.filter((g) => glyphSel.keys.includes(g.key));
        const box = sel.reduce((acc, g) => unionRect(acc, g.bbox), emptyRect());
        const local = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
        st.beginGesture();
        drag.current = {
          kind: ghandle === 'rot' ? 'grotate' : 'gscale',
          objectId: glyphObject.id,
          keys: glyphSel.keys,
          start: p,
          center: apply(W, local.x, local.y),
          local,
          centers: Object.fromEntries(sel.map((g) => [g.key, g.baseCenter])),
          base: Object.fromEntries(glyphSel.keys.map((key) => [key, glyphObject.glyphs[key] ?? defaultGlyphOverride()])),
          flipped: W[0] * W[3] - W[1] * W[2] < 0,
        };
        return;
      }
      const oid = target.closest('[data-oid]')?.getAttribute('data-oid');
      // Between the strokes of a letter the hit area of the line is hit: use the letter's box.
      const gkey =
        target.closest('[data-gkey]')?.getAttribute('data-gkey') ?? (oid === glyphObject.id ? glyphAt(glyphObject, p)?.g.key : undefined);
      if (gkey && oid === glyphObject.id && lf) {
        const segKeys = segmentKeysOf(textGeometry(glyphObject, lf), gkey);
        const now = performance.now();
        const last = lastClick.current;
        const isDouble = !!last && last.objectId === glyphObject.id && segKeys.includes(last.key) && now - last.time < 450;
        lastClick.current = isDouble ? null : { objectId: glyphObject.id, key: gkey, time: now };
        const cur = glyphSel?.objectId === glyphObject.id ? glyphSel : null;
        const toggle = (list: string[], add: string[]) =>
          add.every((k) => list.includes(k)) ? list.filter((k) => !add.includes(k)) : [...new Set([...list, ...add])];
        let next: GlyphSelection;
        if (isDouble || e.altKey) next = { objectId: glyphObject.id, keys: [gkey], level: 'letter' };
        else if (e.shiftKey && cur) next = { ...cur, keys: toggle(cur.keys, cur.level === 'letter' ? [gkey] : segKeys) };
        else if (cur && cur.keys.includes(gkey) && (cur.level === 'letter' || segKeys.every((k) => cur.keys.includes(k)))) next = cur;
        else next = { objectId: glyphObject.id, keys: segKeys, level: 'segment' };
        const keys = next.keys;
        st.setGlyphSel(next);
        if (!keys.length) return;
        st.beginGesture();
        drag.current = {
          kind: 'gmove',
          objectId: glyphObject.id,
          keys,
          start: p,
          inv: invert(linearOnly(objectMatrix(glyphObject))),
          base: Object.fromEntries(keys.map((key) => [key, glyphObject.glyphs[key] ?? defaultGlyphOverride()])),
        };
        return;
      }
      if (oid && oid !== glyphObject.id) {
        const o = objectsById.get(oid);
        if (o?.type === 'text' && !o.locked) {
          st.select([oid]);
          return;
        }
      }
      if (!oid) st.setGlyphSel(null);
      return;
    }

    if (handle && selectedObjects.length) {
      const own = selectedObjects.filter((o) => !o.locked).map((o) => snapItem(o));
      if (!own.length) return;
      const items = [...own, ...attachedTo(own.map((it) => it.id)).map((o) => snapItem(o, true))];
      st.beginGesture();
      const single = own.length === 1;
      const box = selectionBox();
      const center = single ? { x: own[0].x, y: own[0].y } : { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
      if (handle === 'rot') drag.current = { kind: 'rotate', start: p, center, items, single };
      else drag.current = { kind: 'scale', handle, start: p, items, pivot: center, rot: single ? own[0].rotation : 0, single };
      return;
    }

    const oid = target.closest('[data-oid]')?.getAttribute('data-oid');
    const obj = oid ? objectsById.get(oid) : undefined;
    if (obj && !obj.locked) {
      let sel = selection;
      if (e.shiftKey) {
        st.toggleSelect(obj.id);
        sel = useEditor.getState().selection;
      } else if (!selection.includes(obj.id)) {
        st.select([obj.id]);
        sel = [obj.id];
      }
      const moving = page.objects.filter((o) => sel.includes(o.id) && !o.locked);
      if (!moving.length) return;
      const box = moving.reduce((acc, o) => unionRect(acc, worldBox(o)), emptyRect());
      const xs = [0, page.width / 2, page.width];
      const ys = [0, page.height / 2, page.height];
      for (const o of page.objects) {
        if (sel.includes(o.id) || o.hidden) continue;
        const b = worldBox(o);
        xs.push(b.minX, (b.minX + b.maxX) / 2, b.maxX);
        ys.push(b.minY, (b.minY + b.maxY) / 2, b.maxY);
      }
      st.beginGesture();
      const followers = attachedTo(moving.map((o) => o.id)).map((o) => snapItem(o, true));
      drag.current = { kind: 'move', start: p, items: [...moving.map((o) => snapItem(o)), ...followers], box, xs, ys };
      return;
    }

    drag.current = { kind: 'marquee', start: p, additive: e.shiftKey };
    if (!e.shiftKey) st.select([]);
  };

  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const p = toPage(e.clientX, e.clientY);
    useCursor.getState().set(p);
    const d = drag.current;
    if (!d) return;
    const st = useEditor.getState();
    switch (d.kind) {
      case 'pan':
        st.setView({ panX: d.panX + e.clientX - d.sx, panY: d.panY + e.clientY - d.sy });
        break;
      case 'move': {
        let dx = p.x - d.start.x;
        let dy = p.y - d.start.y;
        const v: number[] = [];
        const h: number[] = [];
        if (view.snap && !e.altKey) {
          const thr = 6 / k;
          const snap1 = (vals: number[], targets: number[]) => {
            let best: { d: number; t: number } | null = null;
            for (const t of targets)
              for (const val of vals) {
                const dd = t - val;
                if (Math.abs(dd) < thr && (!best || Math.abs(dd) < Math.abs(best.d))) best = { d: dd, t };
              }
            return best;
          };
          const bx = snap1([d.box.minX + dx, (d.box.minX + d.box.maxX) / 2 + dx, d.box.maxX + dx], d.xs);
          if (bx) {
            dx += bx.d;
            v.push(bx.t);
          }
          const by = snap1([d.box.minY + dy, (d.box.minY + d.box.maxY) / 2 + dy, d.box.maxY + dy], d.ys);
          if (by) {
            dy += by.d;
            h.push(by.t);
          }
        }
        setGuides({ v, h });
        st.gesture((doc) => {
          const objs = doc.pages[st.pageIndex].objects;
          for (const it of d.items) {
            const o = objs.find((x) => x.id === it.id);
            if (o) {
              o.x = it.x + dx;
              o.y = it.y + dy;
            }
          }
        });
        break;
      }
      case 'scale': {
        const toLocal = (q: Point) => {
          const r = rotate(-d.rot);
          return apply(r, q.x - d.pivot.x, q.y - d.pivot.y);
        };
        const L0 = toLocal(d.start);
        const L = toLocal(p);
        let fx = 1;
        let fy = 1;
        const corner = d.handle.length === 2;
        if (corner) {
          if (e.shiftKey && d.single) {
            fx = Math.abs(L0.x) > 1e-6 ? L.x / L0.x : 1;
            fy = Math.abs(L0.y) > 1e-6 ? L.y / L0.y : 1;
          } else {
            const den = L0.x * L0.x + L0.y * L0.y || 1;
            fx = fy = (L.x * L0.x + L.y * L0.y) / den;
          }
        } else if (d.handle === 'e' || d.handle === 'w') fx = Math.abs(L0.x) > 1e-6 ? L.x / L0.x : 1;
        else fy = Math.abs(L0.y) > 1e-6 ? L.y / L0.y : 1;
        fx = Math.max(0.02, fx);
        fy = Math.max(0.02, fy);
        st.gesture((doc) => {
          const objs = doc.pages[st.pageIndex].objects;
          for (const it of d.items) {
            const o = objs.find((x) => x.id === it.id);
            if (!o) continue;
            if (!d.single || it.attached) {
              // Scale the position in the frame of the handles (rotated for a single object).
              const q = apply(rotate(-d.rot), it.x - d.pivot.x, it.y - d.pivot.y);
              const back = apply(rotate(d.rot), q.x * fx, q.y * fy);
              o.x = d.pivot.x + back.x;
              o.y = d.pivot.y + back.y;
            }
            o.scaleX = it.scaleX * fx;
            o.scaleY = it.scaleY * fy;
          }
        });
        break;
      }
      case 'rotate': {
        const a0 = Math.atan2(d.start.y - d.center.y, d.start.x - d.center.x);
        const a1 = Math.atan2(p.y - d.center.y, p.x - d.center.x);
        let delta = ((a1 - a0) * 180) / Math.PI;
        if (e.shiftKey) delta = Math.round(delta / 15) * 15;
        st.gesture((doc) => {
          const objs = doc.pages[st.pageIndex].objects;
          for (const it of d.items) {
            const o = objs.find((x) => x.id === it.id);
            if (!o) continue;
            let r = it.rotation + delta;
            if (e.shiftKey && d.single && !it.attached) r = Math.round(r / 15) * 15;
            o.rotation = ((r % 360) + 540) % 360 - 180;
            if (!d.single || it.attached) {
              const q = apply(rotate(delta), it.x - d.center.x, it.y - d.center.y);
              o.x = d.center.x + q.x;
              o.y = d.center.y + q.y;
            }
          }
        });
        break;
      }
      case 'marquee':
        setMarquee({
          minX: Math.min(d.start.x, p.x),
          minY: Math.min(d.start.y, p.y),
          maxX: Math.max(d.start.x, p.x),
          maxY: Math.max(d.start.y, p.y),
        });
        break;
      case 'gmove': {
        const delta = apply(d.inv, p.x - d.start.x, p.y - d.start.y);
        st.gesture((doc) => {
          const o = doc.pages[st.pageIndex].objects.find((x) => x.id === d.objectId);
          if (!o || o.type !== 'text') return;
          for (const key of d.keys) {
            const b = d.base[key];
            o.glyphs[key] = { ...b, dx: b.dx + delta.x, dy: b.dy + delta.y };
          }
        });
        break;
      }
      case 'grotate':
      case 'gscale': {
        st.gesture((doc) => {
          const o = doc.pages[st.pageIndex].objects.find((x) => x.id === d.objectId);
          if (!o || o.type !== 'text') return;
          if (d.kind === 'grotate') {
            const a0 = Math.atan2(d.start.y - d.center.y, d.start.x - d.center.x);
            const a1 = Math.atan2(p.y - d.center.y, p.x - d.center.x);
            let delta = ((a1 - a0) * 180) / Math.PI;
            if (e.shiftKey) delta = Math.round(delta / 15) * 15;
            const turn = d.flipped ? -delta : delta;
            for (const key of d.keys) if (d.centers[key]) o.glyphs[key] = rotateInGroup(d.base[key], d.centers[key], d.local, turn);
          } else {
            const r0 = Math.hypot(d.start.x - d.center.x, d.start.y - d.center.y) || 1;
            const f = Math.max(0.05, Math.hypot(p.x - d.center.x, p.y - d.center.y) / r0);
            for (const key of d.keys) if (d.centers[key]) o.glyphs[key] = scaleInGroup(d.base[key], d.centers[key], d.local, f);
          }
        });
        break;
      }
      case 'stretch': {
        // Dragging towards the end of the line (leftwards) lengthens the letter.
        const along = apply(d.inv, p.x - d.start.x, p.y - d.start.y).x;
        const stretch = Math.round(clamp(d.base.stretch - along / d.size, 0, MAX_STRETCH_EM) * 1000) / 1000;
        const grow = (stretch - d.base.stretch) * d.size;
        st.gesture((doc) => {
          const o = doc.pages[st.pageIndex].objects.find((x) => x.id === d.objectId);
          if (!o || o.type !== 'text') return;
          o.glyphs[d.key] = { ...d.base, stretch };
          if (d.anchor) {
            o.x = d.origin.x + (d.anchor.x * grow) / 2;
            o.y = d.origin.y + (d.anchor.y * grow) / 2;
          }
        });
        break;
      }
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    const st = useEditor.getState();
    if (!d) return;
    if (d.kind === 'marquee') {
      const m = marquee;
      setMarquee(null);
      if (!m || m.maxX - m.minX < 0.5) return;
      const hits = page.objects
        .filter((o) => !o.locked && !o.hidden)
        .filter((o) => {
          const b = worldBox(o);
          return b.minX >= m.minX && b.maxX <= m.maxX && b.minY >= m.minY && b.maxY <= m.maxY;
        })
        .map((o) => o.id);
      st.select(d.additive ? [...new Set([...st.selection, ...hits])] : hits);
      return;
    }
    if (d.kind !== 'pan') {
      setGuides({ v: [], h: [] });
      st.endGesture();
    }
  };

  const onDoubleClick = (e: RMouseEvent) => {
    if (tool !== 'select') return;
    // Pointer capture retargets dblclick to the <svg>, so hit-test the actual point.
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const oid = hit?.closest('[data-oid]')?.getAttribute('data-oid');
    const o = oid ? objectsById.get(oid) : undefined;
    if (o?.type === 'text' && !o.locked) {
      const st = useEditor.getState();
      st.select([o.id]);
      st.setTool('glyph');
      const hit = glyphAt(o, toPage(e.clientX, e.clientY));
      if (hit) st.setGlyphSel({ objectId: o.id, keys: segmentKeysOf(hit.geo, hit.g.key), level: 'segment' });
    }
  };

  const toScreen = (q: Point): Point => ({ x: view.panX + q.x * k, y: view.panY + q.y * k });
  const poly = (pts: Point[]) => pts.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');

  // ----- overlay -----
  const overlay: ReactElement[] = [];
  const handleEl = (key: string, at: Point, h: Handle | string, ghandle = false) => (
    <path
      key={key}
      d={`M${at.x},${at.y - 6.5}L${at.x + 5},${at.y}L${at.x},${at.y + 6.5}L${at.x - 5},${at.y}Z`}
      className="handle"
      {...(ghandle ? { 'data-ghandle': h } : { 'data-handle': h })}
    />
  );
  let variantAnchor: Point | null = null;
  if (tool === 'stretch' && glyphObject) {
    const lf = getLoadedFont(glyphObject.fontId);
    if (lf) {
      const geo = textGeometry(glyphObject, lf);
      const W = chain(objectMatrix(glyphObject), geo.copies[0]);
      for (const g of geo.glyphs) {
        if (!g.stretchable || g.mark || g.hidden) continue;
        const active = glyphSel?.objectId === glyphObject.id && glyphSel.keys.includes(g.key);
        overlay.push(<polygon key={'st' + g.key} className={'stretchable' + (active ? ' active' : '')} points={poly(rectCorners(W, g.bbox).map(toScreen))} />);
      }
    }
  }
  if (tool === 'glyph' && glyphObject) {
    const lf = getLoadedFont(glyphObject.fontId);
    overlay.push(<polygon key="gobj" className="sel-outline dashed" points={poly(rectCorners(objectMatrix(glyphObject), localBox(glyphObject)).map(toScreen))} />);
    if (lf && glyphSel?.objectId === glyphObject.id && glyphSel.keys.length) {
      const geo = textGeometry(glyphObject, lf);
      const W = chain(objectMatrix(glyphObject), geo.copies[0]);
      const sel = geo.glyphs.filter((g) => glyphSel.keys.includes(g.key));
      const groups = new Map<string, Rect>();
      for (const g of sel) {
        const id = glyphSel.level === 'segment' && g.seg >= 0 ? 's' + g.seg : 'g' + g.key;
        groups.set(id, unionRect(groups.get(id) ?? emptyRect(), g.bbox));
      }
      for (const [id, r] of groups) overlay.push(<polygon key={id} className={'glyph-sel ' + glyphSel.level} points={poly(rectCorners(W, r).map(toScreen))} />);
      const box = sel.reduce((acc, g) => unionRect(acc, g.bbox), emptyRect());
      if (!isEmptyRect(box)) {
        const pts = rectCorners(W, box).map(toScreen);
        variantAnchor = { x: pts.reduce((a, q) => a + q.x, 0) / 4, y: Math.max(...pts.map((q) => q.y)) };
      }
      if (!isEmptyRect(box)) {
        const corners = rectCorners(W, box).map(toScreen);
        const top = { x: (corners[0].x + corners[1].x) / 2, y: (corners[0].y + corners[1].y) / 2 };
        const c = toScreen(apply(W, (box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2));
        const dirX = top.x - c.x;
        const dirY = top.y - c.y;
        const len = Math.hypot(dirX, dirY) || 1;
        const rot = { x: top.x + (dirX / len) * 20, y: top.y + (dirY / len) * 20 };
        overlay.push(<line key="grl" className="rot-stem" x1={top.x} y1={top.y} x2={rot.x} y2={rot.y} />);
        overlay.push(<circle key="grot" className="rot-handle" cx={rot.x} cy={rot.y} r={5.5} data-ghandle="rot" />);
        overlay.push(handleEl('gscale', corners[2], 'scale', true));
      }
    }
  } else if (tool !== 'stretch' && selectedObjects.length === 1) {
    const o = selectedObjects[0];
    const W = objectMatrix(o);
    const b = localBox(o);
    const c = rectCorners(W, b).map(toScreen);
    overlay.push(<polygon key="outline" className={'sel-outline' + (o.locked ? ' locked' : '')} points={poly(c)} />);
    if (o.type === 'text') {
      const a = toScreen(apply(W, b.minX, 0));
      const z = toScreen(apply(W, b.maxX, 0));
      overlay.push(<line key="baseline" className="baseline" x1={a.x} y1={a.y} x2={z.x} y2={z.y} />);
    }
    if (!o.locked) {
      const mid = (p1: Point, p2: Point) => ({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 });
      const names: Handle[] = ['nw', 'ne', 'se', 'sw'];
      c.forEach((q, i) => overlay.push(handleEl(names[i], q, names[i])));
      overlay.push(handleEl('n', mid(c[0], c[1]), 'n'));
      overlay.push(handleEl('e', mid(c[1], c[2]), 'e'));
      overlay.push(handleEl('s', mid(c[2], c[3]), 's'));
      overlay.push(handleEl('w', mid(c[3], c[0]), 'w'));
      const top = mid(c[0], c[1]);
      const center = mid(c[0], c[2]);
      const len = Math.hypot(top.x - center.x, top.y - center.y) || 1;
      const rot = { x: top.x + ((top.x - center.x) / len) * 24, y: top.y + ((top.y - center.y) / len) * 24 };
      overlay.push(<line key="rl" className="rot-stem" x1={top.x} y1={top.y} x2={rot.x} y2={rot.y} />);
      overlay.push(<circle key="rot" className="rot-handle" cx={rot.x} cy={rot.y} r={5.5} data-handle="rot" />);
    }
  } else if (tool !== 'stretch' && selectedObjects.length > 1) {
    const box = selectionBox();
    const c = [
      { x: box.minX, y: box.minY },
      { x: box.maxX, y: box.minY },
      { x: box.maxX, y: box.maxY },
      { x: box.minX, y: box.maxY },
    ].map(toScreen);
    for (const o of selectedObjects) overlay.push(<polygon key={'m' + o.id} className="sel-outline faint" points={poly(rectCorners(objectMatrix(o), localBox(o)).map(toScreen))} />);
    overlay.push(<polygon key="outline" className="sel-outline" points={poly(c)} />);
    const names: Handle[] = ['nw', 'ne', 'se', 'sw'];
    c.forEach((q, i) => overlay.push(handleEl(names[i], q, names[i])));
    const top = { x: (c[0].x + c[1].x) / 2, y: c[0].y };
    overlay.push(<line key="rl" className="rot-stem" x1={top.x} y1={top.y} x2={top.x} y2={top.y - 24} />);
    overlay.push(<circle key="rot" className="rot-handle" cx={top.x} cy={top.y - 24} r={5.5} data-handle="rot" />);
  }

  const cursorClass = spaceDown || tool === 'hand' ? 'tool-hand' : `tool-${tool}`;
  const gridStep = 10;

  return (
    <div className={'stage ' + cursorClass + (view.rulers ? ' with-rulers' : '')} ref={wrapRef}>
      <svg
        ref={svgRef}
        className="stage-svg"
        width={size.w}
        height={size.h}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => useCursor.getState().set(null)}
        onDoubleClick={onDoubleClick}
        role="application"
        aria-label="لوحة الرسم"
      >
        <g transform={`translate(${view.panX} ${view.panY}) scale(${k})`}>
          <rect className="page-shadow" x={0} y={0} width={page.width} height={page.height} />
          <PageContent page={page} mode="edit" glyphObjectId={glyphObject?.id ?? null} fontsVersion={fontsVersion} />
          {view.grid && (
            <g className="grid" pointerEvents="none">
              {Array.from({ length: Math.floor(page.width / gridStep) + 1 }, (_, i) => (
                <line key={'gx' + i} x1={i * gridStep} x2={i * gridStep} y1={0} y2={page.height} />
              ))}
              {Array.from({ length: Math.floor(page.height / gridStep) + 1 }, (_, i) => (
                <line key={'gy' + i} y1={i * gridStep} y2={i * gridStep} x1={0} x2={page.width} />
              ))}
            </g>
          )}
          {ghost && cursor && (
            <g transform={`translate(${cursor.x} ${cursor.y})`} opacity={0.5} pointerEvents="none">
              <ObjectView o={ghost} mode="export" glyphEdit={false} fontsVersion={fontsVersion} />
            </g>
          )}
        </g>
        <g className="overlay">{overlay}</g>
        {guides.v.map((x, i) => (
          <line key={'gv' + i} className="snap-guide" x1={toScreen({ x, y: 0 }).x} x2={toScreen({ x, y: 0 }).x} y1={0} y2={size.h} />
        ))}
        {guides.h.map((y, i) => (
          <line key={'gh' + i} className="snap-guide" y1={toScreen({ x: 0, y }).y} y2={toScreen({ x: 0, y }).y} x1={0} x2={size.w} />
        ))}
        {marquee && (
          <rect
            className="marquee"
            x={toScreen({ x: marquee.minX, y: 0 }).x}
            y={toScreen({ x: 0, y: marquee.minY }).y}
            width={(marquee.maxX - marquee.minX) * k}
            height={(marquee.maxY - marquee.minY) * k}
          />
        )}
      </svg>
      {variantAnchor && variants.length > 1 && glyphObject && glyphSel && (
        <div
          className="variant-pop"
          style={{ left: clamp(variantAnchor.x, 120, Math.max(120, size.w - 120)), top: Math.min(variantAnchor.y + 14, Math.max(0, size.h - 90)) }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="variant-pop-title">{glyphSel.level === 'segment' ? 'بدائل المقطع' : 'بدائل الحرف'} <kbd>[</kbd> <kbd>]</kbd></div>
          <VariantList compact variants={variants} onPick={(v) => applyVariant(glyphObject, glyphSel, v)} />
        </div>
      )}
      {view.rulers && size.w > 0 && <Rulers width={size.w} height={size.h} k={k} panX={view.panX} panY={view.panY} cursor={cursor} />}
    </div>
  );
}
