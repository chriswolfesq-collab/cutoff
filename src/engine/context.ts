/**
 * Shared state and geometry for the resolver layers.
 *
 * Split out from resolve.ts so the layers that grew large — throw prediction
 * and cut/relay — can live in their own files without a circular import.
 */

import {
  along,
  add,
  dist,
  normalize,
  scale,
  sub,
  type Point,
} from '../field/geometry';
import type { Alignment, Position } from '../field/alignments';
import type { Assignment, Role, ThrowRef } from '../field/assignment';
import type { BaseId, PlayInput } from '../field/play';
import type { Zone } from '../field/zones';

/** How far behind the bag a backup sets up, in feet at adult scale. */
export const BACKUP_DEPTH = 30;
/** How far behind a fielder his backup plays. */
export const BACKUP_TRAIL = 22;

export const OUTFIELDERS: Position[] = ['LF', 'CF', 'RF'];
export const isOutfielder = (p: Position) => OUTFIELDERS.includes(p);

/**
 * Conventional backup order per base. Proximity is not the rule here — these
 * are the assignments that get drilled, and they beat whoever happens to be
 * standing closest.
 */
export const BACKUP_ORDER: Record<BaseId, Position[]> = {
  first: ['RF', 'C'],
  second: ['CF', 'RF', 'LF'],
  third: ['LF', 'P'],
  home: ['P'],
};

export type Ctx = {
  input: PlayInput;
  zone: Zone;
  start: Alignment;
  bags: Record<BaseId, Point>;
  /** Feet-scale factor: adult is 1, youth is 2/3. */
  u: number;
  primary: Position;
  ball: Point;
  throws: ThrowRef[];
  out: Map<Position, Assignment>;
  notes: string[];
  /** The reads this play carries, in the order the throw plan listed them. */
  branches?: { when: string }[];
};

/**
 * Nine men resolved independently can land on top of each other — most often
 * when the ball is fielded right beside a bag. Rather than special-case every
 * such geometry, the least-committed man gives way: a fielder chasing the ball
 * or standing on a base holds his spot, a backup slides.
 */
const ROLE_PRIORITY: Record<Role['kind'], number> = {
  primary: 0, throws: 0, chase: 0, cover: 1, secondary: 2, cutoff: 3, relay: 3,
  trail: 4, backupBase: 5, rotate: 5, backupFielder: 6, watch: 7,
};

export function spaceOut(list: Assignment[], min: number) {
  // A nudge can create a fresh collision, so keep going until nothing moves.
  for (let pass = 0; pass < 8; pass++) {
    let moved = false;

    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const d = dist(a.target, b.target);
        if (d >= min) continue;

        const [fixed, mover] =
          ROLE_PRIORITY[a.role.kind] <= ROLE_PRIORITY[b.role.kind] ? [a, b] : [b, a];
        const away = d < 0.01 ? { x: 0, y: 1 } : normalize(sub(mover.target, fixed.target));
        mover.target = add(fixed.target, scale(away, min));
        moved = true;
      }
    }

    if (!moved) return;
  }
}

export const put = (
  ctx: Ctx,
  position: Position,
  role: Role,
  target: Point,
  why: string,
  ruleId: string,
) => {
  if (ctx.out.has(position)) return;
  ctx.out.set(position, { position, role, target, phase: 1, why, ruleId });
};

export const free = (ctx: Ctx, ...candidates: Position[]) =>
  candidates.filter((p) => !ctx.out.has(p));

/** Where a fielder currently stands, as far as this play has decided. */
export const spotOf = (ctx: Ctx, p: Position) => ctx.out.get(p)?.target ?? ctx.start[p];

/**
 * A backup stands behind the bag, directly in line with the throw — so the
 * ball that gets past the fielder comes to him rather than past him too.
 */
export function backupPoint(ctx: Ctx, base: BaseId, from: Point, index = 0): Point {
  const bag = ctx.bags[base];
  // Two men on the same bag stagger in depth rather than stand on each other.
  const depth = BACKUP_DEPTH * (1 + 0.7 * index) * ctx.u;
  return add(bag, scale(normalize(sub(bag, from)), depth));
}

/**
 * The catcher does not line up with the throw — he chases the batter-runner up
 * the line and ends up past the bag in foul ground, which is a different spot
 * and the reason he and the right fielder do not collide.
 */
export function catcherBackupPoint(ctx: Ctx, base: BaseId): Point {
  const bag = ctx.bags[base];
  return along(ctx.bags.home, bag, ctx.input.situation.level === 'youth' ? 60 + 22 : 90 + 30);
}

/** Standing a step off the bag, on the side the throw is coming from. */
export function coverPoint(ctx: Ctx, base: BaseId, from: Point): Point {
  const bag = ctx.bags[base];
  const step = 4 * ctx.u;
  // Unless the throw is coming from right on top of the bag — then take it
  // from the far side, so he has somewhere to toss it and nobody collides.
  return dist(bag, from) < 12 * ctx.u ? along(bag, from, -step) : along(bag, from, step);
}
