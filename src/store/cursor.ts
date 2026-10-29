import { create } from 'zustand';

/** Pointer position on the page in millimetres, for the status bar. */
export const useCursor = create<{ pos: { x: number; y: number } | null; set: (pos: { x: number; y: number } | null) => void }>()(
  (set) => ({ pos: null, set: (pos) => set({ pos }) }),
);
