/**
 * Where the ball goes after it is fielded.
 *
 * The organising idea is the *lead runner you can actually get*. A force is a
 * play you always have; an unforced runner is a play only if he commits. So the
 * rules below walk down from the lead base, and the first one that yields a
 * real play wins.
 *
 * Some of those plays are genuinely undecided at the moment of contact — the
 * defence does not know whether the man on first is going to third until he
 * commits. Those cases return a *branch*: the line the defence plays for, plus
 * the line it plays for if he holds. The resolver runs both and diffs them, so
 * a fielder whose job depends on the read carries both jobs.
 *
 * What is modelled: forces, the standard double play, the drawn-in infield
 * cutting off a run, tag-ups, and the throw ahead of the lead runner on a base
 * hit. What is not: rundowns, first-and-third plays, and the batter-runner
 * taking an extra base while the throw is elsewhere.
 */

import { dist } from '../field/geometry';
import { isInfieldBand } from '../field/zones';
import type { BaseId, Runners } from '../field/play';
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

type Dest = { to: BaseId; why: string };

export type ThrowPlan = {
  throws: Dest[];
  notes: string[];
  /** The other line, and the read that chooses it. */
  branch?: { when: string; throws: Dest[] };
};

const plan = (throws: Dest[], notes: string[] = [], branch?: ThrowPlan['branch']): ThrowPlan => ({
  throws, notes, branch,
});

export function planThrows(ctx: Ctx): ThrowPlan {
  const { outcome, situation } = ctx.input;
  const { runners, outs, posture } = situation;
  const infield = isInfieldBand(ctx.zone.band);
  const forced = forcedBases(runners);
  const drawnIn = posture === 'infieldIn' || posture === 'cornersIn';

  switch (outcome) {
    case 'overFence':
      return plan([], ['Gone. Nothing to defend.']);
    case 'foul':
      return plan([], ['Foul ball — everyone resets.']);
    case 'noPlay':
      return plan([], ['Bunt dies untouched — no throw, hold him to first.']);

    case 'caught': {
      if (outs === 2) return plan([], ['Caught for the third out.']);

      const deep = ctx.zone.band === 'deep' || ctx.zone.band === 'wall';
      if (runners.third && !infield) {
        return plan(
          [{ to: 'home', why: 'Caught with a runner on third — he tags, play at the plate.' }],
          [],
          { when: 'If he does not tag', throws: [] },
        );
      }
      if (runners.second && deep) {
        return plan(
          [{ to: 'third', why: 'Deep enough for the runner on second to tag — play at third.' }],
          [],
          { when: 'If he does not tag', throws: [] },
        );
      }
      return plan([], ['Caught — batter is out, no throw.']);
    }

    case 'toWall': {
      if (anyRunner(runners)) {
        return plan(
          [{ to: 'home', why: 'Ball to the wall with a runner on — relay home.' }],
          [],
          {
            when: 'If the lead runner holds at third',
            throws: [{ to: 'third', why: 'Relay to third instead — he stopped.' }],
          },
        );
      }
      return plan([{ to: 'third', why: 'Ball to the wall — batter is going for extra bases.' }]);
    }

    case 'through':
    case 'drops': {
      // Throw ahead of the lead runner. Whether he actually goes is the read.
      if (runners.second) {
        return plan(
          [{ to: 'home', why: 'Base hit with a runner in scoring position — play at the plate.' }],
          [],
          {
            when: 'If he holds at third',
            throws: [{ to: 'third', why: 'He stopped at third — throw in behind him.' }],
          },
        );
      }
      if (runners.third) {
        return plan(
          [{ to: 'home', why: 'Base hit with a man on third — play at the plate.' }],
          [],
          {
            when: 'If he holds at third',
            throws: [{ to: 'second', why: 'Run concedes — keep the batter out of scoring position.' }],
          },
        );
      }
      if (runners.first) {
        return plan(
          [{ to: 'third', why: 'Base hit with a man on first — he is going first to third.' }],
          [],
          {
            when: 'If he stops at second',
            throws: [{ to: 'second', why: 'He held up — the play is on the bag behind him.' }],
          },
        );
      }
      return plan([{ to: 'second', why: 'Base hit — keep him to a single.' }]);
    }

    case 'bobbled':
      return plan([
        { to: 'first', why: 'Knocked down — the play at first is close; make sure of it.' },
      ]);

    case 'fielded': {
      if (!infield) {
        if (runners.second || runners.third) return plan([{ to: 'home', why: 'Play at the plate.' }]);
        if (runners.first) return plan([{ to: 'third', why: 'Man on first is going to third.' }]);
        return plan([{ to: 'second', why: 'Keep him to a single.' }]);
      }

      if (runners.third && outs < 2 && (drawnIn || forced.home)) {
        const line: Dest[] = [
          {
            to: 'home',
            why: forced.home
              ? 'Bases loaded — take the force at the plate.'
              : 'Infield is in — cut the run off at the plate.',
          },
        ];
        if (forced.home) line.push({ to: 'first', why: 'Then across to first for two.' });
        return plan(line, [], forced.home ? undefined : {
          // An unforced runner has to commit; if he freezes, the play is at first.
          when: 'If he holds at third',
          throws: [{ to: 'first', why: 'Look him back and take the out at first.' }],
        });
      }

      if (outs === 2) return plan([{ to: 'first', why: 'Two out — take the sure out at first.' }]);

      if (forced.third && ctx.primary === '3B' && dist(ctx.ball, ctx.bags.third) < 25 * ctx.u) {
        return plan([
          { to: 'third', why: 'Runners moving and he is on the bag — force at third.' },
          { to: 'first', why: 'Then across to first for two.' },
        ]);
      }

      if (forced.second) {
        return plan([
          { to: 'second', why: 'Force at second — turn two.' },
          { to: 'first', why: 'Then across to first.' },
        ]);
      }

      return plan([
        {
          to: 'first',
          why: runners.third
            ? 'Infield is back — take the out at first and concede the run.'
            : 'Routine play at first.',
        },
      ]);
    }
  }
}

/** Install one line of the plan onto the context. */
export function layerThrows(ctx: Ctx, useBranch = false) {
  const p = planThrows(ctx);
  const line = useBranch && p.branch ? p.branch.throws : p.throws;

  ctx.branchWhen = p.branch?.when;
  ctx.notes.push(...p.notes);

  let unassisted = false;
  for (const d of line) {
    // A fielder standing on the bag does not throw to it — he steps on it.
    if (dist(ctx.ball, ctx.bags[d.to]) < 12 * ctx.u) {
      if (!unassisted) {
        ctx.notes.push(`He is on top of ${d.to} — takes it himself, no throw.`);
        unassisted = true;
      }
      continue;
    }
    ctx.throws.push({ from: ctx.primary, to: d.to });
    ctx.notes.push(d.why);
  }
}
