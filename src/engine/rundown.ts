/**
 * Rundowns.
 *
 * A rundown is not a set of positions, it is a rotation. Drive him back toward
 * the base he came from — so that if he beats you he has gained nothing — make
 * one throw, and get to the back of the line behind the man you threw to. That
 * last part is why this is the only place in the engine where a fielder's job
 * changes partway through a play.
 *
 * The base pair is derived, not chosen: a throw to third can hang a man up
 * between second and third, and nowhere else.
 */

import {
  along,
  add,
  bases as baseCoords,
  normalize,
  scale,
  sub,
  type FieldConfig,
  type Point,
} from '../field/geometry';
import { POSITIONS, type Position } from '../field/alignments';
import { spaceOut } from './context';
import type {
  Assignment,
  PlayPhase,
  ResolvedPlay,
  RundownPlay,
  RunnerId,
  RunnerSpot,
} from '../field/assignment';
import type { BaseId, Runners, Situation } from '../field/play';

/** The base a runner must have come from to be caught heading for this one. */
const BEHIND: Record<BaseId, BaseId | null> = {
  first: 'home',
  second: 'first',
  third: 'second',
  home: 'third',
};

/**
 * Who gets hung up. Not simply whoever started on the base behind — a man
 * scoring from second is caught between third and home, having never stopped
 * at third. It is the lead runner who could be heading for this bag.
 */
function runnerFor(ahead: BaseId, r: Runners): RunnerId {
  if (ahead === 'home') return r.third ? 'third' : r.second ? 'second' : r.first ? 'first' : 'batter';
  if (ahead === 'third') return r.second ? 'second' : r.first ? 'first' : 'batter';
  if (ahead === 'second') return r.first ? 'first' : 'batter';
  return 'batter';
}

/** How far along the bases a runner started. */
const RANK: Record<RunnerId, number> = { batter: 0, first: 1, second: 2, third: 3 };

/** Where a trailing runner gets to while the rundown is going on. */
const NEXT: Record<RunnerId, BaseId> = {
  batter: 'first', first: 'second', second: 'third', third: 'home',
};

type Plan = {
  /** Takes the throw at the base he is driven back to, and makes the tag. */
  receiver: Position[];
  /** Behind the base he is driven back to. */
  backBehind: Position[];
  /** Behind the base he came from — where the chase started. */
  backAhead: Position[];
};

/**
 * Conventional assignments per base pair, keyed `behind-ahead`. Both ends get
 * backed up: a rundown is lost on a throw that gets away, not on a bad tag.
 */
const PLANS: Record<string, Plan> = {
  'home-first': { receiver: ['C'], backBehind: ['P'], backAhead: ['RF', '2B'] },
  'first-second': { receiver: ['1B'], backBehind: ['RF', 'P'], backAhead: ['CF', 'SS'] },
  'second-third': { receiver: ['SS', '2B'], backBehind: ['CF', '2B'], backAhead: ['LF', 'P'] },
  'third-home': { receiver: ['3B'], backBehind: ['LF', 'SS'], backAhead: ['P'] },
};

/**
 * Where a rundown is possible on this play, if anywhere.
 *
 * Throws to first are excluded: a batter-runner hung up between home and first
 * needs a dropped third strike or a misplayed bunt, not a batted ball being
 * fielded, and offering it on every ground out would be noise.
 */
export function rundownTarget(play: ResolvedPlay): BaseId | null {
  for (const t of play.throws) {
    if (t.to === 'first') continue;
    const behind = BEHIND[t.to];
    if (behind && PLANS[`${behind}-${t.to}`]) return t.to;
  }
  return null;
}

const perpendicular = (a: Point, b: Point): Point => {
  const d = normalize(sub(b, a));
  return { x: -d.y, y: d.x };
};

