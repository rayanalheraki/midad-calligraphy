import type { DocObject } from '../model/types';
import { getLoadedFont } from '../engine/fonts';
import { textGeometry } from '../engine/layout';
import { markGeometry } from '../engine/marks';
import { strokeLine } from '../engine/strokeLetters';
import { strokeInput } from './strokesInput';
import { objectMatrix, transformRect, type Rect } from '../engine/geom';

/** Bounds of an object in its own (untransformed) coordinates. */
export function localBox(o: DocObject): Rect {
  switch (o.type) {
    case 'text': {
      const lf = getLoadedFont(o.fontId);
      if (lf) return textGeometry(o, lf).box;
      const w = Math.max(o.size * 2, o.text.length * o.size * 0.45);
      return { minX: -w / 2, minY: -o.size * 0.9, maxX: w / 2, maxY: o.size * 0.4 };
    }
    case 'strokes':
      return strokeLine(strokeInput(o)).box;
    case 'mark': {
      const geo = markGeometry(o);
      if (geo) return geo.box;
      const r = o.size * 0.15;
      return { minX: -r, minY: -r, maxX: r, maxY: r };
    }
  }
}

/** Axis-aligned bounds in page coordinates. */
export function worldBox(o: DocObject): Rect {
  return transformRect(objectMatrix(o), localBox(o));
}
