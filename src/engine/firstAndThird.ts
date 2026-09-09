/**
 * First and third.
 *
 * There is no batted ball here. The runner on first goes, and the defence has
 * to weigh an out at second against a run scoring from third — which is a
 * coaching decision, not something an engine should make. So the call is an
 * input, like the defensive posture, and what this produces is the mechanics of
 * each call rather than a recommendation between them.
 *
 * Health warning: first-and-third defences are the most system-dependent thing
 * in the game. The five calls below are common ones, but a programme that runs
 * different names and different responsibilities is not wrong, and none of this
 * has been reviewed by anyone who coaches.
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
import { alignment, POSITIONS, type Position } from '../field/alignments';
import type { Assignment, PlayPhase, RunnerSpot } from '../field/assignment';
import type { Situation } from '../field/play';
import { spaceOut } from './context';

export const FIRST_THIRD_CALLS = [
  'through',
  'cutPitcher',
  'cutMiddle',
  'backPick',
  'hold',
] as const;

export type FirstThirdCall = (typeof FIRST_THIRD_CALLS)[number];

export const CALL_NAMES: Record<FirstThirdCall, string> = {
  through: 'Throw through to second',
  cutPitcher: 'Pitcher cuts it',
  cutMiddle: 'Middle infielder cuts it',
  backPick: 'Snap throw behind him to third',
  hold: 'Hold the ball',
};

export const CALL_BLURB: Record<FirstThirdCall, string> = {
  through:
    'Take the out at second and live with the run. The usual call with two out, when the out ends the inning before he crosses.',
  cutPitcher:
    'Looks like a throw through. The pitcher stays in the line of it and reads the runner on third.',
  cutMiddle:
    'The middle infielder who is not covering charges to meet the throw, so the cut is made closer to the plate and the return throw is shorter.',
  backPick:
    'Give up second and go get the lead runner instead. Worth it only against a runner who leans.',
  hold: 'Concede second. Nothing is thrown, so nothing can go wrong.',
};

export type FirstThirdPlay = {
  call: FirstThirdCall;
  assignments: Assignment[];
  phases: PlayPhase[];
  notes: string[];
};

/**
 * Who covers second on a straight steal. The common default is the shortstop
 * against a right-handed hitter and the second baseman against a left-hander —
 * but this is a signal between the two of them in a real game, and plenty of
 * programmes call it the other way round.
 */
function coversSecond(situation: Situation): Position {
  return situation.batterHand === 'R' ? 'SS' : '2B';
}

