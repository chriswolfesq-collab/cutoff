/**
 * How fast the scrubber walks through a play.
 *
 * Speeds are a fraction of game speed, which is the tempo the sequence used to
 * run at. A play is far easier to read well under that, so the default is a
 * quarter — slow enough to keep one man in the eye the whole way across the
 * field — and the fastest setting hands game speed back.
 */

/** How long a fielder's move and the phase that holds it take at game speed. */
export const GAME_MOVE_MS = 700;
export const GAME_DWELL_MS = 950;

export const SPEEDS = [
  { id: 0.125, label: '⅛×' },
  { id: 0.25, label: '¼×' },
  { id: 0.5, label: '½×' },
  { id: 1, label: '1×' },
] as const;

export type Speed = (typeof SPEEDS)[number]['id'];

export const DEFAULT_SPEED: Speed = 0.25;

export const isSpeed = (n: number): n is Speed =>
  SPEEDS.some((s) => s.id === n);
