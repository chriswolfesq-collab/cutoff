/**
 * The zone map: a batted-ball location becomes a (depth band, sector) pair.
 *
 * Zones are polar — an angle off dead center and a distance from home — rather
 * than drawn polygons. That matches how the game is actually described ("in the
 * hole", "down the line", "shallow right-center") and it scales between levels
 * without re-authoring anything.
 *
 * Angle convention: 0 degrees is straight up the middle, negative toward left
 * field, positive toward right field. The foul lines are at exactly +/-45.
 */

import { FIELD_CONFIGS, fenceRadius, type FieldConfig, type Level, type Point } from './geometry';

export type DepthBand = 'bunt' | 'in' | 'infield' | 'shallow' | 'medium' | 'deep' | 'wall';

export const DEPTH_BAND_NAMES: Record<DepthBand, string> = {
  bunt: 'Bunt / plate area',
  in: 'Charging depth',
  infield: 'Infield',
  shallow: 'Shallow outfield',
  medium: 'Medium outfield',
  deep: 'Deep outfield',
  wall: 'At the wall',
};

export const INFIELD_BANDS: DepthBand[] = ['bunt', 'in', 'infield'];
export const isInfieldBand = (b: DepthBand) => INFIELD_BANDS.includes(b);

export type InfieldSector =
  | '3B_line' | '3B' | '5_6_hole' | 'SS' | 'middle_L'
  | 'middle_R' | '2B' | '3_4_hole' | '1B' | '1B_line';

export type OutfieldSector =
  | 'LF_line' | 'LF' | 'LC_gap' | 'CF' | 'RC_gap' | 'RF' | 'RF_line';

export type Sector = InfieldSector | OutfieldSector;

type SectorSpan<T extends string> = { id: T; from: number; to: number; name: string };

/**
 * Infield sector edges fall between the fielders, not on them. With adult
 * spacing the fielders sit at roughly -34 (3B), -16 (SS), +14 (2B) and
 * +33 (1B) degrees, so the holes land near -25 and +23.
 */
export const INFIELD_SECTORS: SectorSpan<InfieldSector>[] = [
  { id: '3B_line', from: -45, to: -39, name: 'Down the third-base line' },
  { id: '3B', from: -39, to: -29, name: 'At the third baseman' },
  { id: '5_6_hole', from: -29, to: -21, name: 'The 5-6 hole' },
  { id: 'SS', from: -21, to: -10, name: 'At the shortstop' },
  { id: 'middle_L', from: -10, to: -1, name: 'Up the middle, shortstop side' },
  { id: 'middle_R', from: -1, to: 8, name: 'Up the middle, second-base side' },
  { id: '2B', from: 8, to: 19, name: 'At the second baseman' },
  { id: '3_4_hole', from: 19, to: 28, name: 'The 3-4 hole' },
  { id: '1B', from: 28, to: 39, name: 'At the first baseman' },
  { id: '1B_line', from: 39, to: 45, name: 'Down the first-base line' },
];

/** Outfielders sit near -33 / 0 / +33 degrees, putting the gaps around +/-16. */
export const OUTFIELD_SECTORS: SectorSpan<OutfieldSector>[] = [
  { id: 'LF_line', from: -45, to: -38, name: 'Down the left-field line' },
  { id: 'LF', from: -38, to: -24, name: 'Left field' },
  { id: 'LC_gap', from: -24, to: -9, name: 'Left-center gap' },
  { id: 'CF', from: -9, to: 9, name: 'Center field' },
  { id: 'RC_gap', from: 9, to: 24, name: 'Right-center gap' },
  { id: 'RF', from: 24, to: 38, name: 'Right field' },
  { id: 'RF_line', from: 38, to: 45, name: 'Down the right-field line' },
];

export const SECTOR_NAMES: Record<Sector, string> = Object.fromEntries(
  [...INFIELD_SECTORS, ...OUTFIELD_SECTORS].map((s) => [s.id, s.name]),
) as Record<Sector, string>;

/** Infield band edges, in feet at adult scale; scaled by base distance. */
const BAND_EDGES = { bunt: 50, in: 95, infield: 150 };

/**
 * Outfield bands are a fraction of the remaining distance to the fence at that
 * angle, so "deep" means deep for where the ball actually is — 312' down the
 * line and 375' to center both read as deep in a 330/400 park.
 */
const OUTFIELD_FRACTIONS: { band: DepthBand; upTo: number }[] = [
  { band: 'shallow', upTo: 0.3 },
  { band: 'medium', upTo: 0.65 },
  { band: 'deep', upTo: 0.9 },
  { band: 'wall', upTo: Infinity },
];

export type Zone = {
  band: DepthBand;
  sector: Sector;
  /** Distance from home, feet. */
  r: number;
  /** Angle off dead center, degrees. Negative is toward left field. */
  theta: number;
  foul: boolean;
  id: string;
};

const DEG = 180 / Math.PI;

function sectorAt(theta: number, infield: boolean): Sector {
  const spans: SectorSpan<Sector>[] = infield ? INFIELD_SECTORS : OUTFIELD_SECTORS;
  const clamped = Math.max(-45, Math.min(45, theta));
  return (spans.find((s) => clamped >= s.from && clamped < s.to) ?? spans[spans.length - 1]).id;
}

function bandAt(cfg: FieldConfig, r: number, thetaRad: number): DepthBand {
  const u = cfg.baseDistance / 90;
  if (r < BAND_EDGES.bunt * u) return 'bunt';
  if (r < BAND_EDGES.in * u) return 'in';
  if (r < BAND_EDGES.infield * u) return 'infield';

  const start = BAND_EDGES.infield * u;
  const fence = fenceRadius(cfg, thetaRad);
  const t = (r - start) / Math.max(1, fence - start);
  return (OUTFIELD_FRACTIONS.find((f) => t < f.upTo) ?? OUTFIELD_FRACTIONS[3]).band;
}

/** Classify a point on the field into a zone. */
export function classify(p: Point, level: Level): Zone {
  const cfg = FIELD_CONFIGS[level];
  const r = Math.hypot(p.x, p.y);

  // Behind home plate is always foul, and atan2 stops being meaningful there.
  if (p.y <= 0) {
    const theta = p.x >= 0 ? 45 : -45;
    const sector = sectorAt(theta, true);
    return { band: 'bunt', sector, r, theta, foul: true, id: `bunt/${sector}` };
  }

  const thetaRad = Math.atan2(p.x, p.y);
  const theta = thetaRad * DEG;
  const foul = Math.abs(p.x) > p.y;
  const band = bandAt(cfg, r, thetaRad);
  const sector = sectorAt(theta, isInfieldBand(band));

  return { band, sector, r, theta, foul, id: `${band}/${sector}` };
}
