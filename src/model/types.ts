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

/** Manual adjustment of one glyph (letter, dot group or diacritic), like Kelk's per-letter editing. */
export interface GlyphOverride {
  dx: number;
  dy: number;
  rotate: number;
  scale: number;
  color: string | null;
  hidden: boolean;
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

/** Rotational repetition of a baseline, from Kelk's lrepeatcount/lrepeatangle. */
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

export type ShapeKind =
  | 'frame'
  | 'doubleFrame'
  | 'ornateFrame'
  | 'roundFrame'
  | 'arch'
  | 'circle'
  | 'medallion'
  | 'rosette'
  | 'star'
  | 'khatam'
  | 'divider'
  | 'rhombus';

export interface ShapeObject extends BaseObject {
  type: 'shape';
  kind: ShapeKind;
  w: number;
  h: number;
  /** petals / points for rosette and star */
  points: number;
  /** inner radius ratio for star, ornament density for frames */
  inner: number;
  fill: Fill | null;
  stroke: StrokeStyle | null;
  shadow: Shadow | null;
}

export interface ImageObject extends BaseObject {
  type: 'image';
  /** data:image/png|jpeg|webp;base64,... only */
  src: string;
  w: number;
  h: number;
}

/** A reed-pen (qalam) stroke drawn by hand. Path data is in local mm coordinates. */
export interface InkObject extends BaseObject {
  type: 'ink';
  d: string;
  color: string;
}

export type DocObject = TextObject | ShapeObject | ImageObject | InkObject;
export type ObjectType = DocObject['type'];

export type PatternKind = 'none' | 'dots' | 'grid' | 'diagonal' | 'stars8' | 'hexagons' | 'circles' | 'lattice';

export interface Background {
  color: string;
  gradient: { from: string; to: string; angle: number } | null;
  pattern: { kind: PatternKind; color: string; size: number; opacity: number };
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

export interface KelkDoc {
  format: 'kelk-web';
  version: 1;
  title: string;
  pages: Page[];
  meta: { created: string; modified: string };
}
