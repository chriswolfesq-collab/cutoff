/**
 * The hovered fielder's assignment, drawn on the field.
 *
 * The same three lines the side panel gives him — who he is, his job, and why
 * — put next to his marker, so the answer to "what is he doing?" arrives where
 * the eye already is instead of at the end of a list of nine.
 *
 * It is drawn in SVG rather than as an HTML overlay because the field scales
 * with its viewBox: sizing everything off the marker radius keeps the callout
 * the same size relative to the diagram at any window width.
 */
import { POSITION_NAMES } from '../field/alignments';
import { roleLabel, type Assignment } from '../field/assignment';
import type { Point } from '../field/geometry';
import { ROLE_CLASS } from './roleStyles';

/**
 * Greedy wrap on a character budget. SVG has no text flow and measuring in the
 * DOM would need a layout pass, so the budget is estimated from the font size
 * — the box is generously padded, which is what absorbs the error.
 */
function wrap(text: string, budget: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && line.length + 1 + word.length > budget) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

type TextLine = { text: string; size: number; cls: string; top: number };

/** Average glyph width as a fraction of font size, for the wrap budget. */
const GLYPH = 0.54;

export default function Callout({
  assignment,
  at,
  r,
  bounds,
}: {
  assignment: Assignment;
  /** The hovered marker, in screen units (y already flipped). */
  at: Point;
  /** Marker radius, the unit everything here is sized in. */
  r: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}) {
  const pad = r * 0.75;
  const w = r * 17;
  const inner = w - pad * 2;

  const lines: TextLine[] = [];
  // Each block starts below the last line written, plus its own leading.
  const push = (text: string, size: number, cls: string, gap: number) => {
    const prev = lines[lines.length - 1];
    let top = (prev ? prev.top + prev.size * 1.28 : 0) + gap;
    for (const t of wrap(text, Math.floor(inner / (size * GLYPH)))) {
      lines.push({ text: t, size, cls, top });
      top += size * 1.28;
    }
  };

  push(POSITION_NAMES[assignment.position], r * 0.7, 'callout-eyebrow', 0);
  push(roleLabel(assignment.role), r * 0.95, 'callout-title', r * 0.3);
  push(assignment.why, r * 0.82, 'callout-why', r * 0.32);
  for (const alt of assignment.alternatives ?? []) {
    push(`${alt.when} → ${roleLabel(alt.role).toLowerCase()}`, r * 0.74, 'callout-alt', r * 0.3);
  }

  const last = lines[lines.length - 1];
  const h = last.top + last.size * 1.28 + pad * 2;

  // Right of the marker by default, flipped when that would run off the edge.
  const gap = r * 1.5;
  const fitsRight = at.x + gap + w <= bounds.maxX - 4;
  const x = fitsRight ? at.x + gap : at.x - gap - w;
  const y = Math.min(
    Math.max(at.y - h / 2, bounds.minY + 4),
    bounds.maxY - h - 4,
  );

  return (
    <g className={`callout ${ROLE_CLASS[assignment.role.kind]}`} pointerEvents="none">
      <rect x={x} y={y} width={w} height={h} rx={r * 0.5} className="callout-box" />
      {/* A stub of the role colour on the side facing the fielder, so the box
          is tied to the man it belongs to even when several are close. */}
      <rect
        x={fitsRight ? x : x + w - r * 0.22}
        y={y + r * 0.5}
        width={r * 0.22}
        height={h - r}
        className="callout-spine"
      />
      {lines.map((l, i) => (
        <text
          key={i}
          x={x + pad}
          y={y + pad + l.top + l.size * 0.82}
          fontSize={l.size}
          className={l.cls}
        >
          {l.text}
        </text>
      ))}
    </g>
  );
}
