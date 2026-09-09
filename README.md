# Cutoff

**[Try it](https://chriswolfesq-collab.github.io/cutoff/)**

Interactive baseball fielder-positioning diagrams. Pick a situation (runners,
outs, level), say where the ball went and what happened, and see where all nine
fielders should be — who fields it, who covers, who cuts, who backs up.

Every scenario has its own link, so a play can be sent to somebody:
[a single to left with a man on second](https://chriswolfesq-collab.github.io/cutoff/#lvl=youth&r=2&o=1&d=normal&bh=R&b=fly&x=-84&y=141&res=drops).

**[The playbook](playbook.md)** is every convention the engine encodes, generated
by running it. It opens with the seventeen calls most worth arguing about, each
tagged with the rule id that produced it. If you disagree with one, quote the id.

## Status

The first baseman trailing the runner — the last thing on the original gap list.

On a ball to the outfield the batter-runner is rounding first, and if the first
baseman is not cutting the throw he has nothing else to do, so he goes with him
and stays between him and the bag. That is what puts a man at first if the
runner gets hung up between first and second — the rundown module already named
the first baseman as the receiver there, and this is what actually gets him
there.

It also produced the first case of a fielder reaching the same job by two
different reads: on a single with a man on second he cuts the throw home, and if
*either* the lead runner holds or the batter rounds hard, he is trailing
instead. Those collapse into one line naming both conditions rather than the
same alternative printed twice.

Secondary coverage. The throw to first is the one that regularly needs two men:
whoever is covering is usually arriving on the run and from an angle — a pitcher
off the mound, a second baseman crossing behind him — and if he does not beat
the runner there, somebody has to.

That needed a role the union did not have. It is not `cover`, which takes the
throw, and it is not `backupBase`, which stands behind the bag for a throw that
gets away. The second man is *at* the bag, behind the cover, and takes the throw
itself.

It also retires a fudge. The pitcher used to fall through to a catch-all that
gave him `watch` with a reason describing exactly this job — "off the mound
toward the line, available if the throw pulls the first baseman off". He now
has the job the reason was describing.

The batter-runner taking an extra base. While the throw is going to the plate or
to third, he is rounding first behind it — and the man cutting it is the only
one in a position to take him.

Rather than special-case that, it retired a limitation. A read used to have
exactly two lines; now a play carries a **list** of them, and the batter
rounding is simply another line the throw could take. So a base hit with a man
on second now resolves three ways — throw home, throw to third if he holds,
throw to second if the batter gets greedy — and every fielder is shown each line
he has a different job on.

He is drawn rounding the bag rather than stopped on it, cutting the corner the
way a runner actually does.

Pickoffs. With a runner anywhere, the play offers to go after him: six plays
across the three bases, from the pitcher or from the catcher.

Two things are the same on every one of them, and they are the whole reason the
feature is worth having. **Nobody stands on the bag before the throw** — getting
there early is what tells the runner it is coming, so the man covering is
somewhere else at the first phase and arrives with the ball at the second. And
**every throw is backed up**, because one that gets away hands over the base you
were trying to take; at second it scores him.

Pickoffs and first-and-third now share one entry strip — *no pitch put in play* —
because they are the same kind of thing and only one of them can be live.

First and third. With runners on first and third, the play offers a path with
no batted ball at all: the runner on first goes, and the defence has to weigh an
out at second against a run scoring from third.

That weighing is a coaching decision, not something an engine should make — it
depends on the score, the inning and who is running. So the **call is an input**,
the way the defensive posture is, and what the app produces is the mechanics of
each call rather than a recommendation between them. Five are modelled: throw
through, pitcher cuts, middle infielder cuts, snap throw behind to third, hold.

The two cut calls reuse the conditional machinery — the man cutting it carries
`If the runner on third breaks → cuts it and throws home`, drawn as a ring
around him rather than a ghost elsewhere, because that read changes his job
without moving him.

**This is the least reliable thing in the codebase.** First-and-third defences
are the most system-dependent area in the game, and a programme running
different names and different responsibilities is not wrong. Two claims are
flagged at the top of [`playbook.md`](playbook.md) for exactly this reason,
including the one
I am least confident in anywhere: that the shortstop covers second against a
right-handed hitter and the second baseman against a left-hander.

Rundowns. A throw to second, third or home can leave a runner hung up between
that bag and the one behind it, and the play offers to follow it there.

A rundown is not a set of positions, it is a rotation: drive him back toward the
base he came from so that beating the tag gains him nothing, make one throw, and
sprint to the back of the line behind the man you threw to. That last part is
the only place in the engine where a fielder's job genuinely changes partway
through a play — which is what the phase model was built for.

Two things fall out of the model rather than being chosen. The man with the ball
is whoever took the throw, so the chase starts from the right end without anyone
saying so. And the runner who gets hung up is the *lead* runner heading for that
bag, not whoever started on the base behind — a man scoring from second is
caught between third and home, having never stopped at third.

Conditional assignments. Some throws are not decided at contact — the defence
does not know whether the man on first is going to third until he commits. Those
plays resolve **twice**: the line the defence plays for, and the line it plays
for if the runner holds. Any fielder whose job differs between the two carries
both, drawn on the field as a dashed marker.

That produces the textbook case without anyone authoring it: on a base hit to
left with a man on second, the pitcher gets `backup:home` with an alternative of
`backup:third` — back up third or home depending on the throw.

Two rules keep it honest. The alternative is a *real resolved play*, never a
hand-written guess, so it cannot drift from the rules that produced the main
line. And an alternative is only recorded when it is a genuine job: "if he
holds, you have nothing to do" is not a read worth drawing.

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

Phase 5: review packet. [`playbook.md`](playbook.md) covers every authored
convention, not
just the zone map — the document exists so the coach review can happen. It has
not happened yet, and it is the last real validation gap.

Phase 4: the play as a sequence. A scrubber steps through the set, contact and
each throw, with the runners moving and one throw in the air at a time.

Known gaps, all deliberate:

- **The defence is always shown playing for the runner going**, with the other
  lines as reads off it.
- **Nothing changes between *phases*.** A fielder's job can depend on the read,
  but not on where an earlier throw in the same play went.
- A rundown between home and first
  is not offered either: it needs a dropped third strike or a misplayed bunt,
  not a batted ball being fielded.
- **A rundown is one throw.** The real thing can take three; the model shows the
  mechanics you are trying to execute, not a simulation of failing to.
- **The batter-runner is not tracked past his first destination** — nobody
  reacts to him taking an extra base while the throw is elsewhere.
- **Only first base gets a second man.** No other bag has one, on the grounds
  that the cover there is standing still rather than arriving on the run.
- **On a steal the first baseman does not trail**, because the runner is gone
  and there is nothing to follow — he simply comes off the bag.
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

**The playbook snapshot** ([`playbook.md`](playbook.md), built by
`src/engine/playbook.ts`) is
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
so they lock in behaviour but cannot vouch for it. [`playbook.md`](playbook.md)
exists to make
that review possible; it has not happened.

## Develop

    npm install
    npm run dev      # http://localhost:5174
    npm run build
    npm run lint

Every push to `main` builds and publishes to GitHub Pages. The tests run first
and a failure stops the deploy, so a broken invariant does not reach the site.

## Next

Phase 3: the resolver layers — primary, throw prediction, cutoff/relay, base
coverage, backups. Runners and cut/relay are next, with the test net already under them.
