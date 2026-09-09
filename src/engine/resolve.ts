/**
 * The resolver: a play in, nine assignments out.
 *
 * Layers run in order, each claiming fielders the previous layers left free.
 * That ordering is the whole design — primary first because everything else
 * keys off who has the ball, cut and relay before coverage because a cut man
 * has to be claimed before the bases take the middle infielders, and backups
 * last because they are whoever is left over standing nearest the throw.
 */

import {
  FIELD_CONFIGS,
  along,
  bases as baseCoords,
  type Point,
} from '../field/geometry';
import { alignment, POSITIONS, type Position } from '../field/alignments';
import { classify, isInfieldBand } from '../field/zones';
import { outfieldOwnerAt, primaryFor } from '../field/primary';
import { roleKey, type Assignment, type ResolvedPlay } from '../field/assignment';
import type { BaseId, PlayInput } from '../field/play';
import {
  BACKUP_ORDER,
  BACKUP_TRAIL,
  backupPoint,
  catcherBackupPoint,
  coverPoint,
  free,
  isOutfielder,
  put,
  spaceOut,
  spotOf,
  type Ctx,
} from './context';
import { layerThrows } from './throws';
import { layerCutoffRelay } from './cutoff';
import { buildPhases } from './phases';
import { buildRundown, rundownTarget } from './rundown';

// --- layer 1: who has the ball -------------------------------------------

function layerPrimary(ctx: Ctx) {
  const { outcome } = ctx.input;
  const call = primaryFor(ctx.zone, ctx.input.ball, ctx.input.situation.level);

  // A ball that gets *through* the infield belongs to the outfielder behind
  // it. A ball that merely drops in does not: a popup that falls twelve feet
  // from the plate is still the catcher's, not the left fielder's.
  const throughToOutfield =
    outcome === 'through' && isInfieldBand(ctx.zone.band) && ctx.zone.band !== 'bunt';

  if (throughToOutfield) {
    const of = outfieldOwnerAt(ctx.zone.theta);
    // The click marks where the ball crossed the infield, not where it is
    // fielded. Leaving it there puts an outfielder on the lip of the infield
    // dirt and makes every throw off him nonsense, so carry it out to where he
    // would actually come up with it.
    const rad = ctx.zone.theta * (Math.PI / 180);
    const reach = Math.max(ctx.zone.r, 165 * ctx.u);
    ctx.ball = { x: reach * Math.sin(rad), y: reach * Math.cos(rad) };
    ctx.primary = of;
    put(ctx, of, { kind: 'primary' }, ctx.ball, 'Ball got through the infield — he charges and cuts it off.', 'primary.through');
    ctx.notes.push(`Ball beat the ${call.position}.`);
    return;
  }

  ctx.primary = call.position;
  put(ctx, call.position, { kind: 'primary' }, ctx.ball, call.why, call.ruleId);
}

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

function assignCover(ctx: Ctx, base: BaseId, from: Point, whyOverride?: string): Position | undefined {
  const { order, why, ruleId } = coverCandidates(ctx, base);
  const who = order.find((p) => !ctx.out.has(p)) ?? POSITIONS.find((p) => !ctx.out.has(p));
  if (!who) return undefined;
  put(ctx, who, { kind: 'cover', base }, coverPoint(ctx, base, from), whyOverride ?? why, ruleId);
  return who;
}

function layerCoverage(ctx: Ctx) {
  ctx.throws.forEach((t, i) => {
    const who = assignCover(ctx, t.to, spotOf(ctx, t.from));
    // The man who takes a throw is the man who makes the next one. On a 6-4-3
    // the relay to first comes off the second baseman, not off the shortstop
    // who started it.
    const next = ctx.throws[i + 1];
    if (who && next) next.from = who;
  });

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

  /**
   * A throw going home or to third goes over second base, and the batter-runner
   * is running in behind it. One of the middle infielders takes the bag — but
   * only if one is actually free: on a relay they are both out there already,
   * and dragging the pitcher over would be worse than leaving it open.
   */
  if (
    ctx.throws.length > 0 &&
    !isInfieldBand(ctx.zone.band) &&
    !ctx.throws.some((t) => t.to === 'second') &&
    ![...ctx.out.values()].some((a) => a.role.kind === 'cover' && a.role.base === 'second')
  ) {
    const order: Position[] = ctx.zone.theta <= 0 ? ['2B', 'SS'] : ['SS', '2B'];
    const who = order.find((p) => !ctx.out.has(p));
    if (who) {
      put(
        ctx,
        who,
        { kind: 'cover', base: 'second' },
        coverPoint(ctx, 'second', ctx.ball),
        'Batter-runner is coming in behind the throw — he takes second.',
        'cover.second.behindThrow',
      );
    }
  }

  // On an infield play the batter-runner is headed to first whether or not the
  // throw goes there. On a base hit to the outfield he is not contested at all
  // — putting a man on the bag there only takes him out of the relay.
  if (
    isInfieldBand(ctx.zone.band) &&
    ctx.throws.length > 0 &&
    !ctx.throws.some((t) => t.to === 'first')
  ) {
    assignCover(ctx, 'first', ctx.ball);
  }
}

