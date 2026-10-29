import { memo } from 'react';
import type { DocObject, MarkObject, Page, StrokesObject, TextObject } from '../model/types';
import { getLoadedFont } from '../engine/fonts';
import { textGeometry } from '../engine/layout';
import { fmt, matrixToSvg, objectMatrix } from '../engine/geom';
import { markGeometry } from '../engine/marks';
import { patternTile } from '../engine/patterns';
import { strokeLine } from '../engine/strokeLetters';
import { localBox } from './bounds';
import { strokeInput } from './strokesInput';
import { paintFor, shadowFilter } from './paint';

export type RenderMode = 'edit' | 'export';

interface ViewProps<T> {
  o: T;
  mode: RenderMode;
  glyphEdit?: boolean;
}

function TextView({ o, mode, glyphEdit }: ViewProps<TextObject>) {
  const lf = getLoadedFont(o.fontId);
  const transform = matrixToSvg(objectMatrix(o));
  if (!lf) {
    if (mode === 'export') return null;
    const b = localBox(o);
    return (
      <g transform={transform} data-oid={o.id}>
        <rect x={b.minX} y={b.minY} width={b.maxX - b.minX} height={b.maxY - b.minY} className="font-loading" />
      </g>
    );
  }
  const geo = textGeometry(o, lf);
  const fill = paintFor(o.id, o.fill, geo.baseBox);
  const shadow = shadowFilter(o.id, o.shadow);
  const baseId = `glyphs-${o.id}`;
  const stroke =
    o.stroke && o.stroke.width > 0
      ? { stroke: o.stroke.color, strokeWidth: fmt(o.stroke.width), strokeLinejoin: 'round' as const, paintOrder: 'stroke' }
      : {};
  return (
    <g transform={transform} opacity={o.opacity < 1 ? o.opacity : undefined} filter={shadow.filter} data-oid={mode === 'edit' ? o.id : undefined}>
      {(fill.defs || shadow.defs) && (
        <defs>
          {fill.defs}
          {shadow.defs}
        </defs>
      )}
      {mode === 'edit' && (
        <rect
          className="hit"
          x={fmt(geo.box.minX)}
          y={fmt(geo.box.minY)}
          width={fmt(geo.box.maxX - geo.box.minX)}
          height={fmt(geo.box.maxY - geo.box.minY)}
          fill="transparent"
        />
      )}
      <g transform={geo.copies.length > 1 ? matrixToSvg(geo.copies[0]) : undefined}>
        <g id={baseId} fill={fill.paint} {...stroke}>
          {geo.glyphs.map((g) =>
            g.hidden && !glyphEdit ? null : (
              <path
                key={g.key}
                d={g.d}
                fill={g.color ?? undefined}
                opacity={g.hidden ? 0.18 : undefined}
                data-gkey={glyphEdit ? g.key : undefined}
              />
            ),
          )}
        </g>
      </g>
      {geo.copies.slice(1).map((c, i) => (
        <use key={i} href={`#${baseId}`} transform={matrixToSvg(c)} />
      ))}
    </g>
  );
}

function MarkView({ o, mode }: ViewProps<MarkObject>) {
  const geo = markGeometry(o);
  const transform = matrixToSvg(objectMatrix(o));
  if (!geo) {
    if (mode === 'export') return null;
    const b = localBox(o);
    return (
      <g transform={transform} data-oid={o.id}>
        <rect x={b.minX} y={b.minY} width={b.maxX - b.minX} height={b.maxY - b.minY} className="font-loading" />
      </g>
    );
  }
  const fill = paintFor(o.id, o.fill, geo.box);
  // Small elements get a slightly larger invisible target so they are easy to pick up.
  const pad = Math.max(0.6, (geo.box.maxX - geo.box.minX) * 0.15);
  return (
    <g transform={transform} opacity={o.opacity < 1 ? o.opacity : undefined} data-oid={mode === 'edit' ? o.id : undefined}>
      {fill.defs && <defs>{fill.defs}</defs>}
      {mode === 'edit' && (
        <rect
          className="hit"
          x={fmt(geo.box.minX - pad)}
          y={fmt(geo.box.minY - pad)}
          width={fmt(geo.box.maxX - geo.box.minX + 2 * pad)}
          height={fmt(geo.box.maxY - geo.box.minY + 2 * pad)}
          fill="transparent"
        />
      )}
      <path d={geo.d} fill={fill.paint} />
    </g>
  );
}

