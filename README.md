# Cutoff

Interactive baseball fielder-positioning diagrams. Pick a situation (runners,
outs, level), say where the ball went and what happened, and see where all nine
fielders should be — who fields it, who covers, who cuts, who backs up.

## Status

Phase 6: drill mode and permalinks.

**Drill mode** deals a situation and asks who has one of the jobs on it — the
cutoff man, who covers second, who backs up third. You answer by clicking the
fielder. Questions are generated from a *resolved play* rather than a question
bank, so a drill can never disagree with the diagram beside it; when a rule
changes, the drills change with it. Locations are curated rather than uniformly
random, because a random point on the field mostly produces balls nobody would
think twice about.

**Permalinks** put the whole scenario in the fragment, so a play can be sent to
somebody. Everything is validated on the way back in — a hand-edited or
truncated link falls back to defaults rather than putting the app in a state the
engine was never asked about.

**Ruleset presets** were the third item on this phase, and Youth/Adult already
is that mechanism — it is a swappable playbook, not a change of dimensions (see
below). A third preset would mean inventing more conventions nobody has reviewed
yet, which makes the tool worse rather than better. It waits on the review.

Phase 5: review packet. `playbook.md` now covers every authored convention, not
just the zone map — the document exists so the coach review can happen. It has
not happened yet, and it is the last real validation gap.

Phase 4: the play as a sequence. A scrubber steps through the set, contact and
each throw, with the runners moving and one throw in the air at a time.

Known gaps, all deliberate:

- **Nobody's *assignment* changes mid-play.** Fielders hold one job throughout,
  which is true of every situation the rules currently produce — no throw in the
  engine is conditional on where an earlier one went. When conditional jobs
  arrive ("back up third *or* home depending on the throw"), `Assignment.phase`
  is where they go; the phase model is already under them.
- **No rundowns, no first-and-third plays, no pickoffs.**
- **The batter-runner is not tracked past his first destination** — nobody
  reacts to him taking an extra base while the throw is elsewhere.
- **No secondary coverage.** On a ball to the right side the second baseman
  should break to first behind the pitcher; expressing that needs a notion of
  secondary assignment the `Role` union does not have yet.
- **The first baseman does not trail the runner on a base hit.** He is left
  idle rather than given a job nobody is confident about.

### The resolver

Layers run in order, each claiming fielders the previous ones left free:

    primary -> throws -> cutoff/relay -> coverage -> backups -> remainder -> spacing

The ordering is the design:

- **primary** first, because everything keys off who has the ball
- **cut and relay** before coverage, because a cut man has to be claimed before
  the bases take the middle infielders
- **backups** last, because they are whoever is left standing nearest the throw
- **spacing** cleans up afterwards: nine men resolved independently can land on
  each other, so the least-committed one gives way

Within backups, *backing up the man with the ball* is claimed before *backing up
a bag* when an outfielder has it — a throw past a base costs one base, a ball
past an outfielder costs three — and the other way round when an infielder does,
because then there is nothing to get past him.

The engine is split across four files: `context.ts` (shared state and the
geometry helpers), `throws.ts` (where the ball goes, the runner rules),
`cutoff.ts` (cut and relay, where Youth and Adult genuinely differ) and
`resolve.ts` (everything else, plus the orchestration).

### Phases

A play is the set, then contact, then one step per throw. What moves between
phases is the ball, the runners, and which throw is live — the fielders hold
their positions, because under the current rules their jobs do not change.

The runners are the point. Nine fielders standing in the right places does not
explain *why* they are there; a runner halfway to third does. A throw's origin
chains through its receiver, so a 6-4-3 reads as `SS to second` then
`2B to first` rather than two arrows off the shortstop.

### Throw prediction

The organising idea is the *lead runner you can actually get*. A force is a play
you always have; an unforced runner is a play only if the defence is set up for
it. So the rules walk down from the lead base and the first one that yields a
real play wins — which is why the infield being in is what decides whether a
ground ball goes home or to first with a man on third.

