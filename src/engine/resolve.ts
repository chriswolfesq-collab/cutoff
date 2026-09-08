/**
 * The resolver: a play in, nine assignments out.
 *
 * Layers run in order, each claiming fielders the previous layers left free.
 * That ordering is the whole design — primary first because everything else
 * keys off who has the ball, backups last because they are whoever is left
 * over standing nearest the throw.
 *
 * Scope: bases empty. Runner situations, cutoff/relay and multi-phase play
 * come next; `layerCutoffRelay` is deliberately an empty seam rather than a
 * guess, so nothing here has to be unpicked later.
 */

import {
  FIELD_CONFIGS,
  along,
  bases as baseCoords,
  dist,
  normalize,
  scale,
  sub,
  add,
  type Point,
} from '../field/geometry';
import { alignment, POSITIONS, type Alignment, type Position } from '../field/alignments';
import { classify, isInfieldBand, type Zone } from '../field/zones';
import { outfieldOwnerAt, primaryFor } from '../field/primary';
import type { Assignment, ResolvedPlay, Role, ThrowRef } from '../field/assignment';
import type { BaseId, PlayInput } from '../field/play';

/** How far behind the bag a backup sets up, in feet at adult scale. */
const BACKUP_DEPTH = 30;
/** How far behind a fielder his backup plays. */
const BACKUP_TRAIL = 22;

type Ctx = {
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
};

const put = (ctx: Ctx, position: Position, role: Role, target: Point, why: string, ruleId: string) => {
  if (ctx.out.has(position)) return;
  ctx.out.set(position, { position, role, target, phase: 1, why, ruleId });
};

const free = (ctx: Ctx, ...candidates: Position[]) =>
  candidates.filter((p) => !ctx.out.has(p));

/**
 * A backup stands behind the bag, directly in line with the throw — so the
 * ball that gets past the fielder comes to him rather than past him too.
 */
