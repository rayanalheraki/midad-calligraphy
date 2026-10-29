import type { StrokesObject } from '../model/types';
import type { StrokeLineInput } from '../engine/strokeLetters';

const inputs = new WeakMap<StrokesObject, StrokeLineInput>();

/** Layout input of a pen line; kept per object so the layout cache hits while it is unchanged. */
export function strokeInput(o: StrokesObject): StrokeLineInput {
  let v = inputs.get(o);
  if (!v) {
    v = { text: o.text, size: o.size, nib: { width: o.nibWidth * 1000, angle: o.nibAngle }, madd: o.madd, kashida: o.kashida };
    inputs.set(o, v);
  }
  return v;
}