### Youth vs Adult

Two places where the level is not just a change of dimensions:

| | Youth | Adult |
|---|---|---|
| Cutoff on throws home | 1B every time | 3B from left field, 1B otherwise |
| Ball to the wall | One relay man; the other stays on second | Lead relay plus a trailer behind him |

## Design notes

Assignments are **symbolic**, positions are **computed**. The engine will emit
roles with reference points ("cut the throw from LF to home"), and geometry
derives the coordinates:

- cutoff = on the line from throw origin to destination, ~45–60 ft off the base
- relay = same line, ~110–140 ft from the outfielder
- backup = base + unit vector away from throw origin × ~30 ft, clipped to the field
- trail = lead man's point + 15–20 ft back along the same line

That keeps the playbook to a few hundred rules instead of thousands of
hand-authored coordinate rows, and makes every position self-explaining.

### Zones

Zones are polar — an angle off dead center and a distance from home — not drawn
polygons. That matches how the game is described ("in the hole", "down the
line", "shallow right-center") and it scales between levels for free.

Sector edges fall *between* the fielders rather than on them: with adult spacing
the infielders sit near -34/-16/+14/+33 degrees, which puts the holes at roughly
-25 and +23. Outfield depth bands are a fraction of the distance to the fence at
that angle, so "deep" means deep for where the ball actually is — 312' down the
line and 375' to center both read as deep in a 330/400 park.

### Where the work is split

`primary.ts` is **data**: which fielder owns which zone, flat tables. Phase 2's
resolver is **logic**: priority calls, situational coverage, backups. Keeping
those apart is what stops the playbook turning into a pile of special cases.

All field math is in feet, with home plate at the origin, +y toward center field
and +x toward the first-base side. Base distance is a parameter, which is what
lets Youth (60' bases) and Adult (90') share one renderer.

## Tests

    npm test

Three layers, and they do different jobs.

**Invariants** (`src/engine/invariants.test.ts`) sweep ~9,200 plays — every
plausible level, spot, ball type and outcome — and assert the output is never
*malformed*: all nine fielders assigned exactly once, every base taking a throw
has somebody on it and somebody behind it, no two men sent to the same spot,
nobody outside the park, the primary always at the ball. These say nothing about
whether the baseball is right; they catch the failures that are invisible in a
table and obvious on a field.

**The golden corpus** (`src/engine/corpus.ts`) is ~20 canonical plays with
hand-authored expectations, written as role keys — `cover:first`,
`backup:second`, `backupFielder:LF`. Each asserts only the fielders it speaks
to, so an unrelated rule change does not break every scenario. A failure here
means the baseball changed; read the diff before touching the expectation.

**Drill and link tests** (`src/engine/drill.test.ts`, `src/urlState.test.ts`)
cover the two things those features can get quietly wrong: a drill accepting a
fielder who does not actually hold that job, and a link that does not survive a
round trip or that lets junk through into the engine.

**The playbook snapshot** (`playbook.md`, built by `src/engine/playbook.ts`) is
the review packet. It is generated by running the engine, so it is what the app
actually does rather than a description of what it is meant to do, and it covers
every authored convention: who owns each zone, where the throw goes for all
eight base states at every out count, who cuts and who relays at each level, who
covers first, and the backup order. It opens with the ten calls most worth
arguing about, each tagged with its rule id.

Because it is a snapshot, changing a convention arrives as a diff in plain
English. Accept an intended change with `npx vitest -u`.

**Still missing: nobody who actually coaches has reviewed it.** The corpus
expectations were reasoned out from the rules, by the same hand that wrote them,
so they lock in behaviour but cannot vouch for it. `playbook.md` exists to make
that review possible; it has not happened.

## Develop

    npm install
    npm run dev      # http://localhost:5174
    npm run build
    npm run lint

## Next

Phase 3: the resolver layers — primary, throw prediction, cutoff/relay, base
coverage, backups. Runners and cut/relay are next, with the test net already under them.
