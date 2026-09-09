/**
 * The whole scenario in the address bar, so a play can be sent to somebody.
 *
 * Everything is validated on the way back in — a hand-edited or truncated link
 * falls back to defaults rather than putting the app in a state the engine was
 * never asked about.
 */

import type { Level } from './field/geometry';
import type { Point } from './field/geometry';
import { POSTURE_NAMES, type Posture } from './field/alignments';
import { DEFAULT_SPEED, isSpeed, type Speed } from './playback';
import {
  BALL_TYPES,
  DEFAULT_SITUATION,
  OUTCOMES,
  type BallType,
  type Outcome,
  type Outs,
  type Situation,
} from './field/play';

export type UrlState = {
  situation: Situation;
  ball: BallType;
  at: Point | null;
  outcome: Outcome | null;
  /** Playback tempo, so a link opens at the speed it was watched at. */
  speed: Speed;
};

export const DEFAULT_URL_STATE: UrlState = {
  situation: DEFAULT_SITUATION,
  ball: 'ground',
  at: null,
  outcome: null,
  speed: DEFAULT_SPEED,
};

const runnerBits = (s: Situation) =>
  (s.runners.first ? 1 : 0) + (s.runners.second ? 2 : 0) + (s.runners.third ? 4 : 0);

export function encode(state: UrlState): string {
  const { situation: s } = state;
  const p = new URLSearchParams();
  p.set('lvl', s.level);
  p.set('r', String(runnerBits(s)));
  p.set('o', String(s.outs));
  p.set('d', s.posture);
  p.set('bh', s.batterHand);
  p.set('b', state.ball);
  if (state.at) {
    p.set('x', state.at.x.toFixed(1));
    p.set('y', state.at.y.toFixed(1));
  }
  if (state.outcome) p.set('res', state.outcome);
  p.set('sp', String(state.speed));
  return p.toString();
}

const oneOf = <T extends string>(value: string | null, allowed: readonly T[]): T | null =>
  value && (allowed as readonly string[]).includes(value) ? (value as T) : null;

export function decode(search: string): UrlState {
  const p = new URLSearchParams(search.replace(/^[?#]/, ''));
  if ([...p.keys()].length === 0) return DEFAULT_URL_STATE;

  const bits = Number(p.get('r'));
  const outs = Number(p.get('o'));
  const x = Number(p.get('x'));
  const y = Number(p.get('y'));
  const hasPoint = p.has('x') && p.has('y') && Number.isFinite(x) && Number.isFinite(y);
  const speed = Number(p.get('sp'));

  const situation: Situation = {
    level: oneOf<Level>(p.get('lvl'), ['youth', 'adult']) ?? DEFAULT_SITUATION.level,
    runners: Number.isInteger(bits) && bits >= 0 && bits <= 7
      ? { first: !!(bits & 1), second: !!(bits & 2), third: !!(bits & 4) }
      : DEFAULT_SITUATION.runners,
    outs: [0, 1, 2].includes(outs) ? (outs as Outs) : DEFAULT_SITUATION.outs,
    posture:
      oneOf<Posture>(p.get('d'), Object.keys(POSTURE_NAMES) as Posture[]) ??
      DEFAULT_SITUATION.posture,
    batterHand: oneOf<'L' | 'R'>(p.get('bh'), ['L', 'R']) ?? DEFAULT_SITUATION.batterHand,
  };

  return {
    situation,
    ball: oneOf<BallType>(p.get('b'), BALL_TYPES) ?? 'ground',
    // A location outside any plausible park is a corrupt link, not a play.
    at: hasPoint && Math.hypot(x, y) < 600 ? { x, y } : null,
    outcome: oneOf<Outcome>(p.get('res'), OUTCOMES),
    // A tempo the control cannot select is a corrupt link, not a preference.
    speed: isSpeed(speed) ? speed : DEFAULT_SPEED,
  };
}
