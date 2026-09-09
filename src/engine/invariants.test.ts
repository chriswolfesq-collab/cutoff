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

  it('builds one phase per throw, plus the set and contact', () => {
    const failures: string[] = [];
    for (const p of PLAYS) {
      const play = resolvePlay(p);
      if (play.phases.length !== play.throws.length + 2) {
        failures.push(`${label(p)}: ${play.phases.length} phases for ${play.throws.length} throws`);
        continue;
      }
      if (play.phases.some((ph, i) => ph.index !== i)) {
        failures.push(`${label(p)}: phase indices out of order`);
      }
      const active = play.phases.filter((ph) => ph.activeThrow).length;
      if (active !== play.throws.length) {
        failures.push(`${label(p)}: ${active} live phases for ${play.throws.length} throws`);
      }
    }
    assertNoFailures(failures);
  });

  it('puts exactly the runners who exist on the field, in bounds', () => {
    const failures: string[] = [];
    for (const p of PLAYS) {
      const { runners } = p.situation;
      const expected = 1 + [runners.first, runners.second, runners.third].filter(Boolean).length;
      const cfg = FIELD_CONFIGS[p.situation.level];
      const limit = cfg.baseDistance * Math.SQRT2 + 40;

      for (const phase of resolvePlay(p).phases) {
        if (phase.runners.length !== expected) {
          failures.push(`${label(p)}: phase ${phase.index} has ${phase.runners.length} runners, want ${expected}`);
          break;
        }
        const stray = phase.runners.find((rn) => Math.hypot(rn.at.x, rn.at.y) > limit);
        if (stray) {
          failures.push(`${label(p)}: ${stray.id} off the basepaths at phase ${phase.index}`);
          break;
        }
      }
    }
    assertNoFailures(failures);
  });

  it('never has a runner moving before contact', () => {
    const failures: string[] = [];
    for (const p of PLAYS) {
      const set = resolvePlay(p).phases[0];
      if (set.runners.some((rn) => rn.moving)) {
        failures.push(`${label(p)}: somebody is already running at the set`);
      }
    }
    assertNoFailures(failures);
  });

  it('only records an alternative that is a real job', () => {
    const failures: string[] = [];
    for (const p of PLAYS) {
      const play = resolvePlay(p);
      for (const a of play.assignments) {
        if (!a.alternative) continue;
        if (a.alternative.role.kind === 'watch') {
          failures.push(`${label(p)}: ${a.position} alternative is doing nothing`);
        }
        if (!a.alternative.when.trim() || !a.alternative.ruleId.trim()) {
          failures.push(`${label(p)}: ${a.position} alternative has no read or rule`);
        }
        if (roleKey(a.alternative.role) === roleKey(a.role) &&
            dist(a.alternative.target, a.target) <= 10) {
          failures.push(`${label(p)}: ${a.position} alternative is the same job in the same place`);
        }
      }
    }
    assertNoFailures(failures);
  });

  it('never records an alternative without a branch to justify it', () => {
    const failures: string[] = [];
    for (const p of PLAYS) {
      const play = resolvePlay(p);
      const withAlt = play.assignments.filter((a) => a.alternative);
      if (withAlt.length > 0 && !play.branch) {
        failures.push(`${label(p)}: alternatives with no branch`);
      }
      for (const a of withAlt) {
        if (a.alternative!.when !== play.branch?.when) {
          failures.push(`${label(p)}: ${a.position} reads a different branch`);
        }
      }
    }
    assertNoFailures(failures);
  });

  it('keeps alternative positions inside the ballpark too', () => {
    const failures: string[] = [];
    for (const p of PLAYS) {
      const limit = FIELD_CONFIGS[p.situation.level].fence.center + 60;
      for (const a of resolvePlay(p).assignments) {
        const t = a.alternative?.target;
        if (t && (Math.hypot(t.x, t.y) > limit || t.y < -60)) {
          failures.push(`${label(p)}: ${a.position} alternative off the field`);
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
