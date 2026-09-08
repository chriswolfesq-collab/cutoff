import { useState } from 'react';
import Field from './components/Field';
import { FIELD_CONFIGS, type Level } from './field/geometry';
import './App.css';

const LEVELS: { id: Level; label: string }[] = [
  { id: 'youth', label: 'Youth' },
  { id: 'adult', label: 'Adult' },
];

export default function App() {
  const [level, setLevel] = useState<Level>('youth');
  const cfg = FIELD_CONFIGS[level];

  return (
    <main className="app">
      <header>
        <h1>Cutoff</h1>
        <div className="segmented" role="group" aria-label="Level">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              type="button"
              aria-pressed={level === l.id}
              onClick={() => setLevel(l.id)}
            >
              {l.label}
            </button>
          ))}
        </div>
      </header>

      <Field level={level} />

      <footer>
        {cfg.baseDistance}' bases &middot; {cfg.moundDistance}' mound &middot; fences{' '}
        {cfg.fence.line}/{cfg.fence.center}/{cfg.fence.line}
      </footer>
    </main>
  );
}
