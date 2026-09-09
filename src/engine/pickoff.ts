/**
 * Pickoffs.
 *
 * Like first and third, there is no batted ball: the defence chooses to go
 * after a runner, and which play it runs is a coaching decision. What the
 * engine can say is the mechanics — who takes the throw, who is behind it, and
 * what the man who is not covering does to keep the runner honest.
 *
 * The two things worth drilling are both here. The man covering is *not* at the
 * bag until the throw is made, which is the entire deception; and every pickoff
 * throw is backed up, because the cost of one that gets away is a base at first
 * and a run at second.
 */

import {
  along,
  add,
  bases as baseCoords,
  normalize,
  scale,
  sub,
  type FieldConfig,
} from '../field/geometry';
import { alignment, POSITIONS, type Position } from '../field/alignments';
import type { Assignment, PlayPhase, RunnerId, RunnerSpot } from '../field/assignment';
import type { Runners, Situation } from '../field/play';
import { spaceOut } from './context';

export type PickoffBase = 'first' | 'second' | 'third';
export type PickoffId = 'p1' | 'c1' | 'p2ss' | 'p2b' | 'p3' | 'c3';

type Spec = {
  base: PickoffBase;
  from: Position;
  cover: Position;
  name: string;
  blurb: string;
};

export const PICKOFFS: Record<PickoffId, Spec> = {
  p1: {
    base: 'first', from: 'P', cover: '1B',
    name: 'Pitcher to first',
    blurb: 'The everyday move. The first baseman is already holding him, so he is on the bag before the throw.',
  },
  c1: {
    base: 'first', from: 'C', cover: '1B',
    name: 'Catcher back-picks first',
    blurb: 'After the pitch, on a runner who drifts. The first baseman has to get back to the bag from behind him.',
  },
  p2ss: {
    base: 'second', from: 'P', cover: 'SS',
    name: 'Pitcher to second, shortstop covers',
    blurb: 'The daylight play: the shortstop drifts in behind him and the pitcher throws when he can see daylight between the two.',
  },
  p2b: {
    base: 'second', from: 'P', cover: '2B',
    name: 'Pitcher to second, second baseman covers',
    blurb: 'A timing play. Nobody is looking at the runner, so it goes on a count the two of them have agreed.',
  },
  p3: {
    base: 'third', from: 'P', cover: '3B',
    name: 'Pitcher to third',
    blurb: 'Rare and expensive if it gets away, but a runner at third takes his lead in foul ground and stops watching.',
  },
  c3: {
    base: 'third', from: 'C', cover: '3B',
    name: 'Catcher back-picks third',
    blurb: 'After the pitch. The third baseman comes in behind him, which is why the throw has to beat him there.',
  },
};

/** The runner standing on each base. */
const RUNNER_AT: Record<PickoffBase, RunnerId> = {
  first: 'first', second: 'second', third: 'third',
};

const BACKUPS: Record<PickoffBase, Position[]> = {
  first: ['RF'],
  second: ['CF'],
  third: ['LF'],
};

export function availablePickoffs(runners: Runners): PickoffId[] {
  return (Object.keys(PICKOFFS) as PickoffId[]).filter((id) => runners[PICKOFFS[id].base]);
}

export type PickoffPlay = {
  id: PickoffId;
  spec: Spec;
  /** As the runner takes his lead — the man covering is deliberately not there. */
  assignments: Assignment[];
  /** Once the throw is made. */
  afterThrow: Assignment[];
  phases: PlayPhase[];
  notes: string[];
};

