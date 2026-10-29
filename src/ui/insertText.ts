import type { Draft } from 'immer';
import type { TextObject } from '../model/types';
import { applyTextEdit } from '../model/textEdit';
import { useEditor } from '../store/editor';
import { textCaret } from './textDefaults';

/** Inserts `str` at the caret of the selected line (null deletes one character backwards). */
export function insertIntoText(str: string | null): void {
  const st = useEditor.getState();
  const page = st.doc.pages[st.pageIndex];
  const obj = page.objects.find((o) => o.id === st.selection[0]);
  if (!obj || obj.type !== 'text') {
    st.toast('حدّد سطرًا خطيًا أولًا، ثم أدخل الحروف.', 'info');
    return;
  }
  const text = obj.text;
  const known = textCaret.objectId === obj.id && textCaret.start >= 0;
  const start = Math.min(text.length, known ? textCaret.start : text.length);
  const end = Math.min(text.length, Math.max(start, known ? textCaret.end : start));
  let next: string;
  let caret: number;
  if (str === null) {
    if (start === end && start > 0) {
      next = text.slice(0, start - 1) + text.slice(end);
      caret = start - 1;
    } else {
      next = text.slice(0, start) + text.slice(end);
      caret = start;
    }
  } else {
    next = text.slice(0, start) + str + text.slice(end);
    caret = start + str.length;
  }
  st.updateObject(obj.id, (o) => applyTextEdit(o as Draft<TextObject>, next));
  textCaret.objectId = obj.id;
  textCaret.start = textCaret.end = caret;
  window.dispatchEvent(new CustomEvent('kelk:caret'));
}