// --- layer 5: backups ----------------------------------------------------

/** Somebody gets in behind the man with the ball. */
function backupTheFielder(ctx: Ctx) {
  const primaryAt = spotOf(ctx, ctx.primary);
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

  const candidatesFor = (to: BaseId, round: number) => {
    // The catcher genuinely cannot do this one — on a ball to the outfield he
    // is needed at the plate, so he is excluded outright.
    const eligible = BACKUP_ORDER[to].filter((w) => !(w === 'C' && !infield));
    // Preferring the outfielder away from the ball is only a preference: if he
    // is already spoken for, a backed-up bag beats a tidy one.
    const awkward = (who: Position) =>
      (who === 'RF' && to === 'second' && ctx.zone.theta > 0) ||
      (who === 'LF' && to === 'second' && ctx.zone.theta <= 0);
    // A second backup is a luxury. Taking it with the outfielder on the wrong
    // side of the throw sends him across the field in front of it, which is
    // worse than the bag having one man behind it.
    if (round > 0) return eligible.filter((w) => !awkward(w));
    return [...eligible.filter((w) => !awkward(w)), ...eligible.filter(awkward)];
  };

  const countAt = (to: BaseId) =>
    [...ctx.out.values()].filter((a) => a.role.kind === 'backupBase' && a.role.base === to).length;

  /**
   * Two rounds, not two-at-a-time. On a double play the throw to second comes
   * first in the list, and taking both its backups before first base is even
   * considered would send the right fielder to the wrong bag — he backs up
   * first, always, and that has to survive being second in the queue.
   */
  for (let round = 0; round < 2; round++) {
    for (const t of ctx.throws) {
      const taken = countAt(t.to);
      if (taken > round) continue;

      const who = candidatesFor(t.to, round).find((w) => !ctx.out.has(w));
      if (!who) continue;

      const why =
        who === 'C'
          ? 'Trails the runner up the line and backs up the throw.'
          : `Backs up the throw to ${t.to}, in line behind the bag.`;
      const spot =
        who === 'C'
          ? catcherBackupPoint(ctx, t.to)
          : backupPoint(ctx, t.to, spotOf(ctx, t.from), taken);

      put(ctx, who, { kind: 'backupBase', base: t.to, on: t }, spot, why, `backup.${t.to}`);
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
  const primaryIsOutfielder = isOutfielder(ctx.primary);

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

function layerSpacing(ctx: Ctx) {
  spaceOut(POSITIONS.map((p) => ctx.out.get(p)).filter(Boolean) as Assignment[], 10 * ctx.u);
}

/** One pass of the layers, on whichever line of the throw plan was asked for. */
function resolveOnce(input: PlayInput, branchIndex: number | null): Ctx {
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

  layerPrimary(ctx);
  layerThrows(ctx, branchIndex);
  layerCutoffRelay(ctx);
  layerCoverage(ctx);
  layerBackups(ctx);
  layerRemainder(ctx);
  layerSpacing(ctx);

  return ctx;
}

export function resolvePlay(input: PlayInput): ResolvedPlay {
  const main = resolveOnce(input, null);
  const assignments = POSITIONS.map((p) => main.out.get(p)!);
  const cfg = FIELD_CONFIGS[input.situation.level];

  /** Attach the rundown a throw could lead to, if any. */
  const withRundown = (play: ResolvedPlay): ResolvedPlay => {
    const target = rundownTarget(play);
    if (!target) return play;
    const rundown = buildRundown(play, input.situation, cfg, target);
    return rundown ? { ...play, rundown } : play;
  };

  // Resolve every other line the throw could take and diff it against the one
  // being played for. Anything that moves or changes job is something this
  // fielder has to read the throw for.
  const branches: NonNullable<ResolvedPlay['branches']> = [];

  (main.branches ?? []).forEach(({ when }, i) => {
    const alt = resolveOnce(input, i);
    branches.push({ when, throws: alt.throws });

    for (const a of assignments) {
      const b = alt.out.get(a.position);
      if (!b) continue;

      // "If he holds, you have nothing to do" is not a read worth drawing —
      // the man is already shown with the job he has. Picking one *up* on the
      // other line is worth drawing, and so is swapping one for another.
      if (b.role.kind === 'watch') continue;

      // Same job a few feet over is not a read. Only a different job is worth
      // putting in front of somebody as a decision.
      if (roleKey(a.role) === roleKey(b.role)) continue;

      a.alternatives = [
        ...(a.alternatives ?? []),
        { when, role: b.role, target: b.target, why: b.why, ruleId: b.ruleId },
      ];
    }
  });

  return withRundown({
    assignments,
    throws: main.throws,
    notes: main.notes,
    ballAt: main.ball,
    phases: buildPhases(main),
    ...(branches.length > 0 ? { branches } : {}),
  });
}
