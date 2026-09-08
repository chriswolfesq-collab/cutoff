/**
 * Who the ball belongs to: zone -> fielder.
 *
 * This is data, not logic. Phase 2's resolver consumes it and layers on the
 * situational parts (priority calls, who ends up taking it when two fielders
 * can reach it, what happens when the primary is drawn out of position).
 */

import type { Position } from './alignments';
import { FIELD_CONFIGS, type Level } from './geometry';
import {
  isInfieldBand,
  OUTFIELD_SECTORS,
  type InfieldSector,
  type OutfieldSector,
  type Zone,
} from './zones';

/** Straight-up sector ownership at normal infield depth. */
const INFIELD_OWNER: Record<InfieldSector, Position> = {
  '3B_line': '3B',
  '3B': '3B',
  '5_6_hole': 'SS',
  SS: 'SS',
  middle_L: 'SS',
  middle_R: '2B',
  '2B': '2B',
  '3_4_hole': '2B',
  '1B': '1B',
  '1B_line': '1B',
};

/** The center fielder has the gaps — he's moving in on the ball, they aren't. */
const OUTFIELD_OWNER: Record<OutfieldSector, Position> = {
  LF_line: 'LF',
  LF: 'LF',
  LC_gap: 'CF',
  CF: 'CF',
  RC_gap: 'CF',
  RF: 'RF',
  RF_line: 'RF',
};

/** Bunts and swinging dribblers belong to the battery and the corners. */
const BUNT_OWNER: Record<InfieldSector, Position> = {
  '3B_line': '3B',
  '3B': '3B',
  '5_6_hole': '3B',
  SS: 'P',
  middle_L: 'P',
  middle_R: 'P',
  '2B': '1B',
  '3_4_hole': '1B',
  '1B': '1B',
  '1B_line': '1B',
};

/** Which outfielder is behind a given angle — used when a ball gets through. */
export function outfieldOwnerAt(theta: number): Position {
  const clamped = Math.max(-45, Math.min(45, theta));
  const span =
    OUTFIELD_SECTORS.find((s) => clamped >= s.from && clamped < s.to) ??
    OUTFIELD_SECTORS[OUTFIELD_SECTORS.length - 1];
  return OUTFIELD_OWNER[span.id];
}

export type PrimaryCall = {
  position: Position;
  /** Plain-language reason, surfaced by the UI's "why" panel. */
  why: string;
  ruleId: string;
};

export function primaryFor(zone: Zone, ball: string, level: Level): PrimaryCall {
  const cfg = FIELD_CONFIGS[level];
  const u = cfg.baseDistance / 90;

  if (isInfieldBand(zone.band)) {
    const sector = zone.sector as InfieldSector;

    // Anything dying at the plate is the catcher's — he's the only one facing it.
    if (zone.r < 20 * u) {
      return { position: 'C', why: 'Dies at the plate — catcher is on top of it.', ruleId: 'primary.plate' };
    }

    if (ball === 'bunt' || zone.band === 'bunt') {
      return {
        position: BUNT_OWNER[sector],
        why: 'Bunt coverage — battery and corners.',
        ruleId: 'primary.bunt',
      };
    }

    // Only balls straight over the mound — a pop down the line at this depth
    // belongs to the corner, not the pitcher.
    const overMound = sector === 'middle_L' || sector === 'middle_R';
    if ((ball === 'popup' || ball === 'fly') && zone.band === 'in' && overMound) {
      return { position: 'P', why: 'Popped up over the mound — pitcher, unless waved off.', ruleId: 'primary.mound' };
    }

    return {
      position: INFIELD_OWNER[sector],
      why: `${zone.foul ? 'Foul side, ' : ''}infield sector belongs to the ${INFIELD_OWNER[sector]}.`,
      ruleId: 'primary.infield',
    };
  }

  const sector = zone.sector as OutfieldSector;
  const owner = OUTFIELD_OWNER[sector];

  if (zone.band === 'shallow') {
    // No-man's land. In the air this is the priority call every coach drills;
    // on the ground it is simply a ball that already got through.
    const inAir = ball === 'fly' || ball === 'popup' || ball === 'line';
    return {
      position: owner,
      why: inAir
        ? 'Shallow, but the outfielder is coming in on it — his ball, he calls off the infielder.'
        : 'Through the infield — nearest outfielder comes up to cut it off.',
      ruleId: inAir ? 'primary.shallow.air' : 'primary.shallow.ground',
    };
  }

  if (sector === 'LC_gap' || sector === 'RC_gap') {
    return { position: owner, why: 'Center fielder takes the gap.', ruleId: 'primary.gap' };
  }

  return { position: owner, why: `Outfield sector belongs to the ${owner}.`, ruleId: 'primary.outfield' };
}
