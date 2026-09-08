import {
  FIELD_CONFIGS,
  fenceRadius,
  type Level,
  type Point,
} from '../field/geometry';
import { INFIELD_SECTORS, OUTFIELD_SECTORS } from '../field/zones';

const toScreen = (p: Point): Point => ({ x: p.x, y: -p.y });
const RAD = Math.PI / 180;

const polar = (r: number, deg: number): Point => ({
  x: r * Math.sin(deg * RAD),
  y: r * Math.cos(deg * RAD),
});

const line = (a: Point, b: Point) => {
  const [s, e] = [toScreen(a), toScreen(b)];
  return `M${s.x.toFixed(1)},${s.y.toFixed(1)} L${e.x.toFixed(1)},${e.y.toFixed(1)}`;
};

const arc = (radiusAt: (deg: number) => number, samples = 40) => {
  const pts: Point[] = [];
  for (let i = 0; i <= samples; i++) {
    const deg = -45 + (90 * i) / samples;
    pts.push(polar(radiusAt(deg), deg));
  }
  return pts
    .map(toScreen)
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
};

/** Draws the zone grid so the map can be eyeballed against the real field. */
export default function ZoneOverlay({ level }: { level: Level }) {
  const cfg = FIELD_CONFIGS[level];
  const u = cfg.baseDistance / 90;
  const inner = 150 * u;
  const fenceAt = (deg: number) => fenceRadius(cfg, deg * RAD);

  // Infield sector edges stop at the infield/outfield boundary.
  const infieldEdges = INFIELD_SECTORS.slice(1).map((s) => s.from);
  const outfieldEdges = OUTFIELD_SECTORS.slice(1).map((s) => s.from);

  return (
    <g className="zone-overlay" pointerEvents="none">
      {infieldEdges.map((deg) => (
        <path key={`i${deg}`} d={line(polar(8 * u, deg), polar(inner, deg))} />
      ))}
      {outfieldEdges.map((deg) => (
        <path key={`o${deg}`} d={line(polar(inner, deg), polar(fenceAt(deg), deg))} />
      ))}

      {[50 * u, 95 * u, inner].map((r) => (
        <path key={`b${r}`} d={arc(() => r)} />
      ))}
      {[0.3, 0.65, 0.9].map((f) => (
        <path key={`f${f}`} d={arc((deg) => inner + f * (fenceAt(deg) - inner))} />
      ))}
    </g>
  );
}