export function buildFirstAndThird(
  situation: Situation,
  cfg: FieldConfig,
  call: FirstThirdCall,
): FirstThirdPlay {
  const bags = baseCoords(cfg);
  const u = cfg.baseDistance / 90;
  const start = alignment(situation.level, situation.posture);

  const cover = coversSecond(situation);
  const otherMiddle: Position = cover === 'SS' ? '2B' : 'SS';

  const out = new Map<Position, Assignment>();
  const put = (position: Position, a: Omit<Assignment, 'position'>) =>
    out.set(position, { position, ...a });

  /** On the line from home to second, `feet` out from the plate. */
  const upTheMiddle = (feet: number) => along(bags.home, bags.second, feet);

  const behind = (base: 'second' | 'third', from: Point, feet = 30) =>
    add(bags[base], scale(normalize(sub(bags[base], from)), feet * u));

  const notes: string[] = [];

  if (call === 'hold') {
    put('C', {
      role: { kind: 'watch' },
      target: along(bags.home, bags.second, 6 * u),
      phase: 1,
      why: 'Holds it. Shows him the ball and runs him back if he stops.',
      ruleId: 'ft.hold.catcher',
    });
    notes.push(
      'Second base is conceded. Nothing is thrown, so nothing gets away — the cost is runners on second and third.',
    );
  } else if (call === 'backPick') {
    put('C', {
      role: { kind: 'throws', to: 'third' },
      target: along(bags.home, bags.second, 5 * u),
      phase: 1,
      why: 'Shows second, then snaps it behind the runner at third.',
      ruleId: 'ft.backPick.catcher',
    });
    put('3B', {
      role: { kind: 'cover', base: 'third' },
      target: along(bags.third, bags.home, 4 * u),
      phase: 1,
      why: 'On the bag behind him, taking the throw on the inside corner.',
      ruleId: 'ft.backPick.third',
    });
    put('LF', {
      role: { kind: 'backupBase', base: 'third' },
      target: behind('third', bags.home),
      phase: 1,
      why: 'Behind third. This throw is the one that costs a run if it gets away.',
      ruleId: 'ft.backPick.backup',
    });
    notes.push('The runner on first takes second uncontested — that is the price of this call.');
  } else {
    // The three throwing calls share a catcher, a bag at second and a tag.
    put('C', {
      role: { kind: 'throws', to: 'second' },
      target: along(bags.home, bags.second, 5 * u),
      phase: 1,
      why:
        call === 'through'
          ? 'Straight through to second. Stays at home for a return throw.'
          : 'Throws as if going through. Stays at home — the cut comes back to him.',
      ruleId: `ft.${call}.catcher`,
    });

    if (call === 'cutPitcher') {
      put('P', {
        role: { kind: 'cutoff', on: { from: 'C', to: 'second' } },
        target: upTheMiddle(50 * u),
        phase: 1,
        why: 'Stays in the line of the throw and watches the runner on third.',
        ruleId: 'ft.cut.pitcher',
        alternative: {
          when: 'If the runner on third breaks',
          role: { kind: 'throws', to: 'home' },
          target: upTheMiddle(50 * u),
          why: 'Cuts it and throws home.',
          ruleId: 'ft.cut.home',
        },
      });
    } else if (call === 'cutMiddle') {
      put(otherMiddle, {
        role: { kind: 'cutoff', on: { from: 'C', to: 'second' } },
        target: upTheMiddle(72 * u),
        phase: 1,
        why: 'Charges to meet the throw, so the cut is made nearer the plate and the throw home is shorter.',
        ruleId: 'ft.cut.middle',
        alternative: {
          when: 'If the runner on third breaks',
          role: { kind: 'throws', to: 'home' },
          target: upTheMiddle(72 * u),
          why: 'Cuts it and throws home.',
          ruleId: 'ft.cut.home',
        },
      });
      put('P', {
        role: { kind: 'watch' },
        target: add(start.P, { x: -10 * u, y: -6 * u }),
        phase: 1,
        why: 'Off the line of the throw — somebody else is cutting this one.',
        ruleId: 'ft.cut.pitcherClear',
      });
    } else {
      put('P', {
        role: { kind: 'watch' },
        target: add(start.P, { x: -10 * u, y: -6 * u }),
        phase: 1,
        why: 'Gets off the line of the throw and lets it go through.',
        ruleId: 'ft.through.pitcher',
      });
    }

    put('CF', {
      role: { kind: 'backupBase', base: 'second' },
      target: behind('second', bags.home),
      phase: 1,
      why: 'Behind second, in line with the throw.',
      ruleId: 'ft.backup.second',
    });

    if (call !== 'through') {
      notes.push(
        'The runner on third is the whole reason for this call — the man cutting it decides, not the catcher.',
      );
    }
    if (situation.outs === 2) {
      notes.push('Two out: the out at second ends the inning, so the run only counts if he beats the tag.');
    }
  }

  // He is stealing second whatever the catcher decides to do with the ball, so
  // somebody is on that bag on every call.
  if (!out.has(cover)) {
    put(cover, {
      role: { kind: 'cover', base: 'second' },
      target: along(bags.second, bags.home, 4 * u),
      phase: 1,
      why: `Covers second and takes the tag — ${situation.batterHand === 'R' ? 'right' : 'left'}-handed hitter, so it is his bag.`,
      ruleId: 'ft.cover.second',
    });
  }

  // The third baseman stays with his runner on every call.
  if (!out.has('3B')) {
    put('3B', {
      role: { kind: 'cover', base: 'third' },
      target: along(bags.third, bags.home, 5 * u),
      phase: 1,
      why: 'Stays with the runner. He is the reason this is a decision at all.',
      ruleId: 'ft.hold.third',
    });
  }

  if (!out.has(otherMiddle) && call !== 'hold') {
    put(otherMiddle, {
      role: { kind: 'backupBase', base: 'second' },
      target: behind('second', bags.home, 18),
      phase: 1,
      why: 'In behind the bag in case the throw gets through.',
      ruleId: 'ft.backup.secondMiddle',
    });
  }

  for (const pos of POSITIONS) {
    if (out.has(pos)) continue;
    put(pos, {
      role: { kind: 'watch' },
      target: start[pos],
      phase: 1,
      why: 'Nothing to do on this call — holds his position.',
      ruleId: 'ft.hold.rest',
    });
  }

  const assignments = POSITIONS.map((p) => out.get(p)!);
  spaceOut(assignments, 10 * u);

  const spots = (toSecond: number, offThird: number): RunnerSpot[] => [
    {
      id: 'first',
      at: {
        x: bags.first.x + (bags.second.x - bags.first.x) * toSecond,
        y: bags.first.y + (bags.second.y - bags.first.y) * toSecond,
      },
      moving: toSecond > 0 && toSecond < 1,
    },
    {
      id: 'third',
      at: along(bags.third, bags.home, offThird * cfg.baseDistance),
      moving: offThird > 0.1,
    },
  ];

  const phases: PlayPhase[] =
    call === 'hold'
      ? [{ index: 1, label: 'Runner breaks', runners: spots(0.55, 0.12) }]
      : [
          { index: 1, label: 'Runner breaks', runners: spots(0.45, 0.14) },
          {
            index: 2,
            label: call === 'backPick' ? 'Snap throw' : 'Throw',
            activeThrow: { from: 'C', to: call === 'backPick' ? 'third' : 'second' },
            runners: spots(call === 'backPick' ? 0.75 : 0.9, 0.3),
          },
        ];

  return { call, assignments, phases, notes };
}
