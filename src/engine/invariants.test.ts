/**
 * Structural invariants, checked across a sweep of the whole field.
 *
 * These say nothing about whether the baseball is right — that is the corpus's
 * job. They say the resolver never produces output that is *malformed*: a
 * missing fielder, two men standing on the same blade of grass, a base taking a
 * throw nobody is covering. Those are the failures that are invisible in a
 * table and obvious on a field.
 */

import { describe, expect, it } from 'vitest';
import { FIELD_CONFIGS, dist, fenceRadius, type Level, type Point } from '../field/geometry';
import { POSITIONS, type Posture } from '../field/alignments';
import { classify } from '../field/zones';
import {
  BALL_TYPES,
  isPlausible,
  validOutcomes,
  type Outs,
  type PlayInput,
  type Runners,
} from '../field/play';
import { roleKey } from '../field/assignment';
import { resolvePlay } from './resolve';
import { BACKUP_ORDER } from './context';

const LEVELS: Level[] = ['youth', 'adult'];
const POSTURES: Posture[] = [
  'normal', 'doublePlay', 'infieldIn', 'cornersIn', 'noDoubles', 'guardLines',
];

const DEG = Math.PI / 180;

/** All eight base states crossed with all three out counts. */
const SITUATIONS: { runners: Runners; outs: Outs }[] = [];
for (const first of [false, true])
  for (const second of [false, true])
    for (const third of [false, true])
      for (const outs of [0, 1, 2] as Outs[])
        SITUATIONS.push({ runners: { first, second, third }, outs });

/** Every plausible (level, spot, ball, outcome) combination on the field. */
function buildSweep(): PlayInput[] {
  const plays: PlayInput[] = [];

  for (const level of LEVELS) {
    const cfg = FIELD_CONFIGS[level];

    // Past +/-45 is foul ground, which the resolver still has to handle.
    for (let deg = -52; deg <= 52; deg += 8) {
      const theta = deg * DEG;
      const reach = fenceRadius(cfg, theta);
      const posture = POSTURES[Math.abs(deg / 4) % POSTURES.length];

      for (let r = 12; r <= reach; r += 28) {
        const at: Point = { x: r * Math.sin(theta), y: r * Math.cos(theta) };
        const zone = classify(at, level);

        for (const ball of BALL_TYPES) {
          if (!isPlausible(ball, zone)) continue;
          for (const outcome of validOutcomes(ball, zone)) {
            // Every base state and out count at every sampled spot — the
            // runner rules are the whole point of this sweep.
            for (const { runners, outs } of SITUATIONS) {
              plays.push({
                situation: { level, runners, outs, posture, batterHand: 'R' },
                ball,
                at,
                outcome,
              });
            }
          }
        }
      }
    }
  }

  return plays;
}

const PLAYS = buildSweep();

const runnerLabel = (r: Runners) =>
  [r.first && '1st', r.second && '2nd', r.third && '3rd'].filter(Boolean).join('+') || 'empty';

const label = (p: PlayInput) =>
  `${p.situation.level} ${p.ball}/${p.outcome} at (${p.at.x.toFixed(0)}, ${p.at.y.toFixed(0)})` +
  ` [${p.situation.posture}, ${runnerLabel(p.situation.runners)}, ${p.situation.outs} out]`;

/** Report the count and a few examples rather than dumping thousands of lines. */
function assertNoFailures(failures: string[]) {
  if (failures.length === 0) return;
  throw new Error(
    `${failures.length} of ${PLAYS.length} plays failed. First ${Math.min(5, failures.length)}:\n` +
      failures.slice(0, 5).join('\n'),
  );
}

