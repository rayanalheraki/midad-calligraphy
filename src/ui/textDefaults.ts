import type { TextObject } from '../model/types';

/** Style applied to new lines: the last font, size and colour the user picked. */
export const lastTextStyle: Partial<TextObject> = {
  fontId: 'amiri',
  size: 18,
  fill: { kind: 'solid', color: '#1b1e27' },
};

export function rememberTextStyle(patch: Partial<Pick<TextObject, 'fontId' | 'size' | 'fill'>>): void {
  Object.assign(lastTextStyle, patch);
}

/** Caret of the text field being edited, so palettes and the on-screen keyboard insert at the right spot. */
export const textCaret = { objectId: '', start: -1, end: -1 };
