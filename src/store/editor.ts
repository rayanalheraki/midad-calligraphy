import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Draft } from 'immer';
import { createDoc, createPage, uid } from '../model/defaults';
import type { DocObject, KhattatDoc, Page } from '../model/types';

export type Tool = 'select' | 'glyph' | 'stretch' | 'hand' | 'mark' | 'text';

/**
 * Parts of a line being edited: a whole connected segment (مقطع) on a single click, or one
 * letter, dot group or diacritic after a double click.
 */
export interface GlyphSelection {
  objectId: string;
  keys: string[];
  level: 'segment' | 'letter';
}
export type DialogId = 'export' | 'templates' | 'works' | 'pageText' | 'about' | 'fonts' | 'import' | 'shortcuts' | null;

export interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
  rulers: boolean;
  grid: boolean;
  snap: boolean;
  fitRequest: number;
}

export interface Toast {
  id: string;
  text: string;
  kind: 'info' | 'error' | 'success';
}

export interface ImportReport {
  title: string;
  lines: string[];
  warnings: string[];
}

interface EditorState {
  doc: KhattatDoc;
  pageIndex: number;
  selection: string[];
  glyphSel: GlyphSelection | null;
  tool: Tool;
  view: ViewState;
  /** element chosen for placement while the element tool is active */
  pendingElement: string;
  /** line the placed elements are attached to */
  elementOwner: string | null;
  past: KhattatDoc[];
  future: KhattatDoc[];
  gestureBase: KhattatDoc | null;
  dialog: DialogId;
  toasts: Toast[];
  keyboardOpen: boolean;
  importReport: ImportReport | null;
  clipboard: DocObject[];
  savedWorkId: string | null;

  commit: (recipe: (doc: Draft<KhattatDoc>) => void) => void;
  beginGesture: () => void;
  gesture: (recipe: (doc: Draft<KhattatDoc>) => void) => void;
  /** Applies a change inside the current gesture, or as its own undo step when none is active. */
  liveEdit: (recipe: (doc: Draft<KhattatDoc>) => void) => void;
  endGesture: () => void;
  undo: () => void;
  redo: () => void;
  loadDoc: (doc: KhattatDoc, workId?: string | null) => void;

  setPageIndex: (i: number) => void;
  addPage: () => void;
  duplicatePage: () => void;
  removePage: () => void;
  updatePage: (recipe: (p: Draft<Page>) => void) => void;

  addObject: (o: DocObject, select?: boolean) => void;
  updateObject: (id: string, recipe: (o: Draft<DocObject>) => void) => void;
  removeSelected: () => void;
  duplicateSelected: () => void;
  copySelected: () => void;
  paste: () => void;
  reorder: (id: string, where: 'up' | 'down' | 'top' | 'bottom') => void;

  select: (ids: string[]) => void;
  toggleSelect: (id: string) => void;
  setGlyphSel: (sel: GlyphSelection | null) => void;
  setTool: (t: Tool) => void;
  setView: (v: Partial<ViewState>) => void;
  startElement: (id: string) => void;
  setDialog: (d: DialogId) => void;
  setKeyboardOpen: (open: boolean) => void;
  setImportReport: (r: ImportReport | null) => void;
  setSavedWorkId: (id: string | null) => void;
  toast: (text: string, kind?: Toast['kind']) => void;
  dismissToast: (id: string) => void;
}

const HISTORY_LIMIT = 150;

/** The ids plus the ids of elements attached to any of them. */
export function withAttached(objects: readonly DocObject[], ids: readonly string[]): string[] {
  const set = new Set(ids);
  for (const o of objects) if (o.type === 'mark' && o.ownerId && set.has(o.ownerId)) set.add(o.id);
  return [...set];
}

/** Deep copies with fresh ids, offset by `shift` mm; attached elements follow their copied line. */
function cloneObjects(objects: readonly DocObject[], ids: readonly string[], roots: readonly string[], shift: number) {
  const wanted = new Set(ids);
  const remap = new Map<string, string>();
  const source = objects.filter((o) => wanted.has(o.id));
  for (const o of source) remap.set(o.id, uid(o.id[0]));
  const copies = source.map((o) => {
    const c = { ...JSON.parse(JSON.stringify(o)), id: remap.get(o.id)!, x: o.x + shift, y: o.y + shift } as DocObject;
    if (c.type === 'mark' && c.ownerId) c.ownerId = remap.get(c.ownerId) ?? null;
    return c;
  });
  return { copies, roots: roots.map((id) => remap.get(id)).filter((x): x is string => !!x) };
}

