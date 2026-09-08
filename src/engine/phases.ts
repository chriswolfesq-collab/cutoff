/**
 * The play as a sequence: the set, contact, then one step per throw.
 *
 * The point of this is the runners. A diagram of nine fielders standing in the
 * right places does not explain *why* they are there; a runner halfway to third
 * does. So each phase carries where every runner is, and the fielders'
 * positions read as answers to that.
 */

import { along, type Point } from '../field/geometry';
import type { PlayPhase, RunnerId, RunnerSpot } from '../field/assignment';
import type { BaseId } from '../field/play';
import { isInfieldBand } from '../field/zones';
import type { Ctx } from './context';

/** Where each runner starts and where he is headed. */
const ROUTE: Record<RunnerId, { from: BaseId; to: BaseId }> = {
  batter: { from: 'home', to: 'first' },
  first: { from: 'first', to: 'second' },
  second: { from: 'second', to: 'third' },
  third: { from: 'third', to: 'home' },
};

/**
 * Who is actually running.
 *
 * On a ball in play everyone goes. On a catch nobody does except a man tagging
 * up, and the throw the defence chose is what tells us who that is — a throw
 * home means the runner on third tagged, a throw to third means the man on
 * second did.
 */
function advancing(ctx: Ctx): Set<RunnerId> {
  const { runners } = ctx.input.situation;
  const going = new Set<RunnerId>();

  if (ctx.input.outcome === 'caught') {
    const to = ctx.throws[0]?.to;
    if (to === 'home' && runners.third) going.add('third');
    if (to === 'third' && runners.second) going.add('second');
    return going;
  }

  if (ctx.input.outcome === 'overFence' || ctx.input.outcome === 'foul') return going;

  going.add('batter');
  if (runners.first) going.add('first');
  if (runners.second) going.add('second');
  if (runners.third) going.add('third');
  return going;
}

/** A runner not going anywhere stands a lead off his bag. */
function leadOff(ctx: Ctx, id: RunnerId): Point {
  const { from } = ROUTE[id];
  const back: BaseId = id === 'second' ? 'first' : id === 'third' ? 'second' : 'home';
  return along(ctx.bags[from], ctx.bags[back], 14 * ctx.u);
}

function spots(ctx: Ctx, going: Set<RunnerId>, progress: number): RunnerSpot[] {
  const { runners } = ctx.input.situation;
  const present: RunnerId[] = ['batter'];
  if (runners.first) present.push('first');
  if (runners.second) present.push('second');
  if (runners.third) present.push('third');

  return present.map((id) => {
    if (!going.has(id)) return { id, at: leadOff(ctx, id), moving: false };

    const { from, to } = ROUTE[id];
    const a = ctx.bags[from];
    const b = ctx.bags[to];
    const at = { x: a.x + (b.x - a.x) * progress, y: a.y + (b.y - a.y) * progress };
    return { id, at, moving: progress > 0 && progress < 1 };
  });
}

export function buildPhases(ctx: Ctx): PlayPhase[] {
  const going = advancing(ctx);

  // The set: everyone on their bag, nothing has happened yet.
  const phases: PlayPhase[] = [
    { index: 0, label: 'Set', runners: spots(ctx, new Set(), 0) },
  ];

  const live = 1 + ctx.throws.length;
  const contactLabel = isInfieldBand(ctx.zone.band) ? 'Contact' : 'Ball lands';
  phases.push({ index: 1, label: contactLabel, runners: spots(ctx, going, 0) });

  ctx.throws.forEach((t, i) => {
    // Runners cover a full base over the course of the throws, so the last one
    // shows them arriving rather than still in the air.
    const progress = live > 1 ? (i + 1) / (live - 1) : 1;
    phases.push({
      index: i + 2,
      label: ctx.throws.length > 1 ? `Throw ${i + 1}: ${t.from} to ${t.to}` : `Throw to ${t.to}`,
      activeThrow: t,
      runners: spots(ctx, going, Math.min(1, progress)),
    });
  });

  return phases;
}
