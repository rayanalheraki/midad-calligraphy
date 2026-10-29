import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent, type ReactElement } from 'react';
import { createText, defaultGlyphOverride } from '../model/defaults';
import { findElement, markFromElement, type ElementStyle } from '../model/elements';
import type { DocObject, GlyphOverride, MarkObject, TextObject } from '../model/types';
import { getLoadedFont } from '../engine/fonts';
import { textGeometry } from '../engine/layout';
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
import { usePage, useEditor, withAttached } from '../store/editor';
import { useFonts } from '../store/fonts';
import { useCursor } from '../store/cursor';
import { lastTextStyle } from './textDefaults';
import { RULER, Rulers } from './Rulers';

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
  w: number;
  h: number;
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
  | { kind: 'grotate' | 'gscale'; objectId: string; keys: string[]; start: Point; center: Point; base: Record<string, GlyphOverride> };

const snapItem = (o: DocObject, attached = false): ItemSnap => ({
  id: o.id,
  type: o.type,
  x: o.x,
  y: o.y,
  rotation: o.rotation,
  scaleX: o.scaleX,
  scaleY: o.scaleY,
  w: 'w' in o ? o.w : 0,
  h: 'h' in o ? o.h : 0,
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
    if (tool !== 'glyph') return null;
    const o = selectedObjects[0];
    return o && o.type === 'text' ? o : null;
  })();

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
      st.addObject(t);
      st.setTool('select');
      window.dispatchEvent(new CustomEvent('midad:focus-text'));
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
        const c = apply(W, (box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2);
        st.beginGesture();
        drag.current = {
          kind: ghandle === 'rot' ? 'grotate' : 'gscale',
          objectId: glyphObject.id,
          keys: glyphSel.keys,
          start: p,
          center: c,
          base: Object.fromEntries(glyphSel.keys.map((key) => [key, glyphObject.glyphs[key] ?? defaultGlyphOverride()])),
        };
        return;
      }
      const gkey = target.closest('[data-gkey]')?.getAttribute('data-gkey');
      const oid = target.closest('[data-oid]')?.getAttribute('data-oid');
      if (gkey && oid === glyphObject.id) {
        let keys = glyphSel?.objectId === glyphObject.id ? glyphSel.keys : [];
        if (e.shiftKey) keys = keys.includes(gkey) ? keys.filter((x) => x !== gkey) : [...keys, gkey];
        else if (!keys.includes(gkey)) keys = [gkey];
        st.setGlyphSel({ objectId: glyphObject.id, keys });
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
            if (o.type === 'image') {
              o.w = Math.max(0.5, it.w * fx);
              o.h = Math.max(0.5, it.h * fy);
            } else {
              o.scaleX = it.scaleX * fx;
              o.scaleY = it.scaleY * fy;
            }
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
            for (const key of d.keys) o.glyphs[key] = { ...d.base[key], rotate: d.base[key].rotate + delta };
          } else {
            const r0 = Math.hypot(d.start.x - d.center.x, d.start.y - d.center.y) || 1;
            const f = Math.max(0.05, Math.hypot(p.x - d.center.x, p.y - d.center.y) / r0);
            for (const key of d.keys) o.glyphs[key] = { ...d.base[key], scale: clamp(d.base[key].scale * f, 0.05, 20) };
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
  if (tool === 'glyph' && glyphObject) {
    const lf = getLoadedFont(glyphObject.fontId);
    overlay.push(<polygon key="gobj" className="sel-outline dashed" points={poly(rectCorners(objectMatrix(glyphObject), localBox(glyphObject)).map(toScreen))} />);
    if (lf && glyphSel?.objectId === glyphObject.id && glyphSel.keys.length) {
      const geo = textGeometry(glyphObject, lf);
      const W = chain(objectMatrix(glyphObject), geo.copies[0]);
      const sel = geo.glyphs.filter((g) => glyphSel.keys.includes(g.key));
      for (const g of sel) overlay.push(<polygon key={'g' + g.key} className="glyph-sel" points={poly(rectCorners(W, g.bbox).map(toScreen))} />);
      const box = sel.reduce((acc, g) => unionRect(acc, g.bbox), emptyRect());
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
  } else if (selectedObjects.length === 1) {
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
  } else if (selectedObjects.length > 1) {
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
      {view.rulers && size.w > 0 && <Rulers width={size.w} height={size.h} k={k} panX={view.panX} panY={view.panY} cursor={cursor} />}
    </div>
  );
}
