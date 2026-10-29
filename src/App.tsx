import { useEffect, useState } from 'react';
import type { Draft } from 'immer';
import type { TextObject } from './model/types';
import { createDoc } from './model/defaults';
import { TEMPLATES } from './model/templates';
import { useEditor, withAttached } from './store/editor';
import { useFonts } from './store/fonts';
import { idbGet, idbPut } from './io/storage';
import { parseProject, serializeDoc } from './io/project';
import { TopBar } from './ui/TopBar';
import { ToolRail } from './ui/ToolRail';
import { Stage } from './ui/Stage';
import { SidePanel } from './ui/SidePanel';
import { StatusBar } from './ui/StatusBar';
import { KeyboardPanel } from './ui/Keyboard';
import { Dialogs, Toasts } from './ui/Dialogs';
import { handleDroppedFiles, newDocument, openProjectFile, printDocument, saveProjectFile, saveToWorks } from './ui/actions';

// Bumped when the document format changes, so stale sessions are not restored.
const AUTOSAVE_KEY = 'session-v2';

function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) return true;
  if (tag === 'INPUT') return !['checkbox', 'radio', 'range', 'button', 'color'].includes((el as HTMLInputElement).type);
  return false;
}

function nudge(dx: number, dy: number) {
  const st = useEditor.getState();
  if (st.tool === 'glyph' && st.glyphSel?.keys.length) {
    const { objectId, keys } = st.glyphSel;
    st.updateObject(objectId, (d) => {
      const t = d as Draft<TextObject>;
      for (const k of keys) {
        const g = t.glyphs[k] ?? { dx: 0, dy: 0, rotate: 0, scale: 1, color: null, hidden: false };
        t.glyphs[k] = { ...g, dx: g.dx + dx * 0.2, dy: g.dy + dy * 0.2 };
      }
    });
    return;
  }
  if (!st.selection.length) return;
  const ids = new Set(withAttached(st.doc.pages[st.pageIndex].objects, st.selection));
  st.commit((d) => {
    for (const o of d.pages[st.pageIndex].objects) {
      if (ids.has(o.id) && !o.locked) {
        o.x += dx;
        o.y += dy;
      }
    }
  });
}

export function App() {
  const keyboardOpen = useEditor((s) => s.keyboardOpen);
  const [dragging, setDragging] = useState(false);

  // Restore the last session, or open a welcome composition on first run.
  useEffect(() => {
    void useFonts.getState().request('aref-ruqaa-bold');
    void (async () => {
      await useFonts.getState().loadUserFonts();
      const saved = await idbGet<string>('autosave', AUTOSAVE_KEY).catch(() => undefined);
      if (typeof saved === 'string') {
        try {
          useEditor.getState().loadDoc(parseProject(saved).doc);
          return;
        } catch {
          // fall through to a fresh document
        }
      }
      // First visit: open on the circular seal composition.
      const seal = TEMPLATES.find((t) => t.id === 'seal') ?? TEMPLATES[0];
      const doc = createDoc(seal.name);
      doc.pages = [seal.build()];
      useEditor.getState().loadDoc(doc);
    })();
  }, []);

  // Autosave to IndexedDB shortly after each change.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useEditor.subscribe((s, prev) => {
      if (s.doc === prev.doc) return;
      clearTimeout(timer);
      timer = setTimeout(() => void idbPut('autosave', AUTOSAVE_KEY, serializeDoc(useEditor.getState().doc)).catch(() => undefined), 1200);
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.code === 'KeyS') {
        e.preventDefault();
        if (e.shiftKey) saveProjectFile();
        else void saveToWorks();
        return;
      }
      if (mod && e.code === 'KeyO') {
        e.preventDefault();
        void openProjectFile();
        return;
      }
      if (mod && e.code === 'KeyE') {
        e.preventDefault();
        st.setDialog('export');
        return;
      }
      if (mod && e.code === 'KeyP') {
        e.preventDefault();
        void printDocument();
        return;
      }
      if (mod && e.altKey && e.code === 'KeyN') {
        e.preventDefault();
        newDocument();
        return;
      }
      if (st.dialog || isTyping()) return;
      if (mod) {
        switch (e.code) {
          case 'KeyZ':
            e.preventDefault();
            if (e.shiftKey) st.redo();
            else st.undo();
            return;
          case 'KeyY':
            e.preventDefault();
            st.redo();
            return;
          case 'KeyC':
            st.copySelected();
            return;
          case 'KeyV':
            e.preventDefault();
            st.paste();
            return;
          case 'KeyD':
            e.preventDefault();
            st.duplicateSelected();
            return;
          case 'KeyA':
            e.preventDefault();
            st.select(st.doc.pages[st.pageIndex].objects.filter((o) => !o.locked).map((o) => o.id));
            return;
          case 'Digit0':
          case 'Numpad0':
            e.preventDefault();
            st.setView({ fitRequest: st.view.fitRequest + 1 });
            return;
          case 'Equal':
          case 'NumpadAdd':
            e.preventDefault();
            st.setView({ zoom: Math.min(16, st.view.zoom * 1.25) });
            return;
          case 'Minus':
          case 'NumpadSubtract':
            e.preventDefault();
            st.setView({ zoom: Math.max(0.05, st.view.zoom / 1.25) });
            return;
        }
        return;
      }
      switch (e.code) {
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          if (st.tool === 'glyph' && st.glyphSel?.keys.length) {
            const { objectId, keys } = st.glyphSel;
            st.updateObject(objectId, (d) => {
              const t = d as Draft<TextObject>;
              for (const k of keys) t.glyphs[k] = { ...(t.glyphs[k] ?? { dx: 0, dy: 0, rotate: 0, scale: 1, color: null }), hidden: true };
            });
          } else st.removeSelected();
          return;
        case 'Escape':
          if (st.tool === 'glyph' || st.tool === 'mark') st.setTool('select');
          else st.select([]);
          return;
        case 'ArrowLeft':
          e.preventDefault();
          nudge(e.shiftKey ? -10 : -1, 0);
          return;
        case 'ArrowRight':
          e.preventDefault();
          nudge(e.shiftKey ? 10 : 1, 0);
          return;
        case 'ArrowUp':
          e.preventDefault();
          nudge(0, e.shiftKey ? -10 : -1);
          return;
        case 'ArrowDown':
          e.preventDefault();
          nudge(0, e.shiftKey ? 10 : 1);
          return;
        case 'KeyV':
          st.setTool('select');
          return;
        case 'KeyG':
          st.setTool('glyph');
          return;
        case 'KeyT':
          st.setTool('text');
          return;
        case 'KeyM':
          st.setTool('mark');
          return;
        case 'KeyH':
          st.setTool('hand');
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      className={'app' + (dragging ? ' dropping' : '')}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void handleDroppedFiles(e.dataTransfer.files);
      }}
    >
      <TopBar />
      <div className="workspace">
        <ToolRail />
        <main className="canvas-area">
          <Stage />
          {dragging && <div className="drop-hint">أفلت الملف هنا: مشروع مِداد أو ملف KLX أو صورة</div>}
        </main>
        <SidePanel />
      </div>
      <StatusBar />
      {keyboardOpen && <KeyboardPanel />}
      <Dialogs />
      <Toasts />
    </div>
  );
}
