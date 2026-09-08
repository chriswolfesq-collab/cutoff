/**
 * What the user tells us: the situation before the pitch, and what the batted
 * ball did. Outcome is chosen explicitly rather than inferred — that keeps
 * every scenario fully determined, which is what makes the play testable.
 */

import type { Level } from './geometry';
import type { Posture } from './alignments';
import { isInfieldBand, type Zone } from './zones';

export type Outs = 0 | 1 | 2;
export type BaseId = 'first' | 'second' | 'third' | 'home';
export type Runners = { first: boolean; second: boolean; third: boolean };

export type Situation = {
  level: Level;
  runners: Runners;
  outs: Outs;
  posture: Posture;
  batterHand: 'L' | 'R';
};

export const EMPTY_RUNNERS: Runners = { first: false, second: false, third: false };

export const DEFAULT_SITUATION: Situation = {
  level: 'youth',
  runners: EMPTY_RUNNERS,
  outs: 0,
  posture: 'normal',
  batterHand: 'R',
};

/** "1st and 2nd", "bases loaded", "nobody on" — for labels and permalinks. */
export function describeRunners(r: Runners): string {
  const on = [r.first && '1st', r.second && '2nd', r.third && '3rd'].filter(Boolean) as string[];
  if (on.length === 0) return 'Nobody on';
  if (on.length === 3) return 'Bases loaded';
  return on.join(' and ');
}

export const BALL_TYPES = ['ground', 'line', 'fly', 'popup', 'bunt'] as const;
export type BallType = (typeof BALL_TYPES)[number];

export const BALL_TYPE_NAMES: Record<BallType, string> = {
  ground: 'Ground ball',
  line: 'Line drive',
  fly: 'Fly ball',
  popup: 'Pop up',
  bunt: 'Bunt',
};

export const OUTCOMES = [
  'fielded', 'bobbled', 'through', 'caught', 'drops', 'toWall', 'overFence', 'foul', 'noPlay',
] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const OUTCOME_NAMES: Record<Outcome, string> = {
  fielded: 'Fielded cleanly',
  bobbled: 'Bobbled / knocked down',
  through: 'Gets through',
  caught: 'Caught',
  drops: 'Drops in for a hit',
  toWall: 'To the wall',
  overFence: 'Over the fence',
  foul: 'Rolls foul',
  noPlay: 'Dies untouched',
};

/** A ball type only makes sense at certain depths. */
export function isPlausible(ball: BallType, zone: Zone): boolean {
  switch (ball) {
    case 'bunt':
      return zone.band === 'bunt' || zone.band === 'in';
    case 'popup':
      return zone.band !== 'medium' && zone.band !== 'deep' && zone.band !== 'wall';
    case 'fly':
      return zone.band !== 'bunt';
    default:
      return true;
  }
}

/**
 * The outcomes actually on the table for this ball in this zone. Filtering
 * here is what stops the UI from offering nonsense like a bunt to the wall.
 */
export function validOutcomes(ball: BallType, zone: Zone): Outcome[] {
  if (!isPlausible(ball, zone)) return [];

  if (zone.foul) {
    if (ball === 'fly' || ball === 'popup') return ['caught', 'drops'];
    if (ball === 'bunt') return ['fielded', 'foul'];
    return ['foul'];
  }

  const infield = isInfieldBand(zone.band);

  switch (ball) {
    case 'bunt':
      return ['fielded', 'noPlay', 'through'];
    case 'ground':
      // Nothing has been got through yet at bunt depth — it either gets
      // fielded or it sits there.
      if (zone.band === 'bunt') return ['fielded', 'bobbled', 'noPlay'];
      return infield ? ['fielded', 'bobbled', 'through'] : ['fielded', 'toWall'];
    case 'line':
      return infield ? ['caught', 'through'] : ['caught', 'drops', 'toWall'];
    case 'popup':
      return ['caught', 'drops'];
    case 'fly':
      if (zone.band === 'wall') return ['caught', 'toWall', 'overFence'];
      if (zone.band === 'shallow' || zone.band === 'in' || zone.band === 'infield')
        return ['caught', 'drops'];
      return ['caught', 'drops', 'toWall'];
  }
}

/** Everything needed to resolve a play, once the user has picked it all. */
export type PlayInput = {
  situation: Situation;
  ball: BallType;
  at: { x: number; y: number };
  outcome: Outcome;
};