function StrokesView({ o, mode }: ViewProps<StrokesObject>) {
  const line = strokeLine(strokeInput(o));
  const fill = paintFor(o.id, o.fill, line.box);
  const pad = Math.max(0.6, o.size * 0.05);
  const b = line.box;
  return (
    <g transform={matrixToSvg(objectMatrix(o))} opacity={o.opacity < 1 ? o.opacity : undefined} data-oid={mode === 'edit' ? o.id : undefined}>
      {fill.defs && <defs>{fill.defs}</defs>}
      {mode === 'edit' && (
        <rect className="hit" x={fmt(b.minX - pad)} y={fmt(b.minY - pad)} width={fmt(b.maxX - b.minX + 2 * pad)} height={fmt(b.maxY - b.minY + 2 * pad)} fill="transparent" />
      )}
      <path d={line.d} fill={fill.paint} fillRule="nonzero" />
      {mode === 'edit' && o.showSkeleton && (
        <g className="pen-skeleton" pointerEvents="none">
          {line.skeleton.map((pts, i) => (
            <g key={i}>
              <polyline points={pts.map((p) => `${fmt(p[0])},${fmt(p[1])}`).join(' ')} />
              {pts.map((p, j) => (
                <circle key={j} cx={fmt(p[0])} cy={fmt(p[1])} r={fmt(o.size * 0.012)} />
              ))}
            </g>
          ))}
        </g>
      )}
    </g>
  );
}

interface ObjectViewProps {
  o: DocObject;
  mode: RenderMode;
  glyphEdit: boolean;
  fontsVersion: number;
}

export const ObjectView = memo(function ObjectView({ o, mode, glyphEdit }: ObjectViewProps) {
  switch (o.type) {
    case 'text':
      return <TextView o={o} mode={mode} glyphEdit={glyphEdit} />;
    case 'mark':
      return <MarkView o={o} mode={mode} />;
    case 'strokes':
      return <StrokesView o={o} mode={mode} />;
  }
});

/** Gradient vector in objectBoundingBox units; 90° runs top to bottom. */
function bboxGradient(angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180;
  return {
    x1: fmt(0.5 - 0.5 * Math.cos(a)),
    y1: fmt(0.5 - 0.5 * Math.sin(a)),
    x2: fmt(0.5 + 0.5 * Math.cos(a)),
    y2: fmt(0.5 + 0.5 * Math.sin(a)),
  };
}

/** Page colour or gradient, background image, then pattern. `transparent` leaves out the colour and gradient. */
export function PageBackground({ page, transparent }: { page: Page; transparent?: boolean }) {
  const bg = page.background;
  const W = fmt(page.width);
  const H = fmt(page.height);
  const tile = bg.pattern.kind !== 'none' ? patternTile(bg.pattern.kind, bg.pattern.size) : null;
  const clipId = `clip-${page.id}`;
  return (
    <g>
      <defs>
        {bg.gradient && !transparent && (
          <linearGradient id={`bg-${page.id}`} {...bboxGradient(bg.gradient.angle)}>
            <stop offset="0" stopColor={bg.gradient.from} />
            <stop offset="1" stopColor={bg.gradient.to} />
          </linearGradient>
        )}
        {tile && (
          <pattern id={`pat-${page.id}`} patternUnits="userSpaceOnUse" width={fmt(tile.w)} height={fmt(tile.h)}>
            <path
              d={tile.d}
              fill={tile.mode === 'fill' ? bg.pattern.color : 'none'}
              stroke={tile.mode === 'stroke' ? bg.pattern.color : 'none'}
              strokeWidth={fmt(Math.max(0.15, bg.pattern.size * 0.018))}
            />
          </pattern>
        )}
        <clipPath id={clipId}>
          <rect x="0" y="0" width={W} height={H} />
        </clipPath>
      </defs>
      {!transparent && <rect x="0" y="0" width={W} height={H} fill={bg.gradient ? `url(#bg-${page.id})` : bg.color} />}
      {bg.image && (
        <image
          href={bg.image.src}
          x="0"
          y="0"
          width={W}
          height={H}
          opacity={bg.image.opacity < 1 ? bg.image.opacity : undefined}
          clipPath={`url(#${clipId})`}
          preserveAspectRatio={bg.image.fit === 'stretch' ? 'none' : bg.image.fit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice'}
        />
      )}
      {tile && <rect x="0" y="0" width={W} height={H} fill={`url(#pat-${page.id})`} opacity={bg.pattern.opacity} />}
    </g>
  );
}

interface PageContentProps {
  page: Page;
  mode: RenderMode;
  glyphObjectId?: string | null;
  fontsVersion: number;
  /** leave out the page colour and gradient (transparent export) */
  transparent?: boolean;
}

export function PageContent({ page, mode, glyphObjectId, fontsVersion, transparent }: PageContentProps) {
  return (
    <g>
      <PageBackground page={page} transparent={transparent} />
      {page.objects.map((o) =>
        o.hidden ? null : <ObjectView key={o.id} o={o} mode={mode} glyphEdit={glyphObjectId === o.id} fontsVersion={fontsVersion} />,
      )}
    </g>
  );
}