function backupPoint(ctx: Ctx, base: BaseId, from: Point, index = 0): Point {
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
function catcherBackupPoint(ctx: Ctx, base: BaseId): Point {
  const bag = ctx.bags[base];
  return along(ctx.bags.home, bag, ctx.input.situation.level === 'youth' ? 60 + 22 : 90 + 30);
}

/** Standing a step off the bag, on the side the throw is coming from. */
function coverPoint(ctx: Ctx, base: BaseId, from: Point): Point {
  const bag = ctx.bags[base];
  const step = 4 * ctx.u;
  // Unless the throw is coming from right on top of the bag — then take it
  // from the far side, so he has somewhere to toss it and nobody collides.
  return dist(bag, from) < 12 * ctx.u ? along(bag, from, -step) : along(bag, from, step);
}

// --- layer 1: who has the ball -------------------------------------------

function layerPrimary(ctx: Ctx) {
  const { outcome } = ctx.input;
  const call = primaryFor(ctx.zone, ctx.input.ball, ctx.input.situation.level);

  // A ball that gets through or drops in belongs to the outfielder behind it,
  // not to the infielder it went past.
  const throughToOutfield =
    (outcome === 'through' || outcome === 'drops' || outcome === 'toWall') &&
    isInfieldBand(ctx.zone.band);

  if (throughToOutfield) {
    const of = outfieldOwnerAt(ctx.zone.theta);
    ctx.primary = of;
    put(ctx, of, { kind: 'primary' }, ctx.ball, 'Ball got through the infield — he comes up and cuts it off.', 'primary.through');
    ctx.notes.push(`Ball beat the ${call.position}.`);
    return;
  }

  ctx.primary = call.position;
  put(ctx, call.position, { kind: 'primary' }, ctx.ball, call.why, call.ruleId);
}

// --- layer 2: where the ball is going ------------------------------------

function layerThrows(ctx: Ctx) {
  const { outcome } = ctx.input;
  const infield = isInfieldBand(ctx.zone.band);

  switch (outcome) {
    case 'caught':
      ctx.notes.push('Caught — batter is out, no throw.');
      return;
    case 'overFence':
      ctx.notes.push('Gone. Nothing to defend.');
      return;
    case 'foul':
      ctx.notes.push('Foul ball — everyone resets.');
      return;
    case 'noPlay':
      ctx.notes.push('Bunt dies untouched — no throw, hold him to first.');
      return;
    case 'toWall':
      ctx.throws.push({ from: ctx.primary, to: 'third' });
      ctx.notes.push('Ball to the wall — batter is going for extra bases.');
      return;
    case 'bobbled':
      ctx.throws.push({ from: ctx.primary, to: 'first' });
      ctx.notes.push('Knocked down — the play at first is close; make sure of it.');
      return;
    case 'through':
    case 'drops':
      ctx.throws.push({ from: ctx.primary, to: 'second' });
      ctx.notes.push('Base hit — keep him to a single.');
      return;
    case 'fielded':
      ctx.throws.push({ from: ctx.primary, to: infield ? 'first' : 'second' });
      return;
  }
}

// --- layer 3: cutoff and relay (phase 3) ---------------------------------

function layerCutoffRelay(ctx: Ctx) {
  const fromOutfield = ctx.throws.some(
    (t) => t.from === 'LF' || t.from === 'CF' || t.from === 'RF',
  );
  if (fromOutfield) {
    ctx.notes.push('Cut and relay assignments are not modelled yet.');
  }
}

// --- layer 4: base coverage ----------------------------------------------

/**
 * Coverage is expressed as an order of preference, not a single name. The
 * preferred man is regularly already busy — he fielded the ball, or a posture
 * moved him — and a base that takes a throw always needs somebody on it.
 */
function coverCandidates(ctx: Ctx, base: BaseId): { order: Position[]; why: string; ruleId: string } {
  const { posture } = ctx.input.situation;
  // Only bunt defence pulls the first baseman off the bag for good. With the
  // infield merely drawn in he is shallow, not charging, and still takes the
  // throw himself.
  const charging = posture === 'cornersIn';

  if (base === 'first') {
    if (ctx.primary === '1B')
      return { order: ['P', '2B'], why: 'First baseman fielded it — pitcher covers the bag.', ruleId: 'cover.first.pitcher' };
    if (charging && isInfieldBand(ctx.zone.band))
      return { order: ['2B', '1B', 'P'], why: 'First baseman is charging — second baseman takes the bag.', ruleId: 'cover.first.second' };
    return { order: ['1B', 'P', '2B'], why: 'Takes the throw at first.', ruleId: 'cover.first' };
  }

  if (base === 'second') {
    // The middle infielder away from the ball; the other one is going to it.
    const toLeftSide = ctx.zone.theta <= 0;
    return {
      order: toLeftSide ? ['2B', 'SS', 'P'] : ['SS', '2B', 'P'],
      why: `Ball is to the ${toLeftSide ? 'left' : 'right'} side — the middle infielder away from it covers second.`,
      ruleId: 'cover.second',
    };
  }

  if (base === 'third')
    return { order: ['3B', 'SS', 'P'], why: 'Covers third.', ruleId: 'cover.third' };

  return { order: ['C', 'P', '1B'], why: 'Covers the plate.', ruleId: 'cover.home' };
}

function assignCover(ctx: Ctx, base: BaseId, from: Point, whyOverride?: string) {
  const { order, why, ruleId } = coverCandidates(ctx, base);
  const who = order.find((p) => !ctx.out.has(p)) ?? POSITIONS.find((p) => !ctx.out.has(p));
  if (!who) return;
  put(ctx, who, { kind: 'cover', base }, coverPoint(ctx, base, from), whyOverride ?? why, ruleId);
}

function layerCoverage(ctx: Ctx) {
  for (const t of ctx.throws) {
    const from = ctx.out.get(t.from)?.target ?? ctx.ball;
    assignCover(ctx, t.to, from);
  }

  // Nobody is throwing there, but second base is not left open: if the throw
  // to first gets away, that is the base the batter-runner goes to.
  if (
    isInfieldBand(ctx.zone.band) &&
    ctx.throws.some((t) => t.to === 'first') &&
    !ctx.throws.some((t) => t.to === 'second')
  ) {
    assignCover(
      ctx,
      'second',
      ctx.ball,
      'No play here, but he takes second in case the throw to first gets away.',
    );
  }

  // The batter-runner is always headed to first, even with no throw there.
  if (!ctx.throws.some((t) => t.to === 'first') && ctx.throws.length > 0) {
    assignCover(ctx, 'first', ctx.ball);
  }
}

// --- layer 5: backups ----------------------------------------------------

/**
 * Conventional backup order per base. Proximity is not the rule here — these
 * are the assignments that get drilled, and they beat whoever happens to be
 * standing closest.
 */
const BACKUP_ORDER: Record<BaseId, Position[]> = {
  first: ['RF', 'C'],
  second: ['CF', 'RF', 'LF'],
  third: ['LF', 'P'],
  home: ['P'],
};

const OUTFIELDERS: Position[] = ['LF', 'CF', 'RF'];

/** Somebody gets in behind the man with the ball. */
function backupTheFielder(ctx: Ctx) {
  const primaryAt = ctx.out.get(ctx.primary)?.target ?? ctx.ball;
  const neighbours: Record<Position, Position[]> = {
    LF: ['CF'], RF: ['CF'], CF: ['LF', 'RF'],
    P: [], C: [], '1B': ['RF'], '2B': ['RF'], '3B': ['LF'], SS: ['LF', 'CF'],
  };
  for (const who of free(ctx, ...(neighbours[ctx.primary] ?? []))) {
    put(
      ctx,
      who,
      { kind: 'backupFielder', fielder: ctx.primary },
      along(primaryAt, ctx.bags.home, -BACKUP_TRAIL * ctx.u),
      `Backs up the ${ctx.primary} — nothing gets past both of them.`,
      'backup.fielder',
    );
    break;
  }
}

/** Somebody gets in behind each bag that is taking a throw. */
function backupTheBases(ctx: Ctx) {
  const infield = isInfieldBand(ctx.zone.band);

  for (const t of ctx.throws) {
    const from = ctx.out.get(t.from)?.target ?? ctx.ball;

    // The catcher genuinely cannot do this one — on a ball to the outfield he
    // is needed at the plate, so he is excluded outright.
    const eligible = BACKUP_ORDER[t.to].filter((w) => !(w === 'C' && !infield));
    // Preferring the outfielder away from the ball is only a preference: if he
    // is already spoken for, a backed-up bag beats a tidy one.
    const awkward = (who: Position) =>
      (who === 'RF' && t.to === 'second' && ctx.zone.theta > 0) ||
      (who === 'LF' && t.to === 'second' && ctx.zone.theta <= 0);
    const candidates = [...eligible.filter((w) => !awkward(w)), ...eligible.filter(awkward)];

    let taken = 0;
    for (const who of candidates) {
      if (taken >= 2) break;
      if (ctx.out.has(who)) continue;

      const why =
        who === 'C'
          ? 'Trails the runner up the line and backs up the throw.'
          : `Backs up the throw to ${t.to}, in line behind the bag.`;

      const spot =
        who === 'C' ? catcherBackupPoint(ctx, t.to) : backupPoint(ctx, t.to, from, taken);
      put(ctx, who, { kind: 'backupBase', base: t.to, on: t }, spot, why, `backup.${t.to}`);
      taken++;
    }
  }
}

/**
 * Which of those two comes first depends on who has the ball.
 *
 * When an outfielder has it, getting in behind him is the top job — a ball
 * past him costs three bases, and the bags can make do with whoever is left.
 * When an infielder has it there is nothing to get past, so the bags win and
 * the outfielder drifts in behind him only if he is not already spoken for.
 */
function layerBackups(ctx: Ctx) {
  const primaryIsOutfielder = OUTFIELDERS.includes(ctx.primary);

  if (primaryIsOutfielder || ctx.throws.length === 0) {
    backupTheFielder(ctx);
    backupTheBases(ctx);
  } else {
    backupTheBases(ctx);
    backupTheFielder(ctx);
  }
}

// --- layer 6: everyone else ----------------------------------------------

function layerRemainder(ctx: Ctx) {
  const live = ctx.throws.length > 0;

  for (const pos of POSITIONS) {
    if (ctx.out.has(pos)) continue;

    // The pitcher's job on a routine infield play is simply to get off the
    // mound toward the line, in case the throw pulls the first baseman off.
    if (pos === 'P' && live && isInfieldBand(ctx.zone.band)) {
      put(
        ctx,
        'P',
        { kind: 'watch' },
        along(ctx.start.P, ctx.bags.first, 18 * ctx.u),
        'Off the mound toward the line — available if the throw pulls the first baseman off.',
        'remainder.pitcher',
      );
      continue;
    }

    put(
      ctx,
      pos,
      { kind: 'watch' },
      ctx.start[pos],
      live ? 'No assignment on this play — holds his position.' : 'Nothing to do here.',
      'remainder.hold',
    );
  }
}

/**
 * Nine men resolved independently can land on top of each other — most often
 * when the ball is fielded right beside a bag. Rather than special-case every
 * such geometry, the least-committed man gives way: a fielder chasing the ball
 * or standing on a base holds his spot, a backup slides.
 */
const ROLE_PRIORITY: Record<Role['kind'], number> = {
  primary: 0, cover: 1, cutoff: 2, relay: 2, trail: 3, backupBase: 4, backupFielder: 5, watch: 6,
};

function layerSpacing(ctx: Ctx) {
  const min = 10 * ctx.u;
  const list = POSITIONS.map((p) => ctx.out.get(p)).filter(Boolean) as Assignment[];

  for (let pass = 0; pass < 4; pass++) {
    let moved = false;

    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const d = dist(a.target, b.target);
        if (d >= min) continue;

        const [fixed, mover] =
          ROLE_PRIORITY[a.role.kind] <= ROLE_PRIORITY[b.role.kind] ? [a, b] : [b, a];
        const away =
          d < 0.01 ? { x: 0, y: 1 } : normalize(sub(mover.target, fixed.target));
        mover.target = add(fixed.target, scale(away, min));
        moved = true;
      }
    }

    if (!moved) break;
  }
}

export function resolvePlay(input: PlayInput): ResolvedPlay {
  const { level, posture } = input.situation;
  const cfg = FIELD_CONFIGS[level];

  const ctx: Ctx = {
    input,
    zone: classify(input.at, level),
    start: alignment(level, posture),
    bags: baseCoords(cfg),
    u: cfg.baseDistance / 90,
    primary: 'P',
    ball: input.at,
    throws: [],
    out: new Map(),
    notes: [],
  };

  const { runners } = input.situation;
  if (runners.first || runners.second || runners.third) {
    ctx.notes.push(
      'Runners are not modelled yet — what follows is the bases-empty play.',
    );
  }

  layerPrimary(ctx);
  layerThrows(ctx);
  layerCutoffRelay(ctx);
  layerCoverage(ctx);
  layerBackups(ctx);
  layerRemainder(ctx);
  layerSpacing(ctx);

  return {
    assignments: POSITIONS.map((p) => ctx.out.get(p)!),
    throws: ctx.throws,
    notes: ctx.notes,
  };
}
