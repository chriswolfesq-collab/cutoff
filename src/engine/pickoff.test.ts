/**
 * Pickoffs are hand-authored like the first-and-third calls, so these tests do
 * the job the sweep does elsewhere: each play is structurally sound, and the two
 * things that make a pickoff a pickoff actually hold — the throw is backed up,
 * and nobody stands on the bag before the ball is in the air.
 */

import { describe, expect, it } from 'vitest';
import { FIELD_CONFIGS, bases, dist, type Level } from '../field/geometry';
import { POSITIONS } from '../field/alignments';
import { roleKey } from '../field/assignment';
import { DEFAULT_SITUATION, type Outs, type Situation } from '../field/play';
import { availablePickoffs, buildPickoff, PICKOFFS, type PickoffId } from './pickoff';

const ALL_ON = { first: true, second: true, third: true };

function every(fn: (s: Situation, id: PickoffId) => void) {
  for (const level of ['youth', 'adult'] as Level[])
    for (const outs of [0, 1, 2] as Outs[])
      for (const id of Object.keys(PICKOFFS) as PickoffId[])
        fn({ ...DEFAULT_SITUATION, level, outs, runners: ALL_ON }, id);
}

describe('pickoffs', () => {
  it('only offers a play at a base that has a runner on it', () => {
    expect(availablePickoffs({ first: false, second: false, third: false })).toEqual([]);
    expect(availablePickoffs({ first: true, second: false, third: false })).toEqual(['p1', 'c1']);
    expect(availablePickoffs({ first: false, second: true, third: false })).toEqual(['p2ss', 'p2b']);
    expect(availablePickoffs({ first: false, second: false, third: true })).toEqual(['p3', 'c3']);
    expect(availablePickoffs(ALL_ON)).toHaveLength(6);
  });

  it('assigns all nine fielders at both stages', () => {
    every((s, id) => {
      const play = buildPickoff(s, FIELD_CONFIGS[s.level], id);
      for (const stage of [play.assignments, play.afterThrow]) {
        expect(stage).toHaveLength(POSITIONS.length);
        expect(new Set(stage.map((a) => a.position)).size).toBe(POSITIONS.length);
        for (const a of stage) {
          expect(a.why.trim().length).toBeGreaterThan(0);
          expect(a.ruleId.trim().length).toBeGreaterThan(0);
        }
      }
    });
  });

  it('never stacks two fielders at either stage', () => {
    every((s, id) => {
      const play = buildPickoff(s, FIELD_CONFIGS[s.level], id);
      for (const stage of [play.assignments, play.afterThrow]) {
        for (let i = 0; i < stage.length; i++) {
          for (let j = i + 1; j < stage.length; j++) {
            expect(dist(stage[i].target, stage[j].target)).toBeGreaterThan(3);
          }
        }
      }
    });
  });

  it('backs up every pickoff throw', () => {
    every((s, id) => {
      const play = buildPickoff(s, FIELD_CONFIGS[s.level], id);
      const backing = play.afterThrow.filter(
        (a) => a.role.kind === 'backupBase' && a.role.base === play.spec.base,
      );
      expect(backing).toHaveLength(1);
    });
  });

  it('puts the ball in the right hand and the cover on the right bag', () => {
    every((s, id) => {
      const play = buildPickoff(s, FIELD_CONFIGS[s.level], id);
      const thrower = play.afterThrow.find((a) => a.position === play.spec.from)!;
      expect(roleKey(thrower.role)).toBe(`throws:${play.spec.base}`);

      const cover = play.afterThrow.find((a) => a.position === play.spec.cover)!;
      expect(roleKey(cover.role)).toBe(`cover:${play.spec.base}`);
    });
  });

  it('keeps the cover off the bag until the throw, except the first baseman holding', () => {
    // Getting there early is what tips the play off.
    every((s, id) => {
      const play = buildPickoff(s, FIELD_CONFIGS[s.level], id);
      const before = play.assignments.find((a) => a.position === play.spec.cover)!;
      const holding = play.spec.base === 'first' && play.spec.from === 'P';
      expect(before.role.kind).toBe(holding ? 'cover' : 'watch');
    });
  });

  it('sends a decoy only on the plays at second', () => {
    every((s, id) => {
      const play = buildPickoff(s, FIELD_CONFIGS[s.level], id);
      const decoy = play.assignments.find((a) => a.ruleId === 'pickoff.decoy');
      if (play.spec.base !== 'second') {
        expect(decoy).toBeUndefined();
        return;
      }
      expect(decoy!.position).toBe(play.spec.cover === 'SS' ? '2B' : 'SS');
    });
  });

  it('dives him back toward the bag once the throw is made', () => {
    every((s, id) => {
      const play = buildPickoff(s, FIELD_CONFIGS[s.level], id);
      const bag = bases(FIELD_CONFIGS[s.level])[play.spec.base];
      const at = (i: number) =>
        play.phases[i].runners.find((r) => r.id === play.spec.base)!.at;

      expect(dist(at(1), bag)).toBeLessThan(dist(at(0), bag));
    });
  });

  it('leaves the other runners where they are', () => {
    every((s, id) => {
      const play = buildPickoff(s, FIELD_CONFIGS[s.level], id);
      for (const phase of play.phases) {
        expect(phase.runners).toHaveLength(3);
        for (const r of phase.runners) {
          if (r.id !== play.spec.base) expect(r.moving).toBe(false);
        }
      }
    });
  });
});
