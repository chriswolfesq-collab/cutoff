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

export function alignment(level: Level, posture: Posture = 'normal'): Alignment {
  if (posture !== 'normal') {
    // Postures land in phase 2 with the rules engine; until then every
    // posture renders as normal rather than as a wrong guess.
    return NORMAL[level];
  }
  return NORMAL[level];
}
