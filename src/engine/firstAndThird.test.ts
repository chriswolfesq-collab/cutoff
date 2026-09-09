/**
 * First-and-third calls are hand-authored, unlike everything else in the engine
 * — there is no batted ball to resolve from. So these tests do the job the
 * resolver's invariants do elsewhere: make sure each call is structurally sound,
 * and that the calls actually differ from one another in the way they claim to.
 */

import { describe, expect, it } from 'vitest';
import { FIELD_CONFIGS, dist, type Level } from '../field/geometry';
import { POSITIONS } from '../field/alignments';
import { roleKey } from '../field/assignment';
import { DEFAULT_SITUATION, type Outs, type Situation } from '../field/play';
import { buildFirstAndThird, FIRST_THIRD_CALLS, type FirstThirdCall } from './firstAndThird';

const RUNNERS = { first: true, second: false, third: true };

function every(fn: (s: Situation, call: FirstThirdCall) => void) {
  for (const level of ['youth', 'adult'] as Level[])
    for (const outs of [0, 1, 2] as Outs[])
      for (const batterHand of ['L', 'R'] as const)
        for (const call of FIRST_THIRD_CALLS)
          fn({ ...DEFAULT_SITUATION, level, outs, batterHand, runners: RUNNERS }, call);
}

describe('first and third', () => {
  it('assigns all nine fielders on every call', () => {
    every((s, call) => {
      const play = buildFirstAndThird(s, FIELD_CONFIGS[s.level], call);
      expect(play.assignments).toHaveLength(POSITIONS.length);
      expect(new Set(play.assignments.map((a) => a.position)).size).toBe(POSITIONS.length);
      for (const a of play.assignments) {
        expect(a.why.trim().length).toBeGreaterThan(0);
        expect(a.ruleId.trim().length).toBeGreaterThan(0);
      }
    });
  });

  it('never stacks two fielders', () => {
    every((s, call) => {
      const { assignments } = buildFirstAndThird(s, FIELD_CONFIGS[s.level], call);
      for (let i = 0; i < assignments.length; i++) {
        for (let j = i + 1; j < assignments.length; j++) {
          expect(dist(assignments[i].target, assignments[j].target)).toBeGreaterThan(3);
        }
      }
    });
  });

  it('keeps the third baseman with his runner on every call', () => {
    every((s, call) => {
      const play = buildFirstAndThird(s, FIELD_CONFIGS[s.level], call);
      const third = play.assignments.find((a) => a.position === '3B')!;
      expect(roleKey(third.role)).toBe('cover:third');
    });
  });

  it('covers second on every call, by the batter', () => {
    // He is stealing second whatever the catcher does with the ball.
    every((s, call) => {
      const play = buildFirstAndThird(s, FIELD_CONFIGS[s.level], call);
      const at2nd = play.assignments.find(
        (a) => a.role.kind === 'cover' && a.role.base === 'second',
      );
      expect(at2nd?.position).toBe(s.batterHand === 'R' ? 'SS' : '2B');
    });
  });

  it('gives the cut man a read, and gives nobody else one', () => {
    every((s, call) => {
      const play = buildFirstAndThird(s, FIELD_CONFIGS[s.level], call);
      const withAlt = play.assignments.filter((a) => a.alternatives?.length);
      const isCut = call === 'cutPitcher' || call === 'cutMiddle';

      expect(withAlt).toHaveLength(isCut ? 1 : 0);
      if (!isCut) return;

      const cut = withAlt[0];
      expect(cut.role.kind).toBe('cutoff');
      expect(cut.alternatives!.map((a) => roleKey(a.role))).toEqual(['throws:home']);
      expect(cut.position).toBe(call === 'cutPitcher' ? 'P' : s.batterHand === 'R' ? '2B' : 'SS');
    });
  });

  it('puts the ball in the catcher\'s hand except when he holds it', () => {
    every((s, call) => {
      const play = buildFirstAndThird(s, FIELD_CONFIGS[s.level], call);
      const c = play.assignments.find((a) => a.position === 'C')!;
      if (call === 'hold') {
        expect(c.role.kind).toBe('watch');
        return;
      }
      expect(roleKey(c.role)).toBe(call === 'backPick' ? 'throws:third' : 'throws:second');
    });
  });

  it('runs the two throwing runners and nobody else', () => {
    every((s, call) => {
      const play = buildFirstAndThird(s, FIELD_CONFIGS[s.level], call);
      for (const phase of play.phases) {
        expect(phase.runners.map((r) => r.id).sort()).toEqual(['first', 'third']);
      }
    });
  });

  it('gives every call a sequence that starts with the runner breaking', () => {
    every((s, call) => {
      const play = buildFirstAndThird(s, FIELD_CONFIGS[s.level], call);
      expect(play.phases[0].label).toBe('Runner breaks');
      expect(play.phases.every((p, i) => p.index === i + 1)).toBe(true);
      // Only the hold has nothing in the air.
      expect(play.phases.some((p) => p.activeThrow)).toBe(call !== 'hold');
    });
  });
});