function ownerFromSelection(s: Draft<EditorState>): string | null {
  const page = s.doc.pages[Math.min(s.pageIndex, s.doc.pages.length - 1)];
  const sel = page.objects.find((o) => o.id === s.selection[0]);
  if (!sel) return null;
  if (sel.type === 'text') return sel.id;
  if (sel.type === 'mark') return sel.ownerId;
  return null;
}

export const useEditor = create<EditorState>()(
  immer((set, get) => {
    const pushHistory = (before: KhattatDoc) => {
      set((s) => {
        s.past.push(before as Draft<KhattatDoc>);
        if (s.past.length > HISTORY_LIMIT) s.past.shift();
        s.future = [];
        s.doc.meta.modified = new Date().toISOString();
      });
    };
    const currentPage = (s: Draft<EditorState>) => s.doc.pages[Math.min(s.pageIndex, s.doc.pages.length - 1)];

    return {
      doc: createDoc(),
      pageIndex: 0,
      selection: [],
      glyphSel: null,
      tool: 'select',
      view: { zoom: 1, panX: 0, panY: 0, rulers: true, grid: false, snap: true, fitRequest: 1 },
      pendingElement: 'fatha',
      elementOwner: null,
      past: [],
      future: [],
      gestureBase: null,
      dialog: null,
      toasts: [],
      keyboardOpen: false,
      importReport: null,
      clipboard: [],
      savedWorkId: null,

      commit: (recipe) => {
        const before = get().doc;
        set((s) => recipe(s.doc));
        if (get().doc !== before) pushHistory(before);
      },
      beginGesture: () => {
        const pending = get().gestureBase;
        if (pending && pending !== get().doc) pushHistory(pending);
        set((s) => void (s.gestureBase = s.doc));
      },
      gesture: (recipe) => set((s) => recipe(s.doc)),
      liveEdit: (recipe) => {
        if (get().gestureBase) set((s) => recipe(s.doc));
        else get().commit(recipe);
      },
      endGesture: () => {
        const base = get().gestureBase;
        set((s) => void (s.gestureBase = null));
        if (base && base !== get().doc) pushHistory(base);
      },
      undo: () =>
        set((s) => {
          const prev = s.past.pop();
          if (!prev) return;
          s.future.push(s.doc);
          s.doc = prev;
          s.pageIndex = Math.min(s.pageIndex, s.doc.pages.length - 1);
          s.glyphSel = null;
        }),
      redo: () =>
        set((s) => {
          const next = s.future.pop();
          if (!next) return;
          s.past.push(s.doc);
          s.doc = next;
          s.pageIndex = Math.min(s.pageIndex, s.doc.pages.length - 1);
        }),
      loadDoc: (doc, workId = null) =>
        set((s) => {
          s.doc = doc as Draft<KhattatDoc>;
          s.pageIndex = 0;
          s.selection = [];
          s.glyphSel = null;
          s.past = [];
          s.future = [];
          s.savedWorkId = workId;
          s.view.fitRequest++;
        }),

      setPageIndex: (i) =>
        set((s) => {
          s.pageIndex = Math.max(0, Math.min(i, s.doc.pages.length - 1));
          s.selection = [];
          s.glyphSel = null;
          s.view.fitRequest++;
        }),
      addPage: () => {
        const p = currentPage(get() as Draft<EditorState>);
        get().commit((d) => void d.pages.push(createPage(p.width, p.height, 'صفحة')));
        get().setPageIndex(get().doc.pages.length - 1);
      },
      duplicatePage: () => {
        const p = get().doc.pages[get().pageIndex];
        const copy: Page = JSON.parse(JSON.stringify(p));
        copy.id = uid('p');
        copy.objects = copy.objects.map((o) => ({ ...o, id: uid(o.id[0]) }));
        get().commit((d) => void d.pages.splice(get().pageIndex + 1, 0, copy));
        get().setPageIndex(get().pageIndex + 1);
      },
      removePage: () => {
        if (get().doc.pages.length <= 1) return get().toast('لا يمكن حذف الصفحة الوحيدة.', 'error');
        const i = get().pageIndex;
        get().commit((d) => void d.pages.splice(i, 1));
        get().setPageIndex(Math.max(0, i - 1));
      },
      updatePage: (recipe) => get().commit((d) => recipe(d.pages[get().pageIndex])),

      addObject: (o, selectIt = true) => {
        get().commit((d) => void d.pages[get().pageIndex].objects.push(o as Draft<DocObject>));
        if (selectIt) set((s) => void ((s.selection = [o.id]), (s.glyphSel = null)));
      },
      updateObject: (id, recipe) =>
        get().commit((d) => {
          const o = d.pages[get().pageIndex].objects.find((x) => x.id === id);
          if (o) recipe(o);
        }),
      removeSelected: () => {
        const page = get().doc.pages[get().pageIndex];
        const sel = new Set(withAttached(page.objects, get().selection));
        if (!sel.size) return;
        get().commit((d) => {
          const p = d.pages[get().pageIndex];
          p.objects = p.objects.filter((o) => !sel.has(o.id) || o.locked);
        });
        set((s) => void ((s.selection = []), (s.glyphSel = null)));
      },
      duplicateSelected: () => {
        const page = get().doc.pages[get().pageIndex];
        const { copies, roots } = cloneObjects(page.objects, withAttached(page.objects, get().selection), get().selection, 6);
        if (!copies.length) return;
        get().commit((d) => void d.pages[get().pageIndex].objects.push(...(copies as Draft<DocObject>[])));
        set((s) => void (s.selection = roots));
      },
      copySelected: () => {
        const page = get().doc.pages[get().pageIndex];
        const ids = new Set(withAttached(page.objects, get().selection));
        const objs = page.objects.filter((o) => ids.has(o.id));
        set((s) => void (s.clipboard = JSON.parse(JSON.stringify(objs))));
        if (objs.length) get().toast(`نُسخ ${objs.length} عنصر.`, 'info');
      },
      paste: () => {
        const clip = get().clipboard;
        const { copies } = cloneObjects(clip, clip.map((o) => o.id), [], 8);
        if (!copies.length) return;
        get().commit((d) => void d.pages[get().pageIndex].objects.push(...(copies as Draft<DocObject>[])));
        set((s) => void (s.selection = copies.filter((c) => !(c.type === 'mark' && c.ownerId)).map((c) => c.id)));
      },
      reorder: (id, where) =>
        get().commit((d) => {
          const objs = d.pages[get().pageIndex].objects;
          const i = objs.findIndex((o) => o.id === id);
          if (i < 0) return;
          const [o] = objs.splice(i, 1);
          const j = where === 'top' ? objs.length : where === 'bottom' ? 0 : where === 'up' ? Math.min(objs.length, i + 1) : Math.max(0, i - 1);
          objs.splice(j, 0, o);
        }),

      select: (ids) => set((s) => void ((s.selection = ids), (s.glyphSel = null))),
      toggleSelect: (id) =>
        set((s) => {
          s.selection = s.selection.includes(id) ? s.selection.filter((x) => x !== id) : [...s.selection, id];
          s.glyphSel = null;
        }),
      setGlyphSel: (sel) => set((s) => void (s.glyphSel = sel)),
      setTool: (t) =>
        set((s) => {
          if (t === 'mark' && s.tool !== 'mark') s.elementOwner = ownerFromSelection(s);
          s.tool = t;
          if (t !== 'glyph' && t !== 'stretch') s.glyphSel = null;
        }),
      setView: (v) => set((s) => void Object.assign(s.view, v)),
      startElement: (id) =>
        set((s) => {
          s.pendingElement = id;
          if (s.tool !== 'mark') s.elementOwner = ownerFromSelection(s);
          s.tool = 'mark';
          s.glyphSel = null;
        }),
      setDialog: (d) => set((s) => void (s.dialog = d)),
      setKeyboardOpen: (open) => set((s) => void (s.keyboardOpen = open)),
      setImportReport: (r) => set((s) => void ((s.importReport = r), (s.dialog = r ? 'import' : s.dialog))),
      setSavedWorkId: (id) => set((s) => void (s.savedWorkId = id)),
      toast: (text, kind = 'info') => {
        const id = uid('m');
        set((s) => void s.toasts.push({ id, text, kind }));
        setTimeout(() => get().dismissToast(id), kind === 'error' ? 7000 : 3500);
      },
      dismissToast: (id) => set((s) => void (s.toasts = s.toasts.filter((t) => t.id !== id))),
    };
  }),
);

export function usePage(): Page {
  return useEditor((s) => s.doc.pages[Math.min(s.pageIndex, s.doc.pages.length - 1)]);
}

export function useSelectedObjects(): DocObject[] {
  const page = usePage();
  const selection = useEditor((s) => s.selection);
  return page.objects.filter((o) => selection.includes(o.id));
}
