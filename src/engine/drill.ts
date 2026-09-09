/**
 * Drill mode: generate a situation, ask who has one of the jobs on it.
 *
 * The questions come out of a resolved play rather than a question bank, so a
 * drill can never disagree with the diagram beside it. When a rule changes, the
 * drills change with it.
 *
 * Locations are curated rather than uniformly random. A random point on the
 * field mostly produces balls nobody would think twice about; the spots below
 * are the ones where the answer is worth knowing.
 */

import { FIELD_CONFIGS, fenceRadius, type Level, type Point } from '../field/geometry';
import { POSITION_NAMES, type Position, type Posture } from '../field/alignments';
import { classify } from '../field/zones';
import { roleKey, type ResolvedPlay } from '../field/assignment';
import {
  isPlausible,
  validOutcomes,
  type BallType,
  type Outs,
  type PlayInput,
  type Runners,
  type Situation,
} from '../field/play';
import { resolvePlay } from './resolve';

const RAD = Math.PI / 180;

/** Small seeded generator, so a drill sequence can be reproduced in a test. */
export function rngFrom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(items: readonly T[], rng: () => number): T =>
  items[Math.floor(rng() * items.length) % items.length];

type SpotSpec =
  | { kind: 'infield'; theta: number; r: number; balls: BallType[] }
  | { kind: 'outfield'; theta: number; depth: number; balls: BallType[] };

/** Angles that put the ball at a fielder, in a hole, or down a line. */
const SPOTS: SpotSpec[] = [
  // Bunts and dribblers.
  { kind: 'infield', theta: -38, r: 30, balls: ['bunt', 'ground'] },
  { kind: 'infield', theta: 0, r: 32, balls: ['bunt', 'ground'] },
  { kind: 'infield', theta: 36, r: 30, balls: ['bunt', 'ground'] },
  // Normal infield depth, one per sector worth asking about.
  ...[-42, -34, -25, -16, -5, 4, 14, 23, 33, 42].map((theta) => ({
    kind: 'infield' as const, theta, r: 120, balls: ['ground', 'line', 'popup'] as BallType[],
  })),
  // Outfield, from bloops to balls off the wall.
  ...[-41, -31, -16, 0, 16, 31, 41].flatMap((theta) =>
    [0.15, 0.5, 0.8, 0.95].map((depth) => ({
      kind: 'outfield' as const, theta, depth, balls: ['fly', 'line', 'ground'] as BallType[],
    })),
  ),
];

function spotPoint(spec: SpotSpec, level: Level): Point {
  const cfg = FIELD_CONFIGS[level];
  const u = cfg.baseDistance / 90;
  const theta = spec.theta * RAD;
  const r =
    spec.kind === 'infield'
      ? spec.r * u
      : (() => {
          const start = 150 * u;
          return start + spec.depth * (fenceRadius(cfg, theta) - start);
        })();
  return { x: r * Math.sin(theta), y: r * Math.cos(theta) };
}

const RUNNER_STATES: Runners[] = [
  { first: false, second: false, third: false },
  { first: true, second: false, third: false },
  { first: false, second: true, third: false },
  { first: false, second: false, third: true },
  { first: true, second: true, third: false },
  { first: true, second: false, third: true },
  { first: false, second: true, third: true },
  { first: true, second: true, third: true },
];

const POSTURES: Posture[] = ['normal', 'normal', 'normal', 'doublePlay', 'infieldIn', 'cornersIn'];

export type Question = { roleKey: string; prompt: string; answers: Position[] };

export type Drill = { input: PlayInput; play: ResolvedPlay; question: Question };

const BASE_WORD: Record<string, string> = {
  first: 'first base', second: 'second base', third: 'third base', home: 'the plate',
};

function prompt(key: string): string | null {
  if (key === 'primary') return 'Who fields this ball?';

  const [kind, arg] = key.split(':');
  switch (kind) {
    case 'cover':
      return `Who covers ${BASE_WORD[arg]}?`;
    case 'secondary':
      return `Who is the second man at ${BASE_WORD[arg]}?`;
    case 'cutoff':
      return `Who cuts the throw to ${BASE_WORD[arg]}?`;
    case 'relay':
      return 'Who goes out as the relay man?';
    case 'trail':
      return 'Who trails the relay?';
    case 'backup':
      return `Who backs up the throw to ${BASE_WORD[arg]}?`;
    case 'backupFielder':
      return `Who backs up the ${POSITION_NAMES[arg as Position].toLowerCase()}?`;
    default:
      return null;
  }
}

/** Everything except fielding it — those are the jobs people actually forget. */
const DULL = new Set(['primary']);

function questionFor(play: ResolvedPlay, rng: () => number): Question | null {
  const byKey = new Map<string, Position[]>();
  for (const a of play.assignments) {
    const key = roleKey(a.role);
    if (key === 'watch' || !prompt(key)) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), a.position]);
  }
  if (byKey.size === 0) return null;

  const keys = [...byKey.keys()];
  const interesting = keys.filter((k) => !DULL.has(k));
  const chosen = pick(interesting.length > 0 ? interesting : keys, rng);

  return { roleKey: chosen, prompt: prompt(chosen)!, answers: byKey.get(chosen)! };
}

/**
 * Try until a scenario produces a question worth asking. Most do; a home run or
 * a foul ball does not, and rerolling is cheaper than filtering the spot list.
 */
export function generateDrill(level: Level, rng: () => number): Drill {
  for (let attempt = 0; attempt < 40; attempt++) {
    const spec = pick(SPOTS, rng);
    const at = spotPoint(spec, level);
    const zone = classify(at, level);

    const balls = spec.balls.filter((b) => isPlausible(b, zone));
    if (balls.length === 0) continue;
    const ball = pick(balls, rng);

    const outcomes = validOutcomes(ball, zone).filter(
      (o) => o !== 'overFence' && o !== 'foul' && o !== 'noPlay',
    );
    if (outcomes.length === 0) continue;

    const situation: Situation = {
      level,
      runners: pick(RUNNER_STATES, rng),
      outs: Math.floor(rng() * 3) as Outs,
      posture: pick(POSTURES, rng),
      batterHand: rng() < 0.5 ? 'L' : 'R',
    };

    const input: PlayInput = { situation, ball, at, outcome: pick(outcomes, rng) };
    const play = resolvePlay(input);
    const question = questionFor(play, rng);
    if (question) return { input, play, question };
  }

  // Fallback: a routine ground ball to short always yields a question.
  const u = FIELD_CONFIGS[level].baseDistance / 90;
  const input: PlayInput = {
    situation: {
      level,
      runners: { first: true, second: false, third: false },
      outs: 0,
      posture: 'normal',
      batterHand: 'R',
    },
    ball: 'ground',
    at: { x: -40 * u, y: 130 * u },
    outcome: 'fielded',
  };
  const play = resolvePlay(input);
  return { input, play, question: questionFor(play, rng)! };
}
