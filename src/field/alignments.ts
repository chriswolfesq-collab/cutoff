/**
 * Default starting positions, in feet (see geometry.ts for the frame).
 *
 * Only the `normal` posture is filled in — the other postures exist so the
 * shape of the table is settled before the rules engine starts writing to it.
 */

import type { Level, Point } from './geometry';

export const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'] as const;
export type Position = (typeof POSITIONS)[number];

export const POSITION_NAMES: Record<Position, string> = {
  P: 'Pitcher',
  C: 'Catcher',
  '1B': 'First base',
  '2B': 'Second base',
  '3B': 'Third base',
  SS: 'Shortstop',
  LF: 'Left field',
  CF: 'Center field',
  RF: 'Right field',
};

/** Scorebook numbering, handy for labels and for parsing "6-4-3". */
export const POSITION_NUMBERS: Record<Position, number> = {
  P: 1, C: 2, '1B': 3, '2B': 4, '3B': 5, SS: 6, LF: 7, CF: 8, RF: 9,
};

export type Posture =
  | 'normal'
  | 'doublePlay'
  | 'infieldIn'
  | 'cornersIn'
  | 'noDoubles'
  | 'guardLines';

export const POSTURE_NAMES: Record<Posture, string> = {
  normal: 'Normal',
  doublePlay: 'Double-play depth',
  infieldIn: 'Infield in',
  cornersIn: 'Corners in (bunt)',
  noDoubles: 'No doubles',
  guardLines: 'Guard the lines',
};

export type Alignment = Record<Position, Point>;

const NORMAL: Record<Level, Alignment> = {
  youth: {
    P: { x: 0, y: 46 },
    C: { x: 0, y: -6 },
    '1B': { x: 38, y: 58 },
    '2B': { x: 22, y: 90 },
    SS: { x: -25, y: 89 },
    '3B': { x: -39, y: 57 },
    LF: { x: -88, y: 138 },
    CF: { x: 0, y: 175 },
    RF: { x: 88, y: 138 },
  },
  adult: {
    P: { x: 0, y: 60.5 },
    C: { x: 0, y: -7 },
    '1B': { x: 57, y: 87 },
    '2B': { x: 33, y: 135 },
    SS: { x: -38, y: 133 },
    '3B': { x: -58, y: 85 },
    LF: { x: -160, y: 250 },
    CF: { x: 0, y: 315 },
    RF: { x: 160, y: 250 },
  },
};

/**
 * Postures are stored as deltas from normal, in feet at adult scale, rather
 * than as full position tables. Six postures x two levels x nine fielders is a
 * lot of coordinates to keep honest; a delta says what actually changes.
 *
 * Positive x is toward first base, positive y is toward center field, so a
 * negative y is a step in toward the plate.
 */
type Shift = Partial<Record<Position, Point>>;

const SHIFTS: Record<Exclude<Posture, 'normal'>, Shift> = {
  // Middle infielders cheat toward second and a step in, to turn two.
  doublePlay: {
    '2B': { x: -9, y: -7 },
    SS: { x: 9, y: -7 },
  },
  // Everyone at the edge of the dirt: cut the run off at the plate.
  infieldIn: {
    '1B': { x: -3, y: -20 },
    '2B': { x: -2, y: -30 },
    SS: { x: 2, y: -30 },
    '3B': { x: 3, y: -20 },
  },
  // Corners charge the bunt; the middle infielders cover behind them.
  cornersIn: {
    '1B': { x: -5, y: -27 },
    '3B': { x: 5, y: -27 },
    '2B': { x: -6, y: -6 },
    SS: { x: 4, y: -6 },
  },
  // Deeper and toward the lines — concede the single, take away the double.
  noDoubles: {
    LF: { x: -18, y: 20 },
    CF: { x: 0, y: 18 },
    RF: { x: 18, y: 20 },
  },
  // Corners hug the lines so nothing gets by them for extra bases.
  guardLines: {
    '1B': { x: 9, y: -3 },
    '3B': { x: -9, y: -3 },
  },
};

export function alignment(level: Level, posture: Posture = 'normal'): Alignment {
  const base = NORMAL[level];
  if (posture === 'normal') return base;

  // Deltas are authored at adult scale; a 60' field shifts proportionally less.
  const u = level === 'youth' ? 60 / 90 : 1;
  const shift = SHIFTS[posture];

  return Object.fromEntries(
    POSITIONS.map((pos) => {
      const d = shift[pos];
      const p = base[pos];
      return [pos, d ? { x: p.x + d.x * u, y: p.y + d.y * u } : p];
    }),
  ) as Alignment;
}
