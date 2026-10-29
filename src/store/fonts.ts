import { create } from 'zustand';
import { ensureFont } from '../engine/fontLoader';
import { addUserFontDef, getLoadedFont, isSfnt, loadFontFromBuffer, MAX_FONT_BYTES, removeUserFont, type FontDef } from '../engine/fonts';
import { idbAll, idbDelete, idbPut, type StoredFont } from '../io/storage';

type Status = 'loading' | 'ready' | 'error';

interface FontState {
  status: Record<string, Status>;
  /** bumps whenever a font finishes loading so renderers recompute */
  version: number;
  userFonts: FontDef[];
  request: (id: string) => Promise<void>;
  loadUserFonts: () => Promise<void>;
  addUserFont: (file: File) => Promise<FontDef>;
  deleteUserFont: (id: string) => Promise<void>;
}

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export const useFonts = create<FontState>()((set, get) => ({
  status: {},
  version: 0,
  userFonts: [],
  request: async (id) => {
    if (getLoadedFont(id)) {
      if (get().status[id] !== 'ready') set((s) => ({ status: { ...s.status, [id]: 'ready' } }));
      return;
    }
    if (get().status[id] === 'loading') return;
    set((s) => ({ status: { ...s.status, [id]: 'loading' } }));
    try {
      await ensureFont(id);
      set((s) => ({ status: { ...s.status, [id]: 'ready' }, version: s.version + 1 }));
    } catch {
      set((s) => ({ status: { ...s.status, [id]: 'error' } }));
    }
  },
  loadUserFonts: async () => {
    const stored = await idbAll<StoredFont>('fonts').catch(() => [] as StoredFont[]);
    const defs: FontDef[] = stored.map((f) => ({ id: f.id, name: f.name, category: 'خطوطي', lang: 'ar', kashida: true, builtin: false }));
    defs.forEach(addUserFontDef);
    set({ userFonts: defs });
  },
  addUserFont: async (file) => {
    if (file.size > MAX_FONT_BYTES) throw new Error('ملف الخط أكبر من ٢٠ ميغابايت.');
    const data = await file.arrayBuffer();
    if (!isSfnt(new Uint8Array(data))) throw new Error('الملف المختار ليس خط TTF أو OTF.');
    const id = 'user-' + (await sha256Hex(data)).slice(0, 16);
    const name = file.name.replace(/\.(ttf|otf)$/i, '').slice(0, 60) || 'خط مضاف';
    const def: FontDef = { id, name, category: 'خطوطي', lang: 'ar', kashida: true, builtin: false };
    addUserFontDef(def);
    await loadFontFromBuffer(def, data);
    await idbPut('fonts', id, { id, name, data } satisfies StoredFont);
    set((s) => ({
      userFonts: [...s.userFonts.filter((f) => f.id !== id), def],
      status: { ...s.status, [id]: 'ready' },
      version: s.version + 1,
    }));
    return def;
  },
  deleteUserFont: async (id) => {
    await idbDelete('fonts', id);
    removeUserFont(id);
    set((s) => ({ userFonts: s.userFonts.filter((f) => f.id !== id), version: s.version + 1 }));
  },
}));
