import { POSITION_NAMES, POSTURE_NAMES, type Position } from '../field/alignments';
import { roleKey } from '../field/assignment';
import { BALL_TYPE_NAMES, OUTCOME_NAMES, describeRunners } from '../field/play';
import type { Drill } from '../engine/drill';

export type Score = { right: number; total: number };

export default function DrillPanel({
  drill,
  answer,
  score,
  onNext,
}: {
  drill: Drill;
  answer: Position | null;
  score: Score;
  onNext: () => void;
}) {
  const { situation, ball, outcome } = drill.input;
  const correct = answer !== null && drill.question.answers.includes(answer);

  // What the right answer is actually doing, straight off the resolved play.
  const model = drill.play.assignments.find((a) => roleKey(a.role) === drill.question.roleKey);

  return (
    <aside className="panel drill">
      <div className="drill-head">
        <span className="control-label">The situation</span>
        <p className="drill-situation">
          {describeRunners(situation.runners)} &middot; {situation.outs}{' '}
          {situation.outs === 1 ? 'out' : 'outs'}
          {situation.posture !== 'normal' && ` · ${POSTURE_NAMES[situation.posture]}`}
        </p>
        <p className="drill-situation">
          {BALL_TYPE_NAMES[ball]}, {OUTCOME_NAMES[outcome].toLowerCase()}.
        </p>
      </div>

      <h2 className="drill-question">{drill.question.prompt}</h2>

      {!answer && <p className="hint">Click the fielder on the field.</p>}

      {answer && (
        <div className={`drill-result ${correct ? 'right' : 'wrong'}`}>
          <strong>
            {correct ? 'Correct' : `Not quite — you said ${POSITION_NAMES[answer]}`}
          </strong>
          <p>
            {drill.question.answers.map((p) => POSITION_NAMES[p]).join(' or ')}
            {drill.question.answers.length > 1 ? ' have it.' : ' has it.'}
          </p>
          {model && <p className="drill-why">{model.why}</p>}
          {model && <code className="rule">{model.ruleId}</code>}
        </div>
      )}

      {answer && (
        <button type="button" className="next-button" onClick={onNext}>
          Next situation
        </button>
      )}

      <div className="score">
        <span className="control-label">Score</span>
        <strong>
          {score.right} / {score.total}
        </strong>
      </div>
    </aside>
  );
}
