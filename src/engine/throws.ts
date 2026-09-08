/**
 * Where the ball goes after it is fielded.
 *
 * The organising idea is the *lead runner you can actually get*. A force is a
 * play you always have; an unforced runner is a play only if he commits. So the
 * rules below walk down from the lead base, and the first one that yields a
 * real play wins.
 *
 * What is modelled: forces, the standard double play, the drawn-in infield
 * cutting off a run, tag-ups, and the throw ahead of the lead runner on a base
 * hit. What is not: rundowns, first-and-third plays, and the batter-runner
 * taking an extra base while the throw is elsewhere.
 */

import { dist } from '../field/geometry';
import { isInfieldBand } from '../field/zones';
import type { Runners } from '../field/play';
import type { Ctx } from './context';

/** Bases where the runner has nowhere to go back to. */
export function forcedBases(r: Runners) {
  return {
    second: r.first,
    third: r.first && r.second,
    home: r.first && r.second && r.third,
  };
}

const anyRunner = (r: Runners) => r.first || r.second || r.third;

export function layerThrows(ctx: Ctx) {
  const { outcome, situation } = ctx.input;
  const { runners, outs, posture } = situation;
  const infield = isInfieldBand(ctx.zone.band);
  const forced = forcedBases(runners);
  const drawnIn = posture === 'infieldIn' || posture === 'cornersIn';

  let unassisted = false;

  const send = (to: 'first' | 'second' | 'third' | 'home', why: string) => {
    // A fielder standing on the bag does not throw to it — he steps on it.
    if (dist(ctx.ball, ctx.bags[to]) < 12 * ctx.u) {
      if (!unassisted) {
        ctx.notes.push(`He is on top of ${to} — takes it himself, no throw.`);
        unassisted = true;
      }
      return;
    }
    ctx.throws.push({ from: ctx.primary, to });
    ctx.notes.push(why);
  };

  switch (outcome) {
    case 'overFence':
      ctx.notes.push('Gone. Nothing to defend.');
      return;
    case 'foul':
      ctx.notes.push('Foul ball — everyone resets.');
      return;
    case 'noPlay':
      ctx.notes.push('Bunt dies untouched — no throw, hold him to first.');
      return;

    case 'caught': {
      if (outs === 2) {
        ctx.notes.push('Caught for the third out.');
        return;
      }
      // Tag-ups. Only worth a throw from far enough out that a runner would go.
      const deep = ctx.zone.band === 'deep' || ctx.zone.band === 'wall';
      if (runners.third && !infield) {
        send('home', 'Caught with a runner on third — he tags, play at the plate.');
        return;
      }
      if (runners.second && deep) {
        send('third', 'Deep enough for the runner on second to tag — play at third.');
        return;
      }
      ctx.notes.push('Caught — batter is out, no throw.');
      return;
    }

    case 'toWall': {
      if (anyRunner(runners)) {
        send('home', 'Ball to the wall with a runner on — relay home.');
      } else {
        send('third', 'Ball to the wall — batter is going for extra bases.');
      }
      return;
    }

    case 'through':
    case 'drops': {
      // Throw ahead of the lead runner. A man on second or third is heading
      // home; a man on first is heading to third; otherwise it is the batter
      // going to second.
      if (runners.second || runners.third) {
        send('home', 'Base hit with a runner in scoring position — play at the plate.');
      } else if (runners.first) {
        send('third', 'Base hit with a man on first — he is going first to third.');
      } else {
        send('second', 'Base hit — keep him to a single.');
      }
      return;
    }

    case 'bobbled': {
      send('first', 'Knocked down — the play at first is close; make sure of it.');
      return;
    }

    case 'fielded': {
      if (!infield) {
        // Fielded in the outfield: same lead-runner logic as a base hit.
        if (runners.second || runners.third) send('home', 'Play at the plate.');
        else if (runners.first) send('third', 'Man on first is going to third.');
        else send('second', 'Keep him to a single.');
        return;
      }

      // Cut the run off at the plate — but only if the defence is set up for
      // it, or the force means it costs nothing to try.
      if (runners.third && outs < 2 && (drawnIn || forced.home)) {
        send('home', forced.home
          ? 'Bases loaded — take the force at the plate.'
          : 'Infield is in — cut the run off at the plate.');
        if (forced.home) send('first', 'Then across to first for two.');
        return;
      }

      if (outs === 2) {
        send('first', 'Two out — take the sure out at first.');
        return;
      }

      // Force at third is only on when the man fielding it is right there.
      if (forced.third && ctx.primary === '3B' && dist(ctx.ball, ctx.bags.third) < 25 * ctx.u) {
        send('third', 'Runners moving and he is on the bag — force at third.');
        send('first', 'Then across to first for two.');
        return;
      }

      if (forced.second) {
        send('second', 'Force at second — turn two.');
        send('first', 'Then across to first.');
        return;
      }

      send('first', runners.third
        ? 'Infield is back — take the out at first and concede the run.'
        : 'Routine play at first.');
      return;
    }
  }
}
