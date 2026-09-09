/**
 * The output schema. Nothing writes to this yet — it exists so phase 2's
 * resolvers have a settled shape to produce, and so the renderer can be built
 * against it.
 *
 * Roles are symbolic and carry their reference points; the actual coordinates
 * are derived from geometry (see the cutoff/relay/backup formulas in README).
 */

import type { Position } from './alignments';
import type { Point } from './geometry';
import type { BaseId } from './play';

export type ThrowRef = { from: Position; to: BaseId };

export type Role =
  | { kind: 'primary' }
  | { kind: 'cutoff'; on: ThrowRef }
  | { kind: 'relay'; on: ThrowRef }
  | { kind: 'trail'; behind: Position }
  | { kind: 'cover'; base: BaseId }
  /**
   * At the bag behind whoever is covering it. Not a backup — a backup stands
   * behind the bag for a throw that gets away; this man takes the throw itself
   * if the cover does not get there.
   */
  | { kind: 'secondary'; base: BaseId }
  | { kind: 'backupBase'; base: BaseId; on?: ThrowRef }
  | { kind: 'backupFielder'; fielder: Position }
  /** Has the ball and is making the throw. */
  | { kind: 'throws'; to: BaseId }
  /** Has the ball in a rundown, running the runner back toward `toward`. */
  | { kind: 'chase'; toward: BaseId }
  /** Threw it; now sprinting to the back of the line at `to`. */
  | { kind: 'rotate'; to: BaseId }
  | { kind: 'watch' };

export const ROLE_LABELS: Record<Role['kind'], string> = {
  primary: 'Fields the ball',
  cutoff: 'Cutoff',
  relay: 'Relay',
  trail: 'Trailer',
  cover: 'Covers',
  secondary: 'Second man at',
  backupBase: 'Backs up',
  backupFielder: 'Backs up',
  throws: 'Makes the throw',
  chase: 'Runs him back',
  rotate: 'Peels to the back of the line',
  watch: 'Reads the play',
};

/**
 * A play unfolds as a sequence: the set before the pitch, contact, then one
 * step per throw. Fielders hold a single job throughout — under the current
 * rules nobody's assignment changes mid-play — so what moves between phases is
 * the ball, the runners, and which throw is live.
 */
export type RunnerId = 'batter' | 'first' | 'second' | 'third';

export type RunnerSpot = {
  id: RunnerId;
  at: Point;
  /** True while he is between bases rather than standing on one. */
  moving: boolean;
};

export type PlayPhase = {
  /** 0 is the set before the pitch; 1 is contact; 2 and up are the throws. */
  index: number;
  label: string;
  /** The throw in flight during this phase, if any. */
  activeThrow?: ThrowRef;
  runners: RunnerSpot[];
};

/**
 * What a fielder does instead when the throw goes the other way. Produced by
 * resolving the alternative line in full and diffing it, never hand-authored,
 * so it cannot disagree with the rules that produced the main line.
 */
export type Alternative = {
  /** The read, in coaching terms: "If he holds at third". */
  when: string;
  role: Role;
  target: Point;
  why: string;
  ruleId: string;
};

export type Assignment = {
  position: Position;
  role: Role;
  /** Where this fielder should end up during this phase. */
  target: Point;
  /** Optional route, when a straight line would be wrong (P looping behind home). */
  path?: Point[];
  /** The phase this job starts at. Everything is 1 today; see PlayPhase. */
  phase: number;
  /**
   * Every other job this fielder could end up with, one per read the play
   * carries. A cutoff man in particular is not in one of two states — he has a
   * menu, and which one he takes is the decision he is out there to make.
   */
  alternatives?: Alternative[];
  why: string;
  ruleId: string;
};

export type ResolvedPlay = {
  assignments: Assignment[];
  throws: ThrowRef[];
  notes: string[];
  /**
   * Where the ball is actually fielded. Usually the spot the user clicked, but
   * a ball that gets through the infield is picked up further out than the
   * point where it crossed.
   */
  ballAt: Point;
  phases: PlayPhase[];
  /** Every line the throw could take other than the one being played for. */
  branches?: { when: string; throws: ThrowRef[] }[];
  /** Present when a throw could leave a runner hung up between two bases. */
  rundown?: RundownPlay;
};

/**
 * A rundown is not a position, it is a rotation: chase him back to the base he
 * came from, make one throw, and get to the back of the line behind the man you
 * threw to. So it carries a second set of assignments for after the throw —
 * the only place in the engine where a fielder's job changes mid-play.
 */
export type RundownPlay = {
  /** The base he is driven back toward, and the one he was going to. */
  behind: BaseId;
  ahead: BaseId;
  runner: RunnerId;
  /** One per fielder, as the rundown starts. */
  assignments: Assignment[];
  /** Overrides for the fielders whose job changes once the throw is made. */
  afterThrow: Assignment[];
  throw: ThrowRef;
  phases: PlayPhase[];
  notes: string[];
};

/**
 * A compact, comparable string for a role: `primary`, `cover:first`,
 * `backup:second`, `backupFielder:LF`. Test expectations are written in this
 * form so a scenario reads like a lineup card rather than a wall of objects.
 */
export function roleKey(role: Role): string {
  switch (role.kind) {
    case 'primary':
      return 'primary';
    case 'watch':
      return 'watch';
    case 'cover':
      return `cover:${role.base}`;
    case 'secondary':
      return `secondary:${role.base}`;
    case 'backupBase':
      return `backup:${role.base}`;
    case 'backupFielder':
      return `backupFielder:${role.fielder}`;
    case 'cutoff':
      return `cutoff:${role.on.to}`;
    case 'relay':
      return `relay:${role.on.to}`;
    case 'trail':
      return `trail:${role.behind}`;
    case 'throws':
      return `throws:${role.to}`;
    case 'chase':
      return `chase:${role.toward}`;
    case 'rotate':
      return `rotate:${role.to}`;
  }
}
