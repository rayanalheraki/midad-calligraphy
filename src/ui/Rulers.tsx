import type { ReactElement } from 'react';

// Millimetre rulers along the top and the right edge (the start side in RTL).
const STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500];

function pickStep(k: number) {
  return STEPS.find((s) => s * k >= 7) ?? 500;
}

interface Props {
  width: number;
  height: number;
  k: number;
  panX: number;
  panY: number;
  cursor: { x: number; y: number } | null;
}

export const RULER = 20;

export function Rulers({ width, height, k, panX, panY, cursor }: Props) {
  const step = pickStep(k);
  const major = step * (step === 1 || step === 10 || step === 100 ? 10 : 5);
  const ticksX: ReactElement[] = [];
  const x0 = Math.floor(-panX / k / step) * step;
  for (let mm = x0; mm * k + panX < width; mm += step) {
    const sx = mm * k + panX;
    if (sx < 0) continue;
    const isMajor = Math.abs(mm % major) < 1e-6;
    const half = !isMajor && Math.abs(mm % (major / 2)) < 1e-6;
    ticksX.push(
      <g key={mm}>
        <line x1={sx} x2={sx} y1={RULER} y2={RULER - (isMajor ? 12 : half ? 7 : 4)} />
        {isMajor && (
          <text x={sx + 3} y={9} textAnchor="start">
            {mm}
          </text>
        )}
      </g>,
    );
  }
  const ticksY: ReactElement[] = [];
  const y0 = Math.floor(-panY / k / step) * step;
  for (let mm = y0; mm * k + panY < height; mm += step) {
    const sy = mm * k + panY;
    if (sy < RULER) continue;
    const isMajor = Math.abs(mm % major) < 1e-6;
    const half = !isMajor && Math.abs(mm % (major / 2)) < 1e-6;
    ticksY.push(
      <g key={mm}>
        <line x1={0} x2={isMajor ? 12 : half ? 7 : 4} y1={sy} y2={sy} />
        {isMajor && (
          <text x={10} y={sy + 3} transform={`rotate(-90 10 ${sy + 3})`} textAnchor="end">
            {mm}
          </text>
        )}
      </g>,
    );
  }
  return (
    <>
      <svg className="ruler ruler-x" width={width} height={RULER} aria-hidden="true">
        <rect width={width} height={RULER} />
        {ticksX}
        {cursor && <line className="ruler-cursor" x1={cursor.x * k + panX} x2={cursor.x * k + panX} y1={0} y2={RULER} />}
      </svg>
      <svg className="ruler ruler-y" width={RULER} height={height} aria-hidden="true">
        <rect width={RULER} height={height} />
        {ticksY}
        {cursor && <line className="ruler-cursor" x1={0} x2={RULER} y1={cursor.y * k + panY} y2={cursor.y * k + panY} />}
      </svg>
    </>
  );
}
