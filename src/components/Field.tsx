import type React from 'react';
import {
  FIELD_CONFIGS,
  bases,
  dist,
  fenceCurve,
  fencePoint,
  infieldArc,
  moundCenter,
  FOUL_ANGLE,
  type Level,
  type Point,
} from '../field/geometry';
import { alignment, POSITIONS, POSITION_NUMBERS, type Position, type Posture } from '../field/alignments';
import type { PlayPhase, ResolvedPlay } from '../field/assignment';
import { ROLE_CLASS } from './roleStyles';
import ZoneOverlay from './ZoneOverlay';

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
  showZones = false,
  pick,
  play,
  phase,
  highlight,
  onPick,
  onHighlight,
  onAnswer,
}: {
  level: Level;
  posture?: Posture;
  showZones?: boolean;
  pick?: Point | null;
  play?: ResolvedPlay | null;
  phase?: PlayPhase | null;
  highlight?: Position | null;
  onPick?: (p: Point) => void;
  onHighlight?: (p: Position | null) => void;
  /** Drill mode: clicking a fielder answers the question instead of hovering. */
  onAnswer?: (p: Position) => void;
}) {
  const cfg = FIELD_CONFIGS[level];
  const b = bases(cfg);
  const mound = moundCenter(cfg);
  const start = alignment(level, posture);

  const poleL = fencePoint(cfg, -FOUL_ANGLE);
  const poleR = fencePoint(cfg, FOUL_ANGLE);
  const fence = fenceCurve(cfg);
  const arc = infieldArc(cfg);

  const fairPath = path([b.home, poleL, ...fence, poleR], true);
  const dirtPath = path([...arc, b.home], true);

  const pad = 30;
  const maxX = cfg.fence.line * Math.SQRT1_2 + pad;
  const maxY = cfg.fence.center + pad;
  const viewBox = `${-maxX} ${-maxY} ${2 * maxX} ${maxY + 60}`;

  const m = toScreen(mound);
  const unit = cfg.baseDistance / 90;
  const baseSize = 7 * unit;
  const r = 9 * unit;

  const byPosition = new Map(play?.assignments.map((a) => [a.position, a]));
  // At the set nothing has happened yet, so everyone is still where they lined
  // up — the movement only reads as movement if there is a before.
  const atSet = (phase?.index ?? 1) === 0;

  // Screen pixels -> viewBox units -> field feet. The viewBox is already in
  // feet, so the only correction is the y flip.
  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onPick) return;
    const svg = e.currentTarget;
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const loc = p.matrixTransform(ctm.inverse());
    onPick({ x: loc.x, y: -loc.y });
  };

  return (
    <svg
      className={`field${onPick ? ' pickable' : ''}`}
      viewBox={viewBox}
      role={onPick ? undefined : 'img'}
      aria-label={`${level} field`}
      onClick={handleClick}
    >
      <defs>
        <clipPath id="fair-territory">
          <path d={fairPath} />
        </clipPath>
        <marker
          id="throw-head"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" fill="var(--throw)" />
        </marker>
      </defs>

      <path d={fairPath} className="grass" />

      <g clipPath="url(#fair-territory)">
        <path d={dirtPath} className="dirt" />
        <circle cx={m.x} cy={m.y} r={cfg.moundRadius} className="dirt-light" />
      </g>

      <path d={path([b.home, b.first, b.second, b.third], true)} className="diamond" />
      <path d={path([b.home, poleL])} className="foul-line" />
      <path d={path([b.home, poleR])} className="foul-line" />
      <path d={path(fence)} className="fence" />

      {showZones && <ZoneOverlay level={level} />}

      <Base at={b.first} size={baseSize} />
      <Base at={b.second} size={baseSize} />
      <Base at={b.third} size={baseSize} />
      <circle cx={0} cy={0} r={baseSize * 0.55} className="base" />

      {/* Where the ball crossed, if that is not where it gets fielded. */}
      {play && pick && !atSet && dist(pick, play.ballAt) > 4 * unit && (
        <path d={path([pick, play.ballAt])} className="ball-path" />
      )}

      {/* Routes: where each fielder is coming from. */}
      {play &&
        !atSet &&
        play.assignments.map((a) => {
          const from = start[a.position];
          if (dist(from, a.target) < 6 * unit) return null;
          return (
            <path
              key={`route-${a.position}`}
              d={path([from, a.target])}
              className={`route ${ROLE_CLASS[a.role.kind]}${highlight === a.position ? ' hot' : ''}`}
            />
          );
        })}

      {/* Only the throw actually in the air right now. */}
      {phase?.activeThrow &&
        (() => {
          const t = phase.activeThrow;
          const from = byPosition.get(t.from)?.target;
          if (!from) return null;
          return (
            <path d={path([from, b[t.to]])} className="throw" markerEnd="url(#throw-head)" />
          );
        })()}

      {pick && (
        <g className="pick" pointerEvents="none">
          <circle cx={pick.x} cy={-pick.y} r={r * 0.85} className="pick-ring" />
          <circle cx={pick.x} cy={-pick.y} r={r * 0.3} className="pick-dot" />
        </g>
      )}

      {/* Where a fielder goes instead if the throw is read the other way.
          Hollow and dashed: this is a job he may not end up with. */}
      {play &&
        !atSet &&
        play.assignments
          .filter((a) => a.alternative)
          .map((a) => {
            const alt = a.alternative!;
            const to = toScreen(alt.target);
            return (
              <g key={`alt-${a.position}`} className={`alt ${ROLE_CLASS[alt.role.kind]}`} pointerEvents="none">
                <path d={path([a.target, alt.target])} />
                <circle cx={to.x} cy={to.y} r={r} />
                <text x={to.x} y={to.y} dy={r * 0.36} fontSize={r * 1.05}>
                  {POSITION_NUMBERS[a.position]}
                </text>
              </g>
            );
          })}

      {/* Positions live on a transform so the browser can tween them. */}
      {POSITIONS.map((pos) => {
        const a = byPosition.get(pos);
        const at = a && !atSet ? a.target : start[pos];
        const s = toScreen(at);
        const cls = a && !atSet ? ROLE_CLASS[a.role.kind] : '';
        return (
          <g
            key={pos}
            className={`fielder ${cls}${highlight === pos ? ' hot' : ''}${onAnswer ? ' answerable' : ''}`}
            transform={`translate(${s.x.toFixed(2)} ${s.y.toFixed(2)})`}
            onMouseEnter={() => onHighlight?.(pos)}
            onMouseLeave={() => onHighlight?.(null)}
            onClick={() => onAnswer?.(pos)}
          >
            <circle cx={0} cy={0} r={r} />
            <text x={0} y={0} dy={r * 0.36} fontSize={r * 1.05}>
              {POSITION_NUMBERS[pos]}
            </text>
            <text x={0} y={-r * 1.45} fontSize={r * 0.9} className="fielder-label">
              {pos}
            </text>
          </g>
        );
      })}

      {phase && (
        <g className="runners" pointerEvents="none">
          {phase.runners.map((rn) => {
            const at = toScreen(rn.at);
            return (
              <circle
                key={rn.id}
                className={`runner${rn.moving ? ' moving' : ''}`}
                r={r * 0.55}
                transform={`translate(${at.x.toFixed(2)} ${at.y.toFixed(2)})`}
              />
            );
          })}
        </g>
      )}
    </svg>
  );
}
