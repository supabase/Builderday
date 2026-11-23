'use client';
import { useState } from 'react';

/* Questions: the seven as an open table (question left, answer right, a rule between rows, one column on a phone),
   each row with its own anchor. Lab modes: an index (the questions as a list, one answer shown at a time), and
   reveal (each answer stays covered until its question is pressed). Every answer is in the page's HTML in every
   mode. */

const slug = (q: string) => 'q-' + q.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function FoldQuestions({ how, mode }: { how: [string, string][]; mode: 'open' | 'index' | 'reveal' }) {
  const [at, setAt] = useState(0), [open, setOpen] = useState<Set<number>>(() => new Set());
  if (mode === 'index') {
    return (
      <div className="pf-qi">
        <ul className="pf-qi-list">
          {how.map(([q], i) => <li key={q}><button type="button" aria-pressed={i === at} aria-controls="pf-qi-a" onClick={() => setAt(i)}>{q}</button></li>)}
        </ul>
        <div id="pf-qi-a" className="pf-qi-a" aria-live="polite">
          {how.map(([q, a], i) => <div key={q} id={slug(q)} hidden={i !== at}><h3>{q}</h3><p>{a}</p></div>)}
        </div>
      </div>
    );
  }
  return (
    <dl className="pf-faq" data-mode={mode}>
      {how.map(([q, a], i) => (
        <div key={q} id={slug(q)} className="pf-faq-row" data-shut={mode === 'reveal' && !open.has(i) ? '' : undefined}>
          <dt>{mode === 'reveal'
            ? <button type="button" aria-expanded={open.has(i)} onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })}>{q}</button>
            : q}</dt>
          <dd>{a}</dd>
        </div>
      ))}
    </dl>
  );
}
