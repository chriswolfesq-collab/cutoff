/**
 * Runs the golden corpus. A failure here means the baseball changed, not that
 * the code crashed — read the diff before touching the expectation.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_SITUATION, type Situation } from '../field/play';
import { roleKey } from '../field/assignment';
import { resolvePlay } from './resolve';
import { CORPUS } from './corpus';

describe('golden corpus', () => {
  it('has scenarios with unique names', () => {
    expect(new Set(CORPUS.map((s) => s.name)).size).toBe(CORPUS.length);
    expect(CORPUS.length).toBeGreaterThanOrEqual(20);
  });

  for (const scenario of CORPUS) {
    it(scenario.name, () => {
      const situation: Situation = { ...DEFAULT_SITUATION, ...scenario.situation };
      const play = resolvePlay({
        situation,
        ball: scenario.ball,
        at: scenario.at,
        outcome: scenario.outcome,
      });

      const actual = Object.fromEntries(
        play.assignments.map((a) => [a.position, roleKey(a.role)]),
      );

      // Compare only the fielders this scenario speaks to.
      const narrowed = Object.fromEntries(
        Object.keys(scenario.expect).map((pos) => [pos, actual[pos]]),
      );
      expect(narrowed).toEqual(scenario.expect);

      if (scenario.primaryRule) {
        const primary = play.assignments.find((a) => a.role.kind === 'primary');
        expect(primary?.ruleId).toBe(scenario.primaryRule);
      }

      if (scenario.throws) {
        expect(play.throws.map((t) => t.to)).toEqual(scenario.throws);
      }

      if (scenario.throwsFrom) {
        expect(play.throws.map((t) => t.from)).toEqual(scenario.throwsFrom);
      }

      if (scenario.branchWhen) {
        expect(play.branch?.when).toBe(scenario.branchWhen);
      }

      if (scenario.alternatives) {
        const actualAlts = Object.fromEntries(
          play.assignments
            .filter((a) => a.alternative)
            .map((a) => [a.position, roleKey(a.alternative!.role)]),
        );
        expect(actualAlts).toEqual(scenario.alternatives);
      }

      if (scenario.rundown) {
        const r = play.rundown;
        expect(r).toBeDefined();
        expect({
          behind: r!.behind,
          ahead: r!.ahead,
          runner: r!.runner,
          chaser: r!.assignments.find((a) => a.role.kind === 'chase')!.position,
          receiver: r!.assignments.find(
            (a) => a.role.kind === 'cover' && a.role.base === r!.behind,
          )!.position,
        }).toEqual(scenario.rundown);
      }

      if (scenario.phases) {
        expect(play.phases.map((ph) => ph.label)).toEqual(scenario.phases);
      }
    });
  }
});
