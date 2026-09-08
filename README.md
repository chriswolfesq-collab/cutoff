# Cutoff

Interactive baseball fielder-positioning diagrams. Pick a situation (runners,
outs, level), say where the ball went and what happened, and see where all nine
fielders should be — who fields it, who covers, who cuts, who backs up.

## Status

Phase 0: field geometry and rendering. No rules engine yet.

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

All field math is in feet, with home plate at the origin, +y toward center field
and +x toward the first-base side. Base distance is a parameter, which is what
lets Youth (60' bases) and Adult (90') share one renderer.

## Develop

    npm install
    npm run dev      # http://localhost:5174
    npm run build
    npm run lint
