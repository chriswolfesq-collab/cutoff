/**
 * The golden corpus: canonical plays with hand-authored expectations.
 *
 * These are written from the baseball, not read back from the engine. Each
 * scenario asserts only the fielders that matter to it — a partial expectation
 * stays readable and does not break every time an unrelated rule changes.
 *
 * Coordinates are in feet from home plate (see field/geometry.ts).
 */

import type { Point } from '../field/geometry';
import type { Position } from '../field/alignments';
import type { BallType, Outcome, Situation } from '../field/play';

export type Scenario = {
  name: string;
  situation?: Partial<Situation>;
  ball: BallType;
  at: Point;
  outcome: Outcome;
  /** Expected rule id for whoever fields it. */
  primaryRule?: string;
  /** Expected throw destinations, in order. */
  throws?: string[];
  /** Role keys — see roleKey() in field/assignment.ts. */
  expect: Partial<Record<Position, string>>;
};

export const CORPUS: Scenario[] = [
  // --- routine infield outs ------------------------------------------------
  {
    name: 'Routine ground ball to short',
    ball: 'ground',
    at: { x: -27, y: 87 },
    outcome: 'fielded',
    throws: ['first'],
    expect: {
      SS: 'primary',
      '1B': 'cover:first',
      '2B': 'cover:second',
      RF: 'backup:first',
      C: 'backup:first',
      LF: 'backupFielder:SS',
    },
  },
  {
    name: 'Ground ball to the first baseman — pitcher covers',
    ball: 'ground',
    at: { x: 55, y: 78 },
    outcome: 'fielded',
    expect: {
      '1B': 'primary',
      P: 'cover:first',
      SS: 'cover:second',
      RF: 'backup:first',
      C: 'backup:first',
    },
  },
  {
    name: 'Ground ball to the second baseman',
    ball: 'ground',
    at: { x: 25, y: 88 },
    outcome: 'fielded',
    expect: { '2B': 'primary', '1B': 'cover:first', SS: 'cover:second' },
  },
  {
    name: 'Ground ball down the third-base line',
    ball: 'ground',
    at: { x: -52, y: 60 },
    outcome: 'fielded',
    expect: {
      '3B': 'primary',
      '1B': 'cover:first',
      '2B': 'cover:second',
      LF: 'backupFielder:3B',
    },
  },
  {
    name: 'Comebacker to the pitcher',
    ball: 'ground',
    at: { x: 0, y: 45 },
    outcome: 'fielded',
    primaryRule: 'primary.comebacker',
    expect: { P: 'primary', '1B': 'cover:first' },
  },
  {
    name: 'Dribbler dying in front of the plate',
    ball: 'ground',
    at: { x: 0, y: 10 },
    outcome: 'fielded',
    primaryRule: 'primary.plate',
    expect: { C: 'primary', '1B': 'cover:first', RF: 'backup:first' },
  },

  // --- bunts ---------------------------------------------------------------
  {
    name: 'Bunt down the third-base line',
    ball: 'bunt',
    at: { x: -20, y: 22 },
    outcome: 'fielded',
    primaryRule: 'primary.bunt',
    expect: { '3B': 'primary', '1B': 'cover:first' },
  },
  {
    name: 'Bunt up the middle, normal defence — first baseman has the bag',
    ball: 'bunt',
    at: { x: 0, y: 30 },
    outcome: 'fielded',
    expect: { P: 'primary', '1B': 'cover:first' },
  },
  {
    name: 'Bunt up the middle, corners in — second baseman takes the bag',
    situation: { posture: 'cornersIn' },
    ball: 'bunt',
    at: { x: 0, y: 30 },
    outcome: 'fielded',
    expect: { P: 'primary', '2B': 'cover:first' },
  },
  {
    name: 'Infield in does not pull the first baseman off the bag',
    situation: { posture: 'infieldIn' },
    ball: 'ground',
    at: { x: -52, y: 60 },
    outcome: 'fielded',
    expect: { '3B': 'primary', '1B': 'cover:first' },
  },
  {
    name: 'Guarding the lines does not change who owns the ball',
    situation: { posture: 'guardLines' },
    ball: 'ground',
    at: { x: -27, y: 87 },
    outcome: 'fielded',
    expect: { SS: 'primary', '1B': 'cover:first' },
  },

  // --- base hits -----------------------------------------------------------
  {
    name: 'Base hit to left field',
    ball: 'fly',
    at: { x: -84, y: 141 },
    outcome: 'drops',
    throws: ['second'],
    expect: {
      LF: 'primary',
      CF: 'backupFielder:LF',
      '2B': 'cover:second',
      '1B': 'cover:first',
      RF: 'backup:second',
    },
  },
  {
    name: 'Base hit to right field',
    ball: 'fly',
    at: { x: 84, y: 141 },
    outcome: 'drops',
    expect: {
      RF: 'primary',
      CF: 'backupFielder:RF',
      SS: 'cover:second',
      LF: 'backup:second',
    },
  },
  {
    name: 'Ground ball through the left side',
    ball: 'ground',
    at: { x: -45, y: 75 },
    outcome: 'through',
    primaryRule: 'primary.through',
    expect: { LF: 'primary', CF: 'backupFielder:LF', '2B': 'cover:second' },
  },
  {
    name: 'Bloop into shallow right — the outfielder calls it',
    ball: 'fly',
    at: { x: 75, y: 90 },
    outcome: 'drops',
    primaryRule: 'primary.shallow.air',
    expect: { RF: 'primary', SS: 'cover:second' },
  },
  {
    name: 'Ball to the wall in the left-centre gap',
    ball: 'fly',
    at: { x: -55, y: 175 },
    outcome: 'toWall',
    primaryRule: 'primary.gap',
    throws: ['third'],
    expect: { CF: 'primary', '3B': 'cover:third', LF: 'backupFielder:CF', P: 'backup:third' },
  },

  // --- no play -------------------------------------------------------------
  {
    name: 'Fly ball caught in centre',
    ball: 'fly',
    at: { x: 0, y: 170 },
    outcome: 'caught',
    throws: [],
    expect: { CF: 'primary', LF: 'backupFielder:CF', '1B': 'watch', SS: 'watch' },
  },
  {
    name: 'Home run',
    ball: 'fly',
    at: { x: 0, y: 198 },
    outcome: 'overFence',
    throws: [],
    expect: { CF: 'primary', '1B': 'watch', P: 'watch' },
  },
  {
    name: 'Foul pop behind third',
    ball: 'popup',
    at: { x: -70, y: 40 },
    outcome: 'caught',
    throws: [],
    expect: { '3B': 'primary' },
  },

  // --- adult field ---------------------------------------------------------
  {
    name: 'Adult: routine ground ball to short',
    situation: { level: 'adult' },
    ball: 'ground',
    at: { x: -40, y: 133 },
    outcome: 'fielded',
    throws: ['first'],
    expect: {
      SS: 'primary',
      '1B': 'cover:first',
      '2B': 'cover:second',
      RF: 'backup:first',
      C: 'backup:first',
    },
  },
  {
    name: 'Adult: base hit to left field',
    situation: { level: 'adult' },
    ball: 'fly',
    at: { x: -160, y: 250 },
    outcome: 'drops',
    expect: { LF: 'primary', CF: 'backupFielder:LF', '2B': 'cover:second' },
  },
];
