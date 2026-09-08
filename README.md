# Cutoff

Interactive baseball fielder-positioning diagrams. Pick a situation (runners,
outs, level), say where the ball went and what happened, and see where all nine
fielders should be — who fields it, who covers, who cuts, who backs up.

## Status

Phase 1: the data layer. Situation schema, zone map, outcome rules and posture
tables are in; the rules engine (phase 2) is not.

You can set a situation, pick a ball type, click anywhere on the field and see
which zone it lands in and who owns it. That is the phase-1 deliverable — a zone
map you cannot see is a zone map you cannot check.

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

## Develop

    npm install
    npm run dev      # http://localhost:5174
    npm run build
    npm run lint

## Next

Phase 2: the resolver layers — primary, throw prediction, cutoff/relay, base
coverage, backups. Phase 5 adds the golden corpus, which needs a test runner
(vitest) and will bring a `tools/` dump script for reviewing the tables without
the UI.
