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
  return along(ctx.bags[base], from, 4 * ctx.u);
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
 * First base: normally the first baseman, but he is the one fielder who is
 * regularly pulled off it — by the ball, or by a posture that has him charging.
 */
function coverFirst(ctx: Ctx): { who: Position; why: string; ruleId: string } {
  const { posture } = ctx.input.situation;
  const charging = posture === 'cornersIn' || posture === 'infieldIn';

  if (ctx.primary === '1B')
    return { who: 'P', why: 'First baseman fielded it — pitcher covers the bag.', ruleId: 'cover.first.pitcher' };

  if (charging && isInfieldBand(ctx.zone.band))
    return { who: '2B', why: 'First baseman is charging — second baseman takes the bag.', ruleId: 'cover.first.second' };

  return { who: '1B', why: 'First baseman takes the throw.', ruleId: 'cover.first' };
}

/** Second base: the middle infielder away from the ball. */
function coverSecond(ctx: Ctx): { who: Position; why: string; ruleId: string } {
  const toLeftSide = ctx.zone.theta <= 0;
  const preferred: Position = toLeftSide ? '2B' : 'SS';
  const other: Position = toLeftSide ? 'SS' : '2B';
  const who = ctx.out.has(preferred) ? other : preferred;
  return {
    who,
    why: `Ball is to the ${toLeftSide ? 'left' : 'right'} side — the ${who} covers second.`,
    ruleId: 'cover.second',
  };
}

function layerCoverage(ctx: Ctx) {
  for (const t of ctx.throws) {
    const from = ctx.out.get(t.from)?.target ?? ctx.ball;

    if (t.to === 'first') {
      const { who, why, ruleId } = coverFirst(ctx);
      put(ctx, who, { kind: 'cover', base: 'first' }, coverPoint(ctx, 'first', from), why, ruleId);
    } else if (t.to === 'second') {
      const { who, why, ruleId } = coverSecond(ctx);
      put(ctx, who, { kind: 'cover', base: 'second' }, coverPoint(ctx, 'second', from), why, ruleId);
    } else if (t.to === 'third') {
      const who = ctx.out.has('3B') ? 'SS' : '3B';
      put(ctx, who, { kind: 'cover', base: 'third' }, coverPoint(ctx, 'third', from), `${who} covers third.`, 'cover.third');
    } else {
      const who = ctx.out.has('C') ? 'P' : 'C';
      put(ctx, who, { kind: 'cover', base: 'home' }, coverPoint(ctx, 'home', from), `${who} covers the plate.`, 'cover.home');
    }
  }

  // Nobody is throwing there, but second base is not left open: if the throw
  // to first gets away, that is the base the batter-runner goes to.
  if (
    isInfieldBand(ctx.zone.band) &&
    ctx.throws.some((t) => t.to === 'first') &&
    !ctx.throws.some((t) => t.to === 'second')
  ) {
    const { who } = coverSecond(ctx);
    if (!ctx.out.has(who)) {
      put(
        ctx,
        who,
        { kind: 'cover', base: 'second' },
        coverPoint(ctx, 'second', ctx.ball),
        'No play here, but he takes second in case the throw to first gets away.',
        'cover.second.trailing',
      );
    }
  }

  // The batter-runner is always headed to first, even with no throw there.
  if (!ctx.throws.some((t) => t.to === 'first') && ctx.throws.length > 0) {
    const { who, why, ruleId } = coverFirst(ctx);
    put(ctx, who, { kind: 'cover', base: 'first' }, coverPoint(ctx, 'first', ctx.ball), why, ruleId);
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

function layerBackups(ctx: Ctx) {
  const infield = isInfieldBand(ctx.zone.band);

  /**
   * Backing up the man with the ball comes first. A throw that gets past a bag
   * costs a base; a ball that gets past the outfielder costs three, so this
   * claims its man before the bases do.
   */
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

  for (const t of ctx.throws) {
    const from = ctx.out.get(t.from)?.target ?? ctx.ball;

    let taken = 0;
    for (const who of BACKUP_ORDER[t.to]) {
      if (taken >= 2) break;
      if (ctx.out.has(who)) continue;

      // The catcher can only trail the runner up the line when the ball stayed
      // in the infield; on a base hit he stays home.
      if (who === 'C' && !infield) continue;
      // The outfielder on the ball side is busy backing up his own man.
      if (who === 'RF' && t.to === 'second' && ctx.zone.theta > 0) continue;
      if (who === 'LF' && t.to === 'second' && ctx.zone.theta <= 0) continue;

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

  return {
    assignments: POSITIONS.map((p) => ctx.out.get(p)!),
    throws: ctx.throws,
    notes: ctx.notes,
  };
}
