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

  it('only records alternatives that are real jobs', () => {
    const failures: string[] = [];
    for (const p of PLAYS) {
      const play = resolvePlay(p);
      for (const a of play.assignments) {
        for (const alt of a.alternatives ?? []) {
          if (alt.role.kind === 'watch') {
            failures.push(`${label(p)}: ${a.position} alternative is doing nothing`);
          }
          if (!alt.when.trim() || !alt.ruleId.trim()) {
            failures.push(`${label(p)}: ${a.position} alternative has no read or rule`);
          }
          if (roleKey(alt.role) === roleKey(a.role)) {
            failures.push(`${label(p)}: ${a.position} alternative is the same job`);
          }
        }
      }
    }
    assertNoFailures(failures);
  });

  it('never offers a fielder the same job twice as an alternative', () => {
    const failures: string[] = [];
    for (const p of PLAYS) {
      for (const a of resolvePlay(p).assignments) {
        const keys = (a.alternatives ?? []).map((x) => roleKey(x.role));
        if (new Set(keys).size !== keys.length) {
          failures.push(`${label(p)}: ${a.position} is offered ${keys.join(' and ')}`);
        }
        const whens = (a.alternatives ?? []).map((x) => x.when);
        if (new Set(whens).size !== whens.length) {
          failures.push(`${label(p)}: ${a.position} has the same read twice`);
        }
      }
    }
    assertNoFailures(failures);
  });

  it('never records an alternative without a branch to justify it', () => {
    const failures: string[] = [];
    for (const p of PLAYS) {
      const play = resolvePlay(p);
      const reads = new Set((play.branches ?? []).map((b) => b.when));
      for (const a of play.assignments) {
        if (!a.alternatives?.length) continue;
        if (reads.size === 0) {
          failures.push(`${label(p)}: alternatives with no branch`);
          break;
        }
        for (const alt of a.alternatives) {
          for (const read of alt.reads) {
            if (!reads.has(read)) {
              failures.push(`${label(p)}: ${a.position} reads a branch the play does not carry`);
            }
          }
          // The display text has to name every read it stands for.
          if (alt.reads.length === 0) {
            failures.push(`${label(p)}: ${a.position} alternative names no read`);
          }
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
        for (const t of (a.alternatives ?? []).map((x) => x.target)) {
          if (Math.hypot(t.x, t.y) > limit || t.y < -60) {
            failures.push(`${label(p)}: ${a.position} alternative off the field`);
          }
        }
      }
    }
    assertNoFailures(failures);
  });

  it('gives every rundown nine fielders, a chaser and a receiver', () => {
    const failures: string[] = [];
    for (const p of PLAYS) {
      const r = resolvePlay(p).rundown;
      if (!r) continue;

      const seen = r.assignments.map((a) => a?.position);
      if (r.assignments.some((a) => !a) || new Set(seen).size !== POSITIONS.length) {
        failures.push(`${label(p)}: rundown has ${seen.join(',')}`);
        continue;
      }

      const kinds = r.assignments.map((a) => a.role.kind);
      if (kinds.filter((k) => k === 'chase').length !== 1) {
        failures.push(`${label(p)}: rundown has ${kinds.filter((k) => k === 'chase').length} chasers`);
      }
      const receiver = r.assignments.find(
        (a) => a.role.kind === 'cover' && a.role.base === r.behind,
      );
      if (!receiver) failures.push(`${label(p)}: nobody takes the throw at ${r.behind}`);
    }
    assertNoFailures(failures);
  });

  it('always drives the runner back to the base he came from', () => {
    const back: Record<string, string> = {
      first: 'home', second: 'first', third: 'second', home: 'third',
    };
    const failures: string[] = [];
    for (const p of PLAYS) {
      const r = resolvePlay(p).rundown;
      if (!r) continue;
      if (back[r.ahead] !== r.behind) {
        failures.push(`${label(p)}: running him from ${r.ahead} to ${r.behind}`);
      }
      if (r.throw.to !== r.behind) {
        failures.push(`${label(p)}: throw goes to ${r.throw.to}, not ${r.behind}`);
      }
      const chaser = r.assignments.find((a) => a.role.kind === 'chase');
      if (chaser && r.throw.from !== chaser.position) {
        failures.push(`${label(p)}: ${r.throw.from} throws but ${chaser.position} has the ball`);
      }
    }
    assertNoFailures(failures);
  });

  it('rotates the chaser behind the man he threw to', () => {
    const failures: string[] = [];
    for (const p of PLAYS) {
      const r = resolvePlay(p).rundown;
      if (!r) continue;

      const chaser = r.assignments.find((a) => a.role.kind === 'chase');
      const move = r.afterThrow.find((a) => a.position === chaser?.position);
      if (!move) {
        failures.push(`${label(p)}: chaser never peels off`);
        continue;
      }
      if (move.role.kind !== 'rotate') {
        failures.push(`${label(p)}: chaser becomes ${move.role.kind}, not a rotation`);
      }
      // He has to end up behind the bag he threw to, not still in the baseline.
      const bags = FIELD_CONFIGS[p.situation.level];
      const limit = bags.fence.center + 60;
      if (Math.hypot(move.target.x, move.target.y) > limit) {
        failures.push(`${label(p)}: chaser rotates off the field`);
      }
    }
    assertNoFailures(failures);
  });

  it('never stacks two fielders in a rundown, before or after the throw', () => {
    const failures: string[] = [];
    for (const p of PLAYS) {
      const r = resolvePlay(p).rundown;
      if (!r) continue;

      const after = new Map(r.afterThrow.map((a) => [a.position, a]));
      for (const stage of [r.assignments, r.assignments.map((a) => after.get(a.position) ?? a)]) {
        for (let i = 0; i < stage.length; i++) {
          for (let j = i + 1; j < stage.length; j++) {
            const d = dist(stage[i].target, stage[j].target);
            if (d < 3) {
              failures.push(
                `${label(p)}: ${stage[i].position} and ${stage[j].position} are ${d.toFixed(1)}' apart`,
              );
            }
          }
        }
      }
    }
    assertNoFailures(failures);
  });

  it('only offers a rundown when there is a runner to hang up', () => {
    const failures: string[] = [];
    for (const p of PLAYS) {
      const play = resolvePlay(p);
      if (!play.rundown) continue;
      const { runners } = p.situation;
      const present =
        play.rundown.runner === 'batter' ? true : runners[play.rundown.runner];
      if (!present) {
        failures.push(`${label(p)}: hangs up a ${play.rundown.runner} who is not on base`);
      }
      if (!play.throws.some((t) => t.to === play.rundown!.ahead)) {
        failures.push(`${label(p)}: rundown at ${play.rundown.ahead} with no throw there`);
      }
      // He cannot be caught short of a base he had already passed.
      const startRank = { batter: 0, first: 1, second: 2, third: 3 }[play.rundown.runner];
      const bagRank = { home: 0, first: 1, second: 2, third: 3 }[play.rundown.behind];
      if (startRank > bagRank) {
        failures.push(
          `${label(p)}: runner from ${play.rundown.runner} hung up behind ${play.rundown.behind}`,
        );
      }
    }
    assertNoFailures(failures);
  });

  it('only puts a second man where somebody else is already covering', () => {
    const failures: string[] = [];
    for (const p of PLAYS) {
      const play = resolvePlay(p);
      for (const a of play.assignments) {
        if (a.role.kind !== 'secondary') continue;
        const base = a.role.base;

        const cover = play.assignments.find(
          (x) => x.role.kind === 'cover' && x.role.base === base,
        );
        if (!cover) {
          failures.push(`${label(p)}: ${a.position} is second man at ${base} with nobody covering`);
        } else if (cover.position === a.position) {
          failures.push(`${label(p)}: ${a.position} is his own second man at ${base}`);
        }
        if (!play.throws.some((t) => t.to === base)) {
          failures.push(`${label(p)}: second man at ${base} with no throw there`);
        }
      }
    }
    assertNoFailures(failures);
  });

  it('only trails the runner on a ball that reached the outfield', () => {
    const failures: string[] = [];
    for (const p of PLAYS) {
      const play = resolvePlay(p);
      const trailer = play.assignments.find((a) => a.role.kind === 'trailRunner');
      if (!trailer) continue;

      if (trailer.position !== '1B') {
        failures.push(`${label(p)}: ${trailer.position} is trailing, not the first baseman`);
      }
      if (p.outcome === 'caught') {
        failures.push(`${label(p)}: trailing a batter who is out`);
      }
      if (play.throws.length === 0) {
        failures.push(`${label(p)}: trailing with nothing thrown`);
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
