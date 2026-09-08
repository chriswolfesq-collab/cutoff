import { POSTURE_NAMES, type Posture } from '../field/alignments';
import type { Level } from '../field/geometry';
import { BALL_TYPES, BALL_TYPE_NAMES, type BallType, type Outs, type Situation } from '../field/play';

function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="control">
      <span className="control-label">{label}</span>
      <div className="segmented" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Controls({
  situation,
  ball,
  showZones,
  onSituation,
  onBall,
  onShowZones,
}: {
  situation: Situation;
  ball: BallType;
  showZones: boolean;
  onSituation: (s: Situation) => void;
  onBall: (b: BallType) => void;
  onShowZones: (v: boolean) => void;
}) {
  const { runners } = situation;
  const toggleRunner = (base: keyof typeof runners) =>
    onSituation({ ...situation, runners: { ...runners, [base]: !runners[base] } });

  return (
    <div className="controls">
      <Segmented<Level>
        label="Level"
        value={situation.level}
        options={[
          { id: 'youth', label: 'Youth' },
          { id: 'adult', label: 'Adult' },
        ]}
        onChange={(level) => onSituation({ ...situation, level })}
      />

      <div className="control">
        <span className="control-label">Runners</span>
        <div className="segmented" role="group" aria-label="Runners">
          {(['first', 'second', 'third'] as const).map((b, i) => (
            <button key={b} type="button" aria-pressed={runners[b]} onClick={() => toggleRunner(b)}>
              {['1st', '2nd', '3rd'][i]}
            </button>
          ))}
        </div>
      </div>

      <Segmented<Outs>
        label="Outs"
        value={situation.outs}
        options={[
          { id: 0, label: '0' },
          { id: 1, label: '1' },
          { id: 2, label: '2' },
        ]}
        onChange={(outs) => onSituation({ ...situation, outs })}
      />

      <Segmented<'L' | 'R'>
        label="Batter"
        value={situation.batterHand}
        options={[
          { id: 'L', label: 'LHB' },
          { id: 'R', label: 'RHB' },
        ]}
        onChange={(batterHand) => onSituation({ ...situation, batterHand })}
      />

      <div className="control">
        <span className="control-label">Defense</span>
        <select
          value={situation.posture}
          onChange={(e) => onSituation({ ...situation, posture: e.target.value as Posture })}
        >
          {Object.entries(POSTURE_NAMES).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="control">
        <span className="control-label">Ball</span>
        <div className="segmented" role="group" aria-label="Ball type">
          {BALL_TYPES.map((b) => (
            <button key={b} type="button" aria-pressed={ball === b} onClick={() => onBall(b)}>
              {BALL_TYPE_NAMES[b].replace(' ball', '').replace(' drive', '')}
            </button>
          ))}
        </div>
      </div>

      <label className="control checkbox">
        <input type="checkbox" checked={showZones} onChange={(e) => onShowZones(e.target.checked)} />
        Show zone grid
      </label>
    </div>
  );
}
