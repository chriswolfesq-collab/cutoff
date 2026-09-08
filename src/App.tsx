import { useState } from 'react';
import Field from './components/Field';
import Controls from './components/Controls';
import { POSITION_NAMES, type Position } from './field/alignments';
import { ROLE_LABELS } from './field/assignment';
import { resolvePlay } from './engine/resolve';
import { ROLE_CLASS } from './components/roleStyles';
import type { Point } from './field/geometry';
import { classify, DEPTH_BAND_NAMES, SECTOR_NAMES } from './field/zones';
import { primaryFor } from './field/primary';
import {
  DEFAULT_SITUATION,
  describeRunners,
  isPlausible,
  OUTCOME_NAMES,
  validOutcomes,
  type BallType,
  type Outcome,
  type Situation,
} from './field/play';
import './App.css';

export default function App() {
  const [situation, setSituation] = useState<Situation>(DEFAULT_SITUATION);
  const [ball, setBall] = useState<BallType>('ground');
  const [showZones, setShowZones] = useState(true);
  const [pick, setPick] = useState<Point | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [highlight, setHighlight] = useState<Position | null>(null);

  const zone = pick ? classify(pick, situation.level) : null;
  const plausible = zone ? isPlausible(ball, zone) : false;
  const outcomes = zone ? validOutcomes(ball, zone) : [];
  const primary = zone && plausible ? primaryFor(zone, ball, situation.level) : null;

  const play =
    pick && outcome && plausible
      ? resolvePlay({ situation, ball, at: pick, outcome })
      : null;

  const choose = (p: Point) => {
    setPick(p);
    setOutcome(null);
  };

  return (
    <main className="app">
      <header>
        <h1>Cutoff</h1>
        <p className="tagline">
          {describeRunners(situation.runners)} &middot; {situation.outs}{' '}
          {situation.outs === 1 ? 'out' : 'outs'}
        </p>
      </header>

      <Controls
        situation={situation}
        ball={ball}
        showZones={showZones}
        onSituation={setSituation}
        onBall={setBall}
        onShowZones={setShowZones}
      />

      <div className="layout">
        <Field
          level={situation.level}
          posture={situation.posture}
          showZones={showZones}
          pick={pick}
          play={play}
          highlight={highlight}
          onPick={choose}
          onHighlight={setHighlight}
        />

        <aside className="panel">
          {!zone && <p className="hint">Click anywhere on the field to classify a batted ball.</p>}

          {zone && (
            <>
              <h2>{SECTOR_NAMES[zone.sector]}</h2>
              <dl>
                <dt>Depth</dt>
                <dd>{DEPTH_BAND_NAMES[zone.band]}</dd>
                <dt>Distance</dt>
                <dd>{Math.round(zone.r)}' at {zone.theta > 0 ? '+' : ''}{zone.theta.toFixed(0)}&deg;</dd>
                <dt>Zone id</dt>
                <dd><code>{zone.id}</code>{zone.foul && ' (foul)'}</dd>
              </dl>

              {!plausible && (
                <p className="warn">
                  A {ball === 'bunt' ? 'bunt' : `${ball} ball`} doesn't reach this part of the field.
                </p>
              )}

              {primary && (
                <div className="call">
                  <span className="badge">{primary.position}</span>
                  <div>
                    <strong>{POSITION_NAMES[primary.position]} has it</strong>
                    <p>{primary.why}</p>
                    <code className="rule">{primary.ruleId}</code>
                  </div>
                </div>
              )}

              {outcomes.length > 0 && (
                <div className="outcomes">
                  <span className="control-label">What happened</span>
                  <div className="outcome-list">
                    {outcomes.map((o) => (
                      <button
                        key={o}
                        type="button"
                        aria-pressed={outcome === o}
                        onClick={() => setOutcome(o)}
                      >
                        {OUTCOME_NAMES[o]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {play && (
                <div className="result">
                  {play.notes.map((n) => (
                    <p key={n} className="note">{n}</p>
                  ))}
                  <ol className="assignments">
                    {play.assignments.map((a) => (
                      <li
                        key={a.position}
                        className={`${ROLE_CLASS[a.role.kind]}${highlight === a.position ? ' hot' : ''}`}
                        onMouseEnter={() => setHighlight(a.position)}
                        onMouseLeave={() => setHighlight(null)}
                      >
                        <span className="badge">{a.position}</span>
                        <div>
                          <strong>
                            {ROLE_LABELS[a.role.kind]}
                            {'base' in a.role && a.role.base ? ` ${a.role.base}` : ''}
                            {'fielder' in a.role && a.role.fielder ? ` the ${a.role.fielder}` : ''}
                          </strong>
                          <p>{a.why}</p>
                          <code className="rule">{a.ruleId}</code>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
