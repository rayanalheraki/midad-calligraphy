// Document model. All lengths are millimetres in page space (y grows downward).

export type Fill =
  | { kind: 'solid'; color: string }
  | { kind: 'linear'; from: string; to: string; angle: number }
  | { kind: 'gold' }
  | { kind: 'silver' };

export interface StrokeStyle {
  color: string;
  width: number;
}

export interface Shadow {
  color: string;
  blur: number;
  dx: number;
  dy: number;
}

export interface Transform {
  x: number;
  y: number;
  rotation: number; // degrees, clockwise on screen
  scaleX: number;
  scaleY: number;
}

interface BaseObject extends Transform {
  id: string;
  name: string;
  opacity: number;
  locked: boolean;
  hidden: boolean;
}

/** Manual adjustment of one glyph (letter, dot group or diacritic), edited by hand. */
export interface GlyphOverride {
  dx: number;
  dy: number;
  rotate: number;
  scale: number;
  color: string | null;
  hidden: boolean;
  /** alternate form chosen from the font, by glyph name (null: the shaped form) */
  alt: string | null;
  /** lengthening (مدّ) of the letter, in ems */
  stretch: number;
  /** depth of the lengthened stroke's dip (تقعير), in percent of the standard one; null: the style's default */
  dip: number | null;
}

export type TextPathMode = 'straight' | 'arc' | 'circle' | 'wave';

export interface TextPath {
  mode: TextPathMode;
  /** arc radius in mm (arc mode) */
  radius: number;
  /** degrees of a circle the text occupies (circle mode) */
  sweep: number;
  /** wave amplitude and wavelength in mm */
  amplitude: number;
  wavelength: number;
  /** curve the other way (bowl instead of dome) */
  flip: boolean;
}

/** Rotational repetition of a baseline around a centre point. */
export interface Repeat {
  count: number;
  angle: number;
  /** distance (mm) of the rotation centre below the baseline centre */
  offset: number;
}

export type MirrorMode = 'none' | 'x' | 'y';

export interface TextObject extends BaseObject {
  type: 'text';
  text: string;
  fontId: string;
  /** em size in mm */
  size: number;
  /** extra space (mm) added at every space character */
  wordSpacing: number;
  /** number of kashida (tatweel) characters added per word */
  kashida: number;
  /** manual kashida after a given letter (key: UTF-16 index of the letter in `text`) */
  kashidaAt: Record<string, number>;
  /** when > 0, kashida is added until the line reaches this width (mm) */
  justifyWidth: number;
  /** enabled OpenType stylistic features, e.g. ["ss01"] */
  features: string[];
  /**
   * Alternate shaping chosen for a connected segment (key: UTF-16 index of its first letter),
   * as feature settings such as ["ss01"], ["-liga"] or ["salt=2"].
   */
  segVariants: Record<string, string[]>;
  path: TextPath;
  repeat: Repeat;
  mirror: MirrorMode;
  mirrorGap: number;
  fill: Fill;
  stroke: StrokeStyle | null;
  shadow: Shadow | null;
  hideMarks: boolean;
  markColor: string | null;
  glyphs: Record<string, GlyphOverride>;
}

/** How a standalone element is drawn: font glyphs, or a cluster of rhombic pen dots. */
export type MarkShape = 'glyph' | 'dot1' | 'dot2h' | 'dot2v' | 'dot3' | 'dot3i';

/**
 * A diacritic, dot group or sign placed on the page as its own object, separate from
 * any line of text. It may be attached to a line so it follows it when the line moves.
 */
export interface MarkObject extends BaseObject {
  type: 'mark';
  /** catalogue id of the element (for its label) */
  element: string;
  shape: MarkShape;
  /** characters drawn when shape is "glyph" */
  text: string;
  fontId: string;
  /** em size in mm, the same unit as a line's size */
  size: number;
  fill: Fill;
  /** line this element belongs to, or null */
  ownerId: string | null;
}

/**
 * A line drawn letter by letter with a broad-nib pen (prototype): letters are centre-line
 * strokes swept by a nib, so they can be lengthened and joined by connector strokes.
 */
export interface StrokesObject extends BaseObject {
  type: 'strokes';
  text: string;
  /** em size in mm */
  size: number;
  /** nib width as a fraction of the em */
  nibWidth: number;
  /** nib angle from the baseline, degrees */
  nibAngle: number;
  /** lengthening of a letter (key: UTF-16 index), 0..1 of its range */
  madd: Record<string, number>;
  /** connector length after a letter (key: UTF-16 index), in ems */
  kashida: Record<string, number>;
  fill: Fill;
  /** show the centre lines while editing */
  showSkeleton: boolean;
}

export type DocObject = TextObject | MarkObject | StrokesObject;
export type ObjectType = DocObject['type'];

export type PatternKind = 'none' | 'dots' | 'grid' | 'diagonal' | 'stars8' | 'hexagons' | 'circles' | 'lattice';

export interface Background {
  color: string;
  gradient: { from: string; to: string; angle: number } | null;
  pattern: { kind: PatternKind; color: string; size: number; opacity: number };
  /** src: data:image/png|jpeg|webp|gif;base64,... only */
  image: { src: string; fit: 'cover' | 'contain' | 'stretch'; opacity: number } | null;
}

export interface Page {
  id: string;
  name: string;
  width: number;
  height: number;
  background: Background;
  objects: DocObject[];
}

export interface MidadDoc {
  format: 'midad';
  version: 1;
  title: string;
  pages: Page[];
  meta: { created: string; modified: string };
}
