/**
 * Drills are generated from resolved plays, so the thing worth testing is that
 * the question and the answer can never disagree with the diagram: whoever the
 * drill accepts must actually hold that job on that play.
 */

import { describe, expect, it } from 'vitest';
import type { Level } from '../field/geometry';
import { roleKey } from '../field/assignment';
import { resolvePlay } from './resolve';
import { generateDrill, rngFrom } from './drill';

const LEVELS: Level[] = ['youth', 'adult'];

function sample(count: number) {
  const drills = [];
  for (const level of LEVELS) {
    const rng = rngFrom(level === 'youth' ? 1234 : 9876);
    for (let i = 0; i < count; i++) drills.push(generateDrill(level, rng));
  }
  return drills;
}

const DRILLS = sample(400);

describe(`drill generation over ${DRILLS.length} drills`, () => {
  it('always has a prompt and at least one accepted answer', () => {
    for (const d of DRILLS) {
      expect(d.question.prompt.length).toBeGreaterThan(0);
      expect(d.question.answers.length).toBeGreaterThan(0);
    }
  });

  it('accepts only fielders who actually hold that job', () => {
    const failures: string[] = [];
    for (const d of DRILLS) {
      for (const who of d.question.answers) {
        const a = d.play.assignments.find((x) => x.position === who);
        if (!a || roleKey(a.role) !== d.question.roleKey) {
          failures.push(`${d.question.prompt} accepts ${who}, who is ${a ? roleKey(a.role) : 'absent'}`);
        }
      }
    }
    expect(failures.slice(0, 5)).toEqual([]);
  });

  it('never asks about a fielder with nothing to do', () => {
    for (const d of DRILLS) expect(d.question.roleKey).not.toBe('watch');
  });

  it('re-resolving the stored input reproduces the same play', () => {
    for (const d of DRILLS) {
      const again = resolvePlay(d.input);
      expect(again.assignments.map((a) => `${a.position}:${roleKey(a.role)}`)).toEqual(
        d.play.assignments.map((a) => `${a.position}:${roleKey(a.role)}`),
      );
    }
  });

  it('asks about more than just who fields it', () => {
    const kinds = new Set(DRILLS.map((d) => d.question.roleKey.split(':')[0]));
    expect(kinds.size).toBeGreaterThan(3);
    expect(kinds.has('cover')).toBe(true);
    expect(kinds.has('backup')).toBe(true);
  });

  it('is reproducible from a seed', () => {
    const a = generateDrill('youth', rngFrom(42));
    const b = generateDrill('youth', rngFrom(42));
    expect(a.question).toEqual(b.question);
    expect(a.input.at).toEqual(b.input.at);
  });
});
