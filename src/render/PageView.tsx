import { memo } from 'react';
import type { DocObject, ImageObject, InkObject, Page, ShapeObject, TextObject } from '../model/types';
import { getLoadedFont } from '../engine/fonts';
import { textGeometry } from '../engine/layout';
import { fmt, matrixToSvg, objectMatrix } from '../engine/geom';
import { shapeParts } from '../engine/ornaments';
import { patternTile } from '../engine/patterns';
import { localBox } from './bounds';
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

function ShapeView({ o, mode }: ViewProps<ShapeObject>) {
  const parts = shapeParts(o);
  const box = localBox(o);
  const fill = o.fill ? paintFor(o.id, o.fill, box) : null;
  const shadow = shadowFilter(o.id, o.shadow);
  const strokeColor = o.stroke?.color ?? '#1b1e27';
  const strokeWidth = o.stroke ? fmt(o.stroke.width) : undefined;
  const hitWidth = Math.max(3, (o.stroke?.width ?? 0) * 2);
  return (
    <g transform={matrixToSvg(objectMatrix(o))} opacity={o.opacity < 1 ? o.opacity : undefined} filter={shadow.filter} data-oid={mode === 'edit' ? o.id : undefined}>
      {(fill?.defs || shadow.defs) && (
        <defs>
          {fill?.defs}
          {shadow.defs}
        </defs>
      )}
      {parts.map((p, i) => {
        if (p.role === 'solid') return <path key={i} d={p.d} fill={fill?.paint ?? strokeColor} />;
        if (p.role === 'outline')
          return <path key={i} d={p.d} fill="none" stroke={strokeColor} strokeWidth={strokeWidth ?? fmt(0.4)} strokeLinejoin="round" />;
        return (
          <path
            key={i}
            d={p.d}
            fill={fill?.paint ?? 'none'}
            fillRule="nonzero"
            stroke={o.stroke ? strokeColor : 'none'}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
        );
      })}
      {mode === 'edit' &&
        parts.map((p, i) => <path key={'hit' + i} d={p.d} fill="none" stroke="transparent" strokeWidth={hitWidth} pointerEvents="stroke" />)}
    </g>
  );
}

function ImageView({ o, mode }: ViewProps<ImageObject>) {
  return (
    <g transform={matrixToSvg(objectMatrix(o))} opacity={o.opacity < 1 ? o.opacity : undefined} data-oid={mode === 'edit' ? o.id : undefined}>
      <image href={o.src} x={fmt(-o.w / 2)} y={fmt(-o.h / 2)} width={fmt(o.w)} height={fmt(o.h)} preserveAspectRatio="none" />
    </g>
  );
}

function InkView({ o, mode }: ViewProps<InkObject>) {
  return (
    <g transform={matrixToSvg(objectMatrix(o))} opacity={o.opacity < 1 ? o.opacity : undefined} data-oid={mode === 'edit' ? o.id : undefined}>
      <path d={o.d} fill={o.color} />
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
    case 'shape':
      return <ShapeView o={o} mode={mode} />;
    case 'image':
      return <ImageView o={o} mode={mode} />;
    case 'ink':
      return <InkView o={o} mode={mode} />;
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

export function PageBackground({ page }: { page: Page }) {
  const bg = page.background;
  const W = fmt(page.width);
  const H = fmt(page.height);
  const tile = bg.pattern.kind !== 'none' ? patternTile(bg.pattern.kind, bg.pattern.size) : null;
  const clipId = `clip-${page.id}`;
  return (
    <g>
      <defs>
        {bg.gradient && (
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
      <rect x="0" y="0" width={W} height={H} fill={bg.gradient ? `url(#bg-${page.id})` : bg.color} />
      {bg.image && (
        <image
          href={bg.image.src}
          x="0"
          y="0"
          width={W}
          height={H}
          opacity={bg.image.opacity}
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
}

export function PageContent({ page, mode, glyphObjectId, fontsVersion }: PageContentProps) {
  return (
    <g>
      <PageBackground page={page} />
      {page.objects.map((o) =>
        o.hidden ? null : <ObjectView key={o.id} o={o} mode={mode} glyphEdit={glyphObjectId === o.id} fontsVersion={fontsVersion} />,
      )}
    </g>
  );
}
