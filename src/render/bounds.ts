import type { DocObject } from '../model/types';
import { getLoadedFont } from '../engine/fonts';
import { textGeometry } from '../engine/layout';
import { addPoint, emptyRect, isEmptyRect, objectMatrix, transformRect, type Rect } from '../engine/geom';

const inkBoxes = new WeakMap<object, Rect>();

function pathBox(d: string): Rect {
  const r = emptyRect();
  const re = /(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) addPoint(r, Number(m[1]), Number(m[2]));
  return isEmptyRect(r) ? { minX: -1, minY: -1, maxX: 1, maxY: 1 } : r;
}

/** Bounds of an object in its own (untransformed) coordinates. */
export function localBox(o: DocObject): Rect {
  switch (o.type) {
    case 'text': {
      const lf = getLoadedFont(o.fontId);
      if (lf) return textGeometry(o, lf).box;
      const w = Math.max(o.size * 2, o.text.length * o.size * 0.45);
      return { minX: -w / 2, minY: -o.size * 0.9, maxX: w / 2, maxY: o.size * 0.4 };
    }
    case 'shape':
    case 'image':
      return { minX: -o.w / 2, minY: -o.h / 2, maxX: o.w / 2, maxY: o.h / 2 };
    case 'ink': {
      let b = inkBoxes.get(o);
      if (!b) inkBoxes.set(o, (b = pathBox(o.d)));
      return b;
    }
  }
}

/** Axis-aligned bounds in page coordinates. */
export function worldBox(o: DocObject): Rect {
  return transformRect(objectMatrix(o), localBox(o));
}