export function buildRundown(
  play: ResolvedPlay,
  situation: Situation,
  cfg: FieldConfig,
  ahead: BaseId,
): RundownPlay | null {
  const behind = BEHIND[ahead];
  const plan = behind && PLANS[`${behind}-${ahead}`];
  if (!behind || !plan) return null;

  const bags = baseCoords(cfg);
  const u = cfg.baseDistance / 90;
  const backBag = bags[behind];
  const aheadBag = bags[ahead];
  const side = perpendicular(backBag, aheadBag);

  const taken = new Set<Position>();
  const claim = (candidates: Position[]): Position | null => {
    const who = candidates.find((p) => !taken.has(p));
    if (who) taken.add(who);
    return who ?? null;
  };

  // Whoever took the throw has the ball, so he is the one who runs him back.
  const covering = play.assignments.find(
    (a) => a.role.kind === 'cover' && a.role.base === ahead,
  );
  const chaser = covering?.position ?? claim(['P']);
  if (!chaser) return null;
  taken.add(chaser);

  const receiver = claim(plan.receiver);
  const backB = claim(plan.backBehind);
  const backA = claim(plan.backAhead);

  const between = (t: number) => ({
    x: backBag.x + (aheadBag.x - backBag.x) * t,
    y: backBag.y + (aheadBag.y - backBag.y) * t,
  });

  const out = new Map<Position, Assignment>();
  const after = new Map<Position, Assignment>();

  const put = (
    map: Map<Position, Assignment>,
    position: Position,
    a: Omit<Assignment, 'position'>,
  ) => map.set(position, { position, ...a });

  put(out, chaser, {
    role: { kind: 'chase', toward: behind },
    target: between(0.72),
    phase: 1,
    why: `Has the ball. Runs hard at him and drives him back toward ${behind} — if he beats the tag he has gained nothing.`,
    ruleId: 'rundown.chase',
  });

  // After the throw he is out of the play until he gets behind the man he threw
  // to. That sprint is the whole discipline of a rundown.
  put(after, chaser, {
    role: { kind: 'rotate', to: behind },
    // Beyond the bag and off to the side: behind the man he threw to, without
    // standing in the spot the backup is already filling.
    target: add(add(backBag, scale(normalize(sub(backBag, aheadBag)), 15 * u)), scale(side, 15 * u)),
    phase: 2,
    why: `Threw it — sprints to the back of the line at ${behind}, behind the man he threw to.`,
    ruleId: 'rundown.rotate',
  });

  if (receiver) {
    put(out, receiver, {
      role: { kind: 'cover', base: behind },
      // Up the line and off the baseline, so the runner has a lane and the
      // throw has somewhere to go.
      target: add(along(backBag, aheadBag, 10 * u), scale(side, 5 * u)),
      phase: 1,
      why: 'Up the line off the bag, giving him a lane. Takes the throw and applies the tag.',
      ruleId: 'rundown.receive',
    });
  }

  if (backB) {
    put(out, backB, {
      role: { kind: 'backupBase', base: behind },
      target: add(backBag, scale(normalize(sub(backBag, aheadBag)), 30 * u)),
      phase: 1,
      why: `Behind ${behind} — a rundown is lost on a throw that gets away.`,
      ruleId: 'rundown.backup',
    });
  }

  if (backA) {
    put(out, backA, {
      role: { kind: 'backupBase', base: ahead },
      target: add(aheadBag, scale(normalize(sub(aheadBag, backBag)), 30 * u)),
      phase: 1,
      why: `Behind ${ahead}, in case he gets back in and the throw goes there.`,
      ruleId: 'rundown.backup',
    });
  }

  for (const pos of POSITIONS) {
    if (out.has(pos)) continue;
    const held = play.assignments.find((a) => a.position === pos);
    put(out, pos, {
      role: { kind: 'watch' },
      target: held?.target ?? bags.home,
      phase: 1,
      why: 'Not in the rundown — holds his ground and watches the other runners.',
      ruleId: 'rundown.hold',
    });
  }

  const hungRunner = runnerFor(ahead, situation.runners);

  // Runners ahead of him have already gone; runners behind him are taking the
  // next base while this is going on, which is exactly the danger.
  const others: RunnerId[] = (['batter', 'first', 'second', 'third'] as RunnerId[]).filter(
    (id) =>
      RANK[id] < RANK[hungRunner] &&
      (id === 'batter' || situation.runners[id]),
  );

  const notes = [
    `Caught between ${behind} and ${ahead}. Run him back to ${behind} and take him with one throw.`,
  ];
  if (others.length > 0) {
    notes.push(
      'Other runners are moving while this goes on — look them back before committing to the throw.',
    );
  }

  const otherSpots = (t: number): RunnerSpot[] => [
    { id: hungRunner, at: between(t), moving: true },
    ...others.map((id) => ({ id, at: bags[NEXT[id]], moving: false })),
  ];

  const throwRef = { from: chaser, to: behind };

  // Numbered from 1: index 0 means "before the pitch", and a rundown is
  // already in progress by the time it exists.
  const phases: PlayPhase[] = [
    { index: 1, label: 'Hung up', runners: otherSpots(0.55) },
    { index: 2, label: 'One throw, tag', activeThrow: throwRef, runners: otherSpots(0.22) },
  ];

  // Two complete stages rather than a set of deltas: each is spaced on its own,
  // and a fielder nudged in one cannot silently move in the other.
  const stage1 = POSITIONS.map((p) => out.get(p)!);
  const stage2 = POSITIONS.map((p) => {
    const change = after.get(p);
    return change ?? { ...out.get(p)!, phase: 2 };
  });

  spaceOut(stage1, 10 * u);
  spaceOut(stage2, 10 * u);

  return {
    behind,
    ahead,
    runner: hungRunner,
    assignments: stage1,
    afterThrow: stage2,
    throw: throwRef,
    phases,
    notes,
  };
}
