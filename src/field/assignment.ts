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
  | { kind: 'backupBase'; base: BaseId; on?: ThrowRef }
  | { kind: 'backupFielder'; fielder: Position }
  | { kind: 'watch' };

export const ROLE_LABELS: Record<Role['kind'], string> = {
  primary: 'Fields the ball',
  cutoff: 'Cutoff',
  relay: 'Relay',
  trail: 'Trailer',
  cover: 'Covers',
  backupBase: 'Backs up',
  backupFielder: 'Backs up',
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

export type Assignment = {
  position: Position;
  role: Role;
  /** Where this fielder should end up during this phase. */
  target: Point;
  /** Optional route, when a straight line would be wrong (P looping behind home). */
  path?: Point[];
  /** The phase this job starts at. Everything is 1 today; see PlayPhase. */
  phase: number;
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
  }
}
