/**
 * Field geometry, in FEET.
 *
 * Origin is the tip of home plate. +y points toward center field, +x toward
 * the first-base side. SVG's y-axis grows downward, so rendering negates y
 * (see `toScreen`) rather than baking a flip into these coordinates — that
 * keeps every number here readable as an actual position on a real field.
 */

export type Point = { x: number; y: number };

export type Level = 'youth' | 'adult';

export type FieldConfig = {
  /** Distance between consecutive bases. */
  baseDistance: number;
  /** Home plate to the front edge of the pitching rubber. */
  moundDistance: number;
  /** Radius of the dirt infield arc, measured from the center of the mound. */
  infieldArcRadius: number;
  /** Fence distance down each foul line and to straightaway center. */
  fence: { line: number; center: number };
  /** Radius of the dirt circle around the mound. */
  moundRadius: number;
  baseSize: number;
};

export const FIELD_CONFIGS: Record<Level, FieldConfig> = {
  youth: {
    baseDistance: 60,
    moundDistance: 46,
    infieldArcRadius: 50,
    fence: { line: 200, center: 200 },
    moundRadius: 5,
    baseSize: 1.25,
  },
  adult: {
    baseDistance: 90,
    moundDistance: 60.5,
    infieldArcRadius: 95,
    fence: { line: 330, center: 400 },
    moundRadius: 9,
    baseSize: 1.25,
  },
};

const SQRT1_2 = Math.SQRT1_2;

export type Bases = {
  home: Point;
  first: Point;
  second: Point;
  third: Point;
};

/**
 * The diamond is a square rotated 45°, so first and third sit at
 * (±d/√2, d/√2) and second sits straight out at d√2.
 */
export function bases(cfg: FieldConfig): Bases {
  const d = cfg.baseDistance;
  return {
    home: { x: 0, y: 0 },
    first: { x: d * SQRT1_2, y: d * SQRT1_2 },
    second: { x: 0, y: d * Math.SQRT2 },
    third: { x: -d * SQRT1_2, y: d * SQRT1_2 },
  };
}

/** Center of the mound circle, which sits just behind the rubber. */
export function moundCenter(cfg: FieldConfig): Point {
  return { x: 0, y: cfg.moundDistance };
}

/**
 * Fence distance at a given angle off dead center, in radians.
 * Foul lines are at ±45°. The cos(2θ) blend hits `line` at the poles and
 * `center` at straightaway, and lands within a few feet of real gap
 * distances in between (≈379' for a 330/400 park).
 */
export function fenceRadius(cfg: FieldConfig, theta: number): number {
  const { line, center } = cfg.fence;
  return line + (center - line) * Math.cos(2 * theta);
}

/** Point on the outfield fence at a given angle off dead center. */
export function fencePoint(cfg: FieldConfig, theta: number): Point {
  const r = fenceRadius(cfg, theta);
  return { x: r * Math.sin(theta), y: r * Math.cos(theta) };
}

export const FOUL_ANGLE = Math.PI / 4;

/** Samples the fence from the left-field pole to the right-field pole. */
export function fenceCurve(cfg: FieldConfig, samples = 48): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= samples; i++) {
    const theta = -FOUL_ANGLE + (2 * FOUL_ANGLE * i) / samples;
    pts.push(fencePoint(cfg, theta));
  }
  return pts;
}

/**
 * The arc where infield dirt meets outfield grass, clipped to the portion
 * that actually falls in fair territory.
 */
export function infieldArc(cfg: FieldConfig, samples = 40): Point[] {
  const c = moundCenter(cfg);
  const r = cfg.infieldArcRadius;
  const pts: Point[] = [];
  for (let i = 0; i <= samples; i++) {
    const a = Math.PI * (i / samples);
    pts.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
  }
  return pts;
}

// --- vector helpers, used later by the cutoff/backup geometry ---

export function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function scale(a: Point, k: number): Point {
  return { x: a.x * k, y: a.y * k };
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function normalize(a: Point): Point {
  const m = Math.hypot(a.x, a.y);
  return m === 0 ? { x: 0, y: 0 } : { x: a.x / m, y: a.y / m };
}

/** Point `feet` along the line from `from` toward `to`. */
export function along(from: Point, to: Point, feet: number): Point {
  return add(from, scale(normalize(sub(to, from)), feet));
}

/** True if a point is in fair territory (between the foul lines, past home). */
export function isFair(p: Point): boolean {
  return p.y > 0 && Math.abs(p.x) <= p.y;
}
