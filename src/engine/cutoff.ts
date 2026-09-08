/**
 * Cut and relay.
 *
 * The positions are computed, not stored: a cut man stands on the line from
 * the throw to the base he is cutting, a relay man stands on the line from the
 * outfielder to the base he is relaying to. Only the *choice of man* is
 * authored, and that is where Youth and Adult genuinely differ.
 */

import { along, dist } from '../field/geometry';
import type { Position } from '../field/alignments';
import type { BaseId } from '../field/play';
import { coverPoint, isOutfielder, put, spotOf, type Ctx } from './context';

/** A cut man sets up this far in front of the base he is cutting for. */
const CUT_FROM_BASE = 50;
/** A relay man sets up this far out from the outfielder. */
const RELAY_FROM_OUTFIELDER = 120;
/** The trailer plays this far behind the lead relay man. */
const TRAIL_BEHIND = 20;

/**
 * Who cuts a throw home. The adult convention splits it by where the throw is
 * coming from — the third baseman has the angle on throws from left, the first
 * baseman on everything else. Youth uses the first baseman every time, which is
 * one fewer thing to remember and wrong about as often as a nine-year-old's
 * throw is accurate.
 */
function cutHomeOrder(ctx: Ctx, from: Position): Position[] {
  if (ctx.input.situation.level === 'youth') return ['1B', '3B', 'P'];
  return from === 'LF' ? ['3B', '1B', 'P'] : ['1B', '3B', 'P'];
}

function cutOrder(ctx: Ctx, to: BaseId, from: Position): Position[] {
  switch (to) {
    case 'home':
      return cutHomeOrder(ctx, from);
    case 'third':
      return ['SS', '2B', 'P'];
    default:
      // Throws to second are taken at the bag by whoever covers it; putting a
      // man in front of that throw only gives the runner a free base.
      return [];
  }
}

export function layerCutoffRelay(ctx: Ctx) {
  const relaying = ctx.input.outcome === 'toWall';

  for (const t of ctx.throws) {
    if (!isOutfielder(t.from)) continue;

    const from = spotOf(ctx, t.from);
    const bag = ctx.bags[t.to];
    const span = dist(from, bag);

    if (relaying) {
      assignRelay(ctx, t.from, t.to, span);
      continue;
    }

    const order = cutOrder(ctx, t.to, t.from);
    const who = order.find((p) => !ctx.out.has(p));
    if (!who) continue;

    // In front of the bag, on the line — near enough to redirect the throw,
    // far enough out to still have something on it.
    const offset = Math.min(CUT_FROM_BASE * ctx.u, span * 0.55);
    put(
      ctx,
      who,
      { kind: 'cutoff', on: t },
      along(bag, from, offset),
      `Lines up the throw from ${t.from} to ${t.to} — takes it or lets it through.`,
      `cut.${t.to}`,
    );

    backfill(ctx, who);
  }
}

/**
 * The third baseman going out to cut a throw home leaves third base empty
 * behind him, with a trail runner heading for it. The shortstop takes it.
 */
function backfill(ctx: Ctx, cutMan: Position) {
  if (cutMan !== '3B') return;

  const who = (['SS', '2B'] as Position[]).find((p) => !ctx.out.has(p));
  if (!who) return;

  put(
    ctx,
    who,
    { kind: 'cover', base: 'third' },
    coverPoint(ctx, 'third', ctx.ball),
    'Third baseman went out to cut it — he takes the bag behind him.',
    'cover.third.backfill',
  );
}

/**
 * On a ball to the wall the throw is too long to make in one, so a middle
 * infielder goes out to meet it. Which one is the ball side; what the other one
 * does is the level difference — a youth team keeps him on second base, an
 * adult team sends him out behind the relay on the deepest balls so a bad throw
 * still has somebody to hit.
 */
function assignRelay(ctx: Ctx, from: Position, to: BaseId, span: number) {
  const ballSide: Position = ctx.zone.theta <= 0 ? 'SS' : '2B';
  const other: Position = ballSide === 'SS' ? '2B' : 'SS';

  const lead = ctx.out.has(ballSide) ? other : ballSide;
  if (ctx.out.has(lead)) return;

  const outfielder = spotOf(ctx, from);
  const bag = ctx.bags[to];
  const distanceOut = Math.min(RELAY_FROM_OUTFIELDER * ctx.u, span * 0.55);
  const leadPoint = along(outfielder, bag, distanceOut);

  put(
    ctx,
    lead,
    { kind: 'relay', on: { from, to } },
    leadPoint,
    `Goes out as the relay man — lines up ${from} to ${to}.`,
    'relay.lead',
  );

  const spare = lead === ballSide ? other : ballSide;
  if (ctx.out.has(spare)) return;

  const tandem = ctx.input.situation.level === 'adult' && ctx.zone.band === 'wall';

  if (tandem) {
    put(
      ctx,
      spare,
      { kind: 'trail', behind: lead },
      along(leadPoint, outfielder, TRAIL_BEHIND * ctx.u),
      `Trails the relay — if the throw sails over ${lead}, he is the one who has it.`,
      'relay.trail',
    );
  } else {
    put(
      ctx,
      spare,
      { kind: 'cover', base: 'second' },
      coverPoint(ctx, 'second', outfielder),
      'Stays home on second while the relay goes out.',
      'relay.coverSecond',
    );
  }
}
