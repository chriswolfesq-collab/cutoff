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

/** A play unfolds in phases; fielders re-target at each one. */
export type Phase = 1 | 2 | 3;

export const PHASE_NAMES: Record<Phase, string> = {
  1: 'Contact',
  2: 'First throw',
  3: 'Trail runner',
};

export type Assignment = {
  position: Position;
  role: Role;
  /** Where this fielder should end up during this phase. */
  target: Point;
  /** Optional route, when a straight line would be wrong (P looping behind home). */
  path?: Point[];
  phase: Phase;
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