export function buildPickoff(
  situation: Situation,
  cfg: FieldConfig,
  id: PickoffId,
): PickoffPlay {
  const spec = PICKOFFS[id];
  const bags = baseCoords(cfg);
  const u = cfg.baseDistance / 90;
  const start = alignment(situation.level, situation.posture);
  const bag = bags[spec.base];
  const thrower = start[spec.from];

  const before = new Map<Position, Assignment>();
  const after = new Map<Position, Assignment>();
  const put = (
    map: Map<Position, Assignment>,
    position: Position,
    a: Omit<Assignment, 'position'>,
  ) => map.set(position, { position, ...a });

  const notes: string[] = [];

  // --- the thrower -------------------------------------------------------
  const throwWhy =
    spec.from === 'P'
      ? 'Steps off, or uses a move that is legal from the stretch. A balk here hands over the base he is trying to take.'
      : 'Comes up throwing the moment the ball is in his hand.';

  put(before, spec.from, {
    role: { kind: 'watch' },
    target: thrower,
    phase: 1,
    why: spec.from === 'P' ? 'Holds him on. Nothing in his body says the throw is coming.' : 'Receives the pitch.',
    ruleId: `pickoff.${spec.from}.set`,
  });
  put(after, spec.from, {
    role: { kind: 'throws', to: spec.base },
    target: thrower,
    phase: 2,
    why: throwWhy,
    ruleId: `pickoff.${spec.from}.throw`,
  });

  // --- the man covering --------------------------------------------------
  // Standing on the bag before the throw tells the runner it is coming. The
  // first baseman holding a runner is the one exception — he is already there.
  const alreadyThere = spec.base === 'first' && spec.from === 'P';
  const atBag = along(bag, thrower, 4 * u);

  put(before, spec.cover, {
    role: alreadyThere ? { kind: 'cover', base: spec.base } : { kind: 'watch' },
    target: alreadyThere ? atBag : along(start[spec.cover], bag, 8 * u),
    phase: 1,
    why: alreadyThere
      ? 'Holding him on, one foot on the bag.'
      : 'Not on the bag yet — getting there early is what tips the play off.',
    ruleId: alreadyThere ? 'pickoff.cover.holding' : 'pickoff.cover.late',
  });
  put(after, spec.cover, {
    role: { kind: 'cover', base: spec.base },
    target: atBag,
    phase: 2,
    why: 'On the bag as the ball arrives, glove down on the back corner.',
    ruleId: 'pickoff.cover.tag',
  });

  // --- the backup --------------------------------------------------------
  const backup = BACKUPS[spec.base].find((p) => !before.has(p));
  if (backup) {
    const spot = add(bag, scale(normalize(sub(bag, thrower)), 30 * u));
    for (const [map, phase] of [
      [before, 1],
      [after, 2],
    ] as const) {
      put(map, backup, {
        role: { kind: 'backupBase', base: spec.base },
        target: spot,
        phase,
        why:
          spec.base === 'second'
            ? 'In behind second. This is the throw that scores him if it gets away.'
            : `In behind ${spec.base}. Nothing is worth a pickoff that ends up down the line.`,
        ruleId: 'pickoff.backup',
      });
    }
  }

  // --- the decoy ---------------------------------------------------------
  if (spec.base === 'second') {
    const decoy: Position = spec.cover === 'SS' ? '2B' : 'SS';
    for (const [map, phase] of [
      [before, 1],
      [after, 2],
    ] as const) {
      put(map, decoy, {
        role: { kind: 'watch' },
        target: along(start[decoy], bags.second, 10 * u),
        phase,
        why: 'Fakes a break to the bag to hold his attention while the other one actually goes.',
        ruleId: 'pickoff.decoy',
      });
    }
  }

  // --- everybody else ----------------------------------------------------
  for (const map of [before, after]) {
    for (const pos of POSITIONS) {
      if (map.has(pos)) continue;
      put(map, pos, {
        role: { kind: 'watch' },
        target: start[pos],
        phase: map === before ? 1 : 2,
        why: 'Not in this play — holds his position and gives nothing away.',
        ruleId: 'pickoff.hold',
      });
    }
  }

  notes.push(
    spec.base === 'second'
      ? 'The backup matters more than the tag here: a throw into centre field scores him from second.'
      : 'Back it up. A pickoff that gets away gives up the base you were trying to take.',
  );
  if (!alreadyThere) {
    notes.push('Nobody goes to the bag early — the throw and the cover arrive together.');
  }

  const stage1 = POSITIONS.map((p) => before.get(p)!);
  const stage2 = POSITIONS.map((p) => after.get(p)!);
  spaceOut(stage1, 10 * u);
  spaceOut(stage2, 10 * u);

  // --- the runners -------------------------------------------------------
  const backTo: Record<PickoffBase, 'home' | 'first' | 'second'> = {
    first: 'home', second: 'first', third: 'second',
  };
  const others = (['first', 'second', 'third'] as PickoffBase[]).filter(
    (b) => b !== spec.base && situation.runners[b],
  );

  const spots = (lead: number): RunnerSpot[] => [
    { id: RUNNER_AT[spec.base], at: along(bag, bags[backTo[spec.base]], lead * u), moving: lead > 6 },
    ...others.map((b) => ({ id: RUNNER_AT[b], at: along(bags[b], bags[backTo[b]], 12 * u), moving: false })),
  ];

  const phases: PlayPhase[] = [
    { index: 1, label: 'His lead', runners: spots(16) },
    {
      index: 2,
      label: 'Throw',
      activeThrow: { from: spec.from, to: spec.base },
      runners: spots(5),
    },
  ];

  return { id, spec, assignments: stage1, afterThrow: stage2, phases, notes };
}
