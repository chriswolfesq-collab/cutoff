import { useEffect, useRef, useState } from 'react';
import Field from './components/Field';
import Controls, { Segmented } from './components/Controls';
import { POSITION_NAMES, type Position } from './field/alignments';
import { ROLE_LABELS } from './field/assignment';
import { resolvePlay } from './engine/resolve';
import { generateDrill, rngFrom, type Drill } from './engine/drill';
import {
  buildFirstAndThird,
  CALL_BLURB,
  CALL_NAMES,
  FIRST_THIRD_CALLS,
  type FirstThirdCall,
} from './engine/firstAndThird';
import { FIELD_CONFIGS } from './field/geometry';
import DrillPanel, { type Score } from './components/DrillPanel';
import { decode, encode } from './urlState';
import { ROLE_CLASS } from './components/roleStyles';
import type { Level, Point } from './field/geometry';
import { classify, DEPTH_BAND_NAMES, SECTOR_NAMES } from './field/zones';
import { primaryFor } from './field/primary';
import {
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
  // The scenario opens from the link, so a shared URL lands on that play.
  const [situation, setSituation] = useState<Situation>(
    () => decode(window.location.hash).situation,
  );
  const [ball, setBall] = useState<BallType>(() => decode(window.location.hash).ball);
  const [showZones, setShowZones] = useState(true);
  const [pick, setPick] = useState<Point | null>(() => decode(window.location.hash).at);
  const [outcome, setOutcome] = useState<Outcome | null>(
    () => decode(window.location.hash).outcome,
  );

  const [mode, setMode] = useState<'explore' | 'drill'>('explore');
  const [drill, setDrill] = useState<Drill | null>(null);
  const [answer, setAnswer] = useState<Position | null>(null);
  const [score, setScore] = useState<Score>({ right: 0, total: 0 });
  const [copied, setCopied] = useState(false);
  const [inRundown, setInRundown] = useState(false);
  const [call, setCall] = useState<FirstThirdCall | null>(null);
  // Seeded when drill mode is entered rather than during render, so the clock
  // is read from an event and the sequence differs between sessions.
  const rng = useRef<() => number>(() => 0);
  const [highlight, setHighlight] = useState<Position | null>(null);

  /**
   * Scrub position is stored against a signature of the play it belongs to, so
   * picking a different play resets to contact during render rather than in an
   * effect that fires a second pass.
   */
  const [scrub, setScrub] = useState({ sig: '', index: 1, playing: false });

  const zone = pick ? classify(pick, situation.level) : null;
  const plausible = zone ? isPlausible(ball, zone) : false;
  const outcomes = zone ? validOutcomes(ball, zone) : [];
  const primary = zone && plausible ? primaryFor(zone, ball, situation.level) : null;

  const play =
    pick && outcome && plausible
      ? resolvePlay({ situation, ball, at: pick, outcome })
      : null;

  /**
   * A rundown is a separate state with its own two-phase rotation, so it takes
   * over the field rather than being drawn on top of the batted-ball play.
   */
  /**
   * First and third is a play with no batted ball, so it takes over the field
   * the way a rundown does rather than being layered onto one.
   */
  const firstAndThird =
    situation.runners.first && situation.runners.third && call
      ? buildFirstAndThird(situation, FIELD_CONFIGS[situation.level], call)
      : null;

  const rundown = !firstAndThird && inRundown ? (play?.rundown ?? null) : null;
  // phaseIndex is derived below; the rundown reads it once it exists.

  const sig =
    pick && outcome && plausible
      ? [
          situation.level, situation.outs, situation.posture, situation.batterHand,
          situation.runners.first, situation.runners.second, situation.runners.third,
          ball, outcome, pick.x.toFixed(1), pick.y.toFixed(1),
        ].join('|')
      : '';
  // Switching the call is a different sequence, so the scrubber starts over.
  const scrubSig = `${sig}|${call ?? ''}`;

  const sequence = firstAndThird?.phases ?? (rundown ? rundown.phases : play?.phases);
  const lastPhase = sequence ? sequence.length - 1 : 0;
  const current =
    scrub.sig === scrubSig ? scrub : { sig: scrubSig, index: firstAndThird ? 0 : 1, playing: false };
  const phaseIndex = Math.min(current.index, lastPhase);
  // Playback stops on its own at the end; deriving it keeps the button honest
  // without writing state from inside the timer effect.
  const playing = current.playing && phaseIndex < lastPhase;
  const currentPhase = play?.phases[phaseIndex] ?? null;
  const rundownPhase = rundown?.phases[phaseIndex] ?? null;
  const ftPhase = firstAndThird?.phases[Math.min(phaseIndex, firstAndThird.phases.length - 1)] ?? null;

  // The chaser's job changes once he throws — the one keyframe in the engine.
  const rundownAssignments = rundown
    ? phaseIndex >= 1
      ? rundown.afterThrow
      : rundown.assignments
    : null;

  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(
      () => setScrub((sc) => ({ ...sc, index: sc.index + 1 })),
      950,
    );
    return () => clearTimeout(timer);
  }, [playing, phaseIndex]);

  const togglePlay = () => {
    if (playing) {
      setScrub({ sig: scrubSig, index: phaseIndex, playing: false });
      return;
    }
    // Pressing play at the end replays from the set.
    setScrub({ sig: scrubSig, index: phaseIndex >= lastPhase ? 0 : phaseIndex, playing: true });
  };

  // Keep the address bar in step so the link is always the play on screen.
  useEffect(() => {
    if (mode !== 'explore') return;
    const query = encode({ situation, ball, at: pick, outcome });
    window.history.replaceState(null, '', `${window.location.pathname}#${query}`);
  }, [mode, situation, ball, pick, outcome]);

  const choose = (p: Point) => {
    setPick(p);
    setOutcome(null);
    setCopied(false);
    setInRundown(false);
  };

  const nextDrill = () => {
    setDrill(generateDrill(situation.level, rng.current));
    setAnswer(null);
  };

  const enterDrill = () => {
    rng.current = rngFrom(Date.now() >>> 0);
    setMode('drill');
    setDrill(generateDrill(situation.level, rng.current));
    setAnswer(null);
    setScore({ right: 0, total: 0 });
  };

  const submitAnswer = (pos: Position) => {
    if (!drill || answer) return;
    setAnswer(pos);
    setScore((s) => ({
      right: s.right + (drill.question.answers.includes(pos) ? 1 : 0),
      total: s.total + 1,
    }));
  };

  const copyLink = () => {
    navigator.clipboard?.writeText(window.location.href).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  const drilling = mode === 'drill' && drill !== null;
  // Before the answer the fielders stay in their starting alignment — showing
  // them on their marks would be showing the answer.
  const shownPlay = drilling ? (answer ? drill.play : null) : play;
  const shownPhase = drilling ? drill.play.phases[1] : currentPhase;
  const shownPick = drilling ? drill.input.at : pick;

  return (
    <main className="app">
      <header>
        <h1>Cutoff</h1>
        {mode === 'explore' && (
          <p className="tagline">
            {describeRunners(situation.runners)} &middot; {situation.outs}{' '}
            {situation.outs === 1 ? 'out' : 'outs'}
          </p>
        )}
        <div className="segmented header-modes" role="group" aria-label="Mode">
          <button
            type="button"
            aria-pressed={mode === 'explore'}
            onClick={() => setMode('explore')}
          >
            Explore
          </button>
          <button type="button" aria-pressed={mode === 'drill'} onClick={enterDrill}>
            Drill
          </button>
        </div>
        {mode === 'explore' && (
          <button type="button" className="link-button" onClick={copyLink}>
            {copied ? 'Link copied' : 'Copy link'}
          </button>
        )}
      </header>

      {mode === 'explore' ? (
        <Controls
          situation={situation}
          ball={ball}
          showZones={showZones}
          onSituation={setSituation}
          onBall={setBall}
          onShowZones={setShowZones}
        />
      ) : (
        <div className="controls">
          <Segmented<Level>
            label="Level"
            value={situation.level}
            options={[
              { id: 'youth', label: 'Youth' },
              { id: 'adult', label: 'Adult' },
            ]}
            onChange={(level) => {
              setSituation({ ...situation, level });
              setDrill(generateDrill(level, rng.current));
              setAnswer(null);
            }}
          />
          <p className="hint">
            The situation is dealt to you. Answer by clicking a fielder.
          </p>
        </div>
      )}

      {mode === 'explore' && situation.runners.first && situation.runners.third && (
        <div className="first-third">
          {!call ? (
            <button type="button" className="ft-enter" onClick={() => setCall('through')}>
              First and third — the runner on first goes &rarr;
            </button>
          ) : (
            <>
              <span className="control-label">The call</span>
              <div className="segmented" role="group" aria-label="First and third call">
                {FIRST_THIRD_CALLS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={call === c}
                    onClick={() => setCall(c)}
                  >
                    {CALL_NAMES[c]}
                  </button>
                ))}
              </div>
              <button type="button" className="link-button" onClick={() => setCall(null)}>
                Back to the batted ball
              </button>
            </>
          )}
        </div>
      )}

      <div className="layout">
        <div className="stage">
          <Field
            level={situation.level}
            posture={situation.posture}
            showZones={showZones}
            pick={rundown || firstAndThird ? null : shownPick}
            play={firstAndThird ? null : shownPlay}
            phase={firstAndThird ? ftPhase : rundown ? rundownPhase : shownPhase}
            override={firstAndThird?.assignments ?? rundownAssignments}
            highlight={highlight}
            onPick={mode === 'explore' ? choose : undefined}
            onHighlight={setHighlight}
            onAnswer={drilling && !answer ? submitAnswer : undefined}
          />

          {mode === 'explore' && (play || firstAndThird) && (
            <div className="scrubber">
              <button
                type="button"
                className="play-button"
                onClick={togglePlay}
                aria-label={playing ? 'Pause' : 'Play the sequence'}
              >
                {playing ? '❚❚' : '▶'}
              </button>
              <div className="phases" role="group" aria-label="Play phase">
                {(sequence ?? []).map((ph) => (
                  <button
                    key={ph.index}
                    type="button"
                    aria-pressed={
                      (firstAndThird ? ftPhase : rundown ? rundownPhase : currentPhase)?.index ===
                      ph.index
                    }
                    onClick={() => setScrub({ sig: scrubSig, index: ph.index, playing: false })}
                  >
                    {ph.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {firstAndThird ? (
          <aside className="panel">
            <h2>{CALL_NAMES[firstAndThird.call]}</h2>
            <p className="hint">{CALL_BLURB[firstAndThird.call]}</p>
            <div className="result">
              {firstAndThird.notes.map((n) => (
                <p key={n} className="note">{n}</p>
              ))}
              <ol className="assignments">
                {firstAndThird.assignments.map((a) => (
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
                        {'to' in a.role && a.role.to ? ` to ${a.role.to}` : ''}
                      </strong>
                      <p>{a.why}</p>
                      {a.alternative && (
                        <p className="alt-note">
                          <em>{a.alternative.when}</em> &rarr; {a.alternative.why.toLowerCase()}
                        </p>
                      )}
                      <code className="rule">{a.ruleId}</code>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </aside>
        ) : drilling ? (
          <DrillPanel drill={drill} answer={answer} score={score} onNext={nextDrill} />
        ) : (
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
                  {play.rundown && (
                    <button
                      type="button"
                      className="rundown-toggle"
                      aria-pressed={inRundown}
                      onClick={() => {
                        setInRundown(!inRundown);
                        setScrub({ sig: scrubSig, index: 0, playing: false });
                      }}
                    >
                      {inRundown
                        ? 'Back to the play'
                        : `He's hung up between ${play.rundown.behind} and ${play.rundown.ahead}`}
                    </button>
                  )}
                  {!inRundown && play.branch && (
                    <p className="note read">
                      {play.branch.when}, the throw goes{' '}
                      {play.branch.throws.length
                        ? `to ${play.branch.throws.map((t) => t.to).join(' then ')}`
                        : 'nowhere'}
                      . Dashed markers show who moves.
                    </p>
                  )}
                  {rundown?.notes.map((n) => (
                    <p key={n} className="note">{n}</p>
                  ))}
                  <ol className="assignments">
                    {(rundownAssignments ?? play.assignments).map((a) => (
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
                          {a.alternative && (
                            <p className="alt-note">
                              <em>{a.alternative.when}</em> &rarr;{' '}
                              {ROLE_LABELS[a.alternative.role.kind].toLowerCase()}
                              {'base' in a.alternative.role && a.alternative.role.base
                                ? ` ${a.alternative.role.base}`
                                : ''}
                              {'on' in a.alternative.role && a.alternative.role.on
                                ? ` to ${a.alternative.role.on.to}`
                                : ''}
                            </p>
                          )}
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
        )}
      </div>
    </main>
  );
}