describe(`resolver invariants over ${PLAYS.length} plays`, () => {
  it('sweeps a meaningful number of plays', () => {
    expect(PLAYS.length).toBeGreaterThan(2000);
  });

  it('assigns all nine fielders, exactly once each', () => {
    const failures: string[] = [];
    for (const p of PLAYS) {
      const { assignments } = resolvePlay(p);
      const seen = assignments.map((a) => a?.position);
      if (assignments.some((a) => !a)) {
        failures.push(`${label(p)}: undefined assignment`);
      } else if (new Set(seen).size !== POSITIONS.length) {
        failures.push(`${label(p)}: got ${seen.join(',')}`);
      }
    }
    assertNoFailures(failures);
  });

  it('gives every assignment a reason and a rule id', () => {
    const failures: string[] = [];
    for (const p of PLAYS) {
      for (const a of resolvePlay(p).assignments) {
        if (!a.why?.trim() || !a.ruleId?.trim()) {
          failures.push(`${label(p)}: ${a.position} has no reason`);
        }
      }
    }
    assertNoFailures(failures);
  });

  it('covers every base that takes a throw', () => {
    const failures: string[] = [];
    for (const p of PLAYS) {
      const play = resolvePlay(p);
      const covered = new Set(
        play.assignments.map((a) => roleKey(a.role)).filter((k) => k.startsWith('cover:')),
      );
      for (const t of play.throws) {
        if (!covered.has(`cover:${t.to}`)) {
          failures.push(`${label(p)}: throw to ${t.to} has nobody on the bag`);
        }
      }
    }
    assertNoFailures(failures);
  });

  /**
   * Some throws genuinely have no backup — a comebacker thrown home with the
   * bases loaded leaves nobody spare. What must never happen is a bag going
   * unbacked while the man who is supposed to back it up stands idle.
   */
  it('never leaves a bag unbacked while its backup is idle', () => {
    const failures: string[] = [];
    for (const p of PLAYS) {
      const play = resolvePlay(p);
      const roles = new Map(play.assignments.map((a) => [a.position, roleKey(a.role)]));
      const backed = new Set([...roles.values()].filter((k) => k.startsWith('backup:')));

      for (const t of play.throws) {
        if (backed.has(`backup:${t.to}`)) continue;
        const idle = BACKUP_ORDER[t.to].filter((who) => roles.get(who) === 'watch');
        if (idle.length > 0) {
          failures.push(`${label(p)}: ${t.to} unbacked while ${idle.join(',')} idle`);
        }
      }
    }
    assertNoFailures(failures);
  });

  it('never sends two fielders to the same spot', () => {
    const failures: string[] = [];
    for (const p of PLAYS) {
      const { assignments } = resolvePlay(p);
      for (let i = 0; i < assignments.length; i++) {
        for (let j = i + 1; j < assignments.length; j++) {
          const d = dist(assignments[i].target, assignments[j].target);
          if (d < 3) {
            failures.push(
              `${label(p)}: ${assignments[i].position} and ${assignments[j].position} are ${d.toFixed(1)}' apart`,
            );
          }
        }
      }
    }
    assertNoFailures(failures);
  });

  it('keeps every fielder inside the ballpark', () => {
    const failures: string[] = [];
    for (const p of PLAYS) {
      const cfg = FIELD_CONFIGS[p.situation.level];
      const limit = cfg.fence.center + 60;
      for (const a of resolvePlay(p).assignments) {
        if (Math.hypot(a.target.x, a.target.y) > limit || a.target.y < -60) {
          failures.push(`${label(p)}: ${a.position} at (${a.target.x.toFixed(0)}, ${a.target.y.toFixed(0)})`);
        }
      }
    }
    assertNoFailures(failures);
  });

  it('sends the primary fielder to the ball', () => {
    const failures: string[] = [];
    for (const p of PLAYS) {
      const play = resolvePlay(p);
      const primary = play.assignments.find((a) => a.role.kind === 'primary');
      if (!primary) {
        failures.push(`${label(p)}: no primary fielder`);
      } else if (dist(primary.target, play.ballAt) > 0.01) {
        failures.push(`${label(p)}: primary is not at the ball`);
      }
    }
    assertNoFailures(failures);
  });
});
