import {
  FIELD_CONFIGS,
  bases,
  fenceCurve,
  fencePoint,
  infieldArc,
  moundCenter,
  FOUL_ANGLE,
  type Level,
  type Point,
} from '../field/geometry';
import { alignment, POSITIONS, POSITION_NUMBERS, type Posture } from '../field/alignments';

/** Feet -> SVG user units. Only the y-axis flips; 1 unit stays 1 foot. */
const toScreen = (p: Point): Point => ({ x: p.x, y: -p.y });

const path = (pts: Point[], close = false) =>
  pts.map(toScreen).map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ') +
  (close ? ' Z' : '');

/**
 * Bases are drawn well oversized — a real base is 15" across, which is a
 * couple of pixels at field scale. This is a diagram, so legibility wins.
 */
function Base({ at, size }: { at: Point; size: number }) {
  const s = toScreen(at);
  return (
    <rect
      x={s.x - size / 2}
      y={s.y - size / 2}
      width={size}
      height={size}
      className="base"
      transform={`rotate(45 ${s.x} ${s.y})`}
    />
  );
}

export default function Field({
  level,
  posture = 'normal',
}: {
  level: Level;
  posture?: Posture;
}) {
  const cfg = FIELD_CONFIGS[level];
  const b = bases(cfg);
  const mound = moundCenter(cfg);
  const spots = alignment(level, posture);

  const poleL = fencePoint(cfg, -FOUL_ANGLE);
  const poleR = fencePoint(cfg, FOUL_ANGLE);
  const fence = fenceCurve(cfg);
  const arc = infieldArc(cfg);

  // Fair territory: up the left line, around the fence, back down the right line.
  const fairPath = path([b.home, poleL, ...fence, poleR], true);
  const dirtPath = path([...arc, b.home], true);

  const pad = 30;
  const maxX = cfg.fence.line * Math.SQRT1_2 + pad;
  const maxY = cfg.fence.center + pad;
  const viewBox = `${-maxX} ${-maxY} ${2 * maxX} ${maxY + 60}`;

  const m = toScreen(mound);
  // Scale-independent sizing, so youth and adult fields read identically.
  const unit = cfg.baseDistance / 90;
  const baseSize = 7 * unit;
  const r = 9 * unit;

  return (
    <svg className="field" viewBox={viewBox} role="img" aria-label={`${level} field`}>
      <defs>
        <clipPath id="fair-territory">
          <path d={fairPath} />
        </clipPath>
      </defs>

      <path d={fairPath} className="grass" />

      {/* Dirt is clipped to fair territory so it can't spill over the lines. */}
      <g clipPath="url(#fair-territory)">
        <path d={dirtPath} className="dirt" />
        <circle cx={m.x} cy={m.y} r={cfg.moundRadius} className="dirt-light" />
      </g>

      {/* The infield is all dirt, so the diamond needs an outline to read. */}
      <path d={path([b.home, b.first, b.second, b.third], true)} className="diamond" />

      <path d={path([b.home, poleL])} className="foul-line" />
      <path d={path([b.home, poleR])} className="foul-line" />
      <path d={path(fence)} className="fence" />

      <Base at={b.first} size={baseSize} />
      <Base at={b.second} size={baseSize} />
      <Base at={b.third} size={baseSize} />
      <circle cx={0} cy={0} r={baseSize * 0.55} className="base" />

      {POSITIONS.map((pos) => {
        const s = toScreen(spots[pos]);
        return (
          <g key={pos} className="fielder">
            <circle cx={s.x} cy={s.y} r={r} />
            <text x={s.x} y={s.y} dy={r * 0.36} fontSize={r * 1.05}>
              {POSITION_NUMBERS[pos]}
            </text>
            <text x={s.x} y={s.y - r * 1.45} fontSize={r * 0.9} className="fielder-label">
              {pos}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
