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
  /** Expected throw origins, in order — the chain from fielder to fielder. */
  throwsFrom?: string[];
  /** Expected phase labels, in order. */
  phases?: string[];
  /** The read that makes this play a branch. */
  branchWhen?: string;
  /** Expected alternative role keys, by position. */
  alternatives?: Partial<Record<Position, string>>;
  /** Expected rundown: which bases, who runs him back, who takes the throw. */
  rundown?: { behind: string; ahead: string; runner: string; chaser: Position; receiver: Position };
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
      RF: 'backup:second',
      // Deliberately not asserting the first baseman: nobody throws there on a
      // single, and whether he trails the runner is a judgement call the
      // engine does not make yet.
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
    phases: ['Set', 'Ball lands'],
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

  // --- runners: forces and double plays -----------------------------------
  {
    name: 'Runner on first, ground ball to short — turn two',
    situation: { runners: { first: true, second: false, third: false }, outs: 0 },
    ball: 'ground',
    at: { x: -27, y: 87 },
    outcome: 'fielded',
    throws: ['second', 'first'],
    // The relay to first comes off the second baseman, not the shortstop.
    throwsFrom: ['SS', '2B'],
    phases: ['Set', 'Contact', 'Throw 1: SS to second', 'Throw 2: 2B to first'],
    expect: {
      SS: 'primary',
      '2B': 'cover:second',
      '1B': 'cover:first',
      CF: 'backup:second',
      RF: 'backup:first',
    },
  },
  {
    name: 'Runner on first, two out — no double play, just the out at first',
    situation: { runners: { first: true, second: false, third: false }, outs: 2 },
    ball: 'ground',
    at: { x: -27, y: 87 },
    outcome: 'fielded',
    throws: ['first'],
    expect: { SS: 'primary', '1B': 'cover:first' },
  },
  {
    name: 'Runner on third, infield in — cut the run off at the plate',
    situation: { runners: { first: false, second: false, third: true }, outs: 0, posture: 'infieldIn' },
    ball: 'ground',
    at: { x: -27, y: 87 },
    outcome: 'fielded',
    throws: ['home'],
    expect: { SS: 'primary', C: 'cover:home', P: 'backup:home' },
  },
  {
    name: 'Runner on third, infield back — concede the run, take the out',
    situation: { runners: { first: false, second: false, third: true }, outs: 0 },
    ball: 'ground',
    at: { x: -27, y: 87 },
    outcome: 'fielded',
    throws: ['first'],
    expect: { SS: 'primary', '1B': 'cover:first' },
  },
  {
    name: 'Bases loaded, nobody out — force at the plate, then across',
    situation: { runners: { first: true, second: true, third: true }, outs: 0 },
    ball: 'ground',
    at: { x: -27, y: 87 },
    outcome: 'fielded',
    throws: ['home', 'first'],
    throwsFrom: ['SS', 'C'],
    expect: { SS: 'primary', C: 'cover:home', '1B': 'cover:first' },
  },
  {
    name: 'Fly ball caught with a runner on third — he tags',
    situation: { runners: { first: false, second: false, third: true }, outs: 1 },
    ball: 'fly',
    at: { x: 0, y: 170 },
    outcome: 'caught',
    throws: ['home'],
    expect: { CF: 'primary', C: 'cover:home' },
  },
  {
    name: 'Fly ball caught for the third out — nobody throws anywhere',
    situation: { runners: { first: false, second: false, third: true }, outs: 2 },
    ball: 'fly',
    at: { x: 0, y: 170 },
    outcome: 'caught',
    throws: [],
    expect: { CF: 'primary', C: 'watch' },
  },

  // --- cut and relay -------------------------------------------------------
  {
    name: 'Youth: single to left with a man on second — first baseman cuts it',
    situation: { runners: { first: false, second: true, third: false }, outs: 1 },
    ball: 'fly',
    at: { x: -84, y: 141 },
    outcome: 'drops',
    throws: ['home'],
    expect: { LF: 'primary', '1B': 'cutoff:home', C: 'cover:home', P: 'backup:home' },
  },
  {
    name: 'Adult: single to left with a man on second — third baseman cuts it',
    situation: { level: 'adult', runners: { first: false, second: true, third: false }, outs: 1 },
    ball: 'fly',
    at: { x: -160, y: 250 },
    outcome: 'drops',
    throws: ['home'],
    expect: { LF: 'primary', '3B': 'cutoff:home', SS: 'cover:third', C: 'cover:home' },
  },
  {
    name: 'Single to left with a man on second — pitcher backs up third or home',
    situation: { runners: { first: false, second: true, third: false }, outs: 1 },
    ball: 'fly',
    at: { x: -84, y: 141 },
    outcome: 'drops',
    throws: ['home'],
    branchWhen: 'If he holds at third',
    // The textbook conditional: he cannot know which bag until the throw goes.
    // The right fielder's read is the other one — the batter-runner rounding
    // first behind the throw home.
    alternatives: {
      P: 'backup:third',
      '3B': 'cover:third',
      SS: 'cutoff:third',
      RF: 'backup:second',
    },
    expect: { P: 'backup:home', '1B': 'cutoff:home' },
  },
  {
    name: 'Fly ball caught with a runner on third — no read, the play just ends',
    situation: { runners: { first: false, second: false, third: true }, outs: 1 },
    ball: 'fly',
    at: { x: 0, y: 170 },
    outcome: 'caught',
    branchWhen: 'If he does not tag',
    alternatives: {},
    expect: { CF: 'primary', C: 'cover:home' },
  },
  {
    name: 'Adult: single to right with a man on second — first baseman cuts it',
    situation: { level: 'adult', runners: { first: false, second: true, third: false }, outs: 1 },
    ball: 'fly',
    at: { x: 160, y: 250 },
    outcome: 'drops',
    throws: ['home'],
    expect: { RF: 'primary', '1B': 'cutoff:home', C: 'cover:home' },
  },
  {
    name: 'Single to left with a man on first — he is going first to third',
    situation: { runners: { first: true, second: false, third: false }, outs: 0 },
    ball: 'fly',
    at: { x: -84, y: 141 },
    outcome: 'drops',
    throws: ['third'],
    expect: { LF: 'primary', SS: 'cutoff:third', '3B': 'cover:third' },
  },
  {
    name: 'Youth: ball to the wall — one relay man, the other stays on second',
    ball: 'fly',
    at: { x: -55, y: 175 },
    outcome: 'toWall',
    throws: ['third'],
    expect: { CF: 'primary', SS: 'relay:third', '2B': 'cover:second', '3B': 'cover:third' },
  },
  {
    name: 'Adult: ball to the wall — shortstop and second baseman in tandem',
    situation: { level: 'adult' },
    ball: 'fly',
    at: { x: -115, y: 357 },
    outcome: 'toWall',
    throws: ['third'],
    expect: { CF: 'primary', SS: 'relay:third', '2B': 'trail:SS' },
  },

  // --- rundowns ------------------------------------------------------------
  {
    name: 'Man on first hung up between second and third',
    situation: { runners: { first: true, second: false, third: false }, outs: 0 },
    ball: 'fly',
    at: { x: -84, y: 141 },
    outcome: 'drops',
    throws: ['third'],
    rundown: {
      behind: 'second', ahead: 'third', runner: 'first',
      // The third baseman took the throw, so the ball is his to run back.
      chaser: '3B', receiver: 'SS',
    },
    expect: { LF: 'primary', '3B': 'cover:third' },
  },
  {
    name: 'Man scoring from second hung up between third and home',
    situation: { runners: { first: false, second: true, third: false }, outs: 1 },
    ball: 'fly',
    at: { x: -84, y: 141 },
    outcome: 'drops',
    throws: ['home'],
    rundown: {
      // He never stopped at third, so that is the bag he is driven back to.
      behind: 'third', ahead: 'home', runner: 'second',
      chaser: 'C', receiver: '3B',
    },
    expect: { C: 'cover:home' },
  },
  {
    name: 'Batter stretching a single, hung up between first and second',
    ball: 'fly',
    at: { x: -84, y: 141 },
    outcome: 'drops',
    throws: ['second'],
    rundown: {
      behind: 'first', ahead: 'second', runner: 'batter',
      chaser: '2B', receiver: '1B',
    },
    expect: { '2B': 'cover:second' },
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
