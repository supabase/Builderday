'use client';
import { memo, type CSSProperties } from 'react';
import { END_MIN, SUBMIT_AT, YOURS, smooth } from './how-data';

/* Build in How Builder Day works: a session in the editor's terminal on the day's clock (0 to 90 minutes). A pure
   function of its progress p (0 to 1), finished at p = 1, so the server's HTML is the finished picture and a replay
   draws the same one. Nothing moves on its own: a step arrives because the clock reached its minute. */

type City = { id: string; code: string; name: string };
const pad = (n: number) => String(n).padStart(2, '0');
const pct = (f: number) => (Math.max(0, Math.min(1, f)) * 100).toFixed(2) + '%';

/* ---------- 1 Build: a terminal session on the clock ---------- */
/* One session in the editor's terminal, from an empty folder to submitted, each step at the minute it happens (the gutter), the clock and
   its line on the title bar. Every step holds its place from the first frame, so nothing below it moves as it arrives.
   A tool block shows ::: while it runs (RUN minutes), then its tick. */
type Beat =
  | { at: number; kind: 'me' | 're'; text: string }
  | { at: number; kind: 'tool'; head: string; note: string }
  | { at: number; kind: 'diff'; head: string; lines: [' ' | '+' | '-', string][] }
  | { at: number; kind: 'run'; cmd: string; ok: string[] }
  | { at: number; kind: 'submit' };
const BEATS: Beat[] = [
  { at: 0, kind: 'me', text: 'Map tonight’s gigs with tickets left.' },
  { at: 1, kind: 're', text: 'Setting it up on Supabase first.' },
  { at: 4, kind: 'tool', head: 'Created Supabase project', note: 'gig-map' },
  { at: 11, kind: 'tool', head: 'Created table gigs', note: 'venue, starts_at, tickets_left' },
  { at: 26, kind: 'diff', head: 'Edited src/gigs.ts', lines: [[' ', ".select('venue, starts_at')"], ['+', ".gt('tickets_left', 0)"]] },
  { at: 47, kind: 'run', cmd: 'npm test && npm run deploy', ok: ['3 passed', 'gig-map.vercel.app'] },
  { at: SUBMIT_AT, kind: 'submit' },
];
const RUN = 3;
export type Way = 'browser' | 'editor';
export const BuildTerm = memo(function BuildTerm({ p, way, setWay, you }: { p: number; way: Way; setWay: (w: Way) => void; you: City }) {
  const m = p * END_MIN, sent = m >= SUBMIT_AT + RUN, at = Math.min(m, SUBMIT_AT);
  const now = [...BEATS].reverse().find((b) => m >= b.at)?.at ?? 0;
  const st = (from: number): CSSProperties => { const v = smooth((m - from) / 2.5); return { opacity: Math.max(v, 0.0001), transform: `translateY(${(1 - v) * 4}px)` }; };
  const tick = (from: number) => (m >= from + RUN ? <span className="ok">✓</span> : <span className="run" aria-hidden="true">:::</span>);
  const label = `A session in your editor, minute by minute: you ask for a map of tonight’s gigs with tickets left; at minute 4 it creates a Supabase project, at 11 a table of gigs, at 26 it edits the query, at 47 the tests pass and it deploys to gig-map.vercel.app; at minute ${SUBMIT_AT} the project is submitted ${way === 'browser' ? 'in the browser' : 'from the editor'}.`;
  return (
    <div className="bt" data-way={way}>
      <div className="bt-term" role="img" aria-label={label}>
        <div className="bt-bar">
          <span className="bt-tab"><i aria-hidden="true" />~/gig-map</span>
          <span className="bt-clk">Min <b>{pad(Math.floor(at))}</b><span> / {END_MIN}</span></span>
          <span className="bt-prog" data-sent={sent ? '' : undefined} style={{ width: pct(at / END_MIN) }} />
        </div>
        <ol className="bt-log">
          {BEATS.map((b) => (
            <li key={b.at} data-k={b.kind} data-now={b.at === now ? '' : undefined} style={st(b.at)}>
              <span className="t">{pad(b.at)}</span>
              {b.kind === 'me' ? <p className="me"><i aria-hidden="true">›</i>{b.text}</p>
                : b.kind === 're' ? <p className="re">{b.text}</p>
                : b.kind === 'tool' ? <div className="bt-tool"><div className="th"><span>{b.head}</span>{tick(b.at)}</div><code className="nt">{b.note}</code></div>
                : b.kind === 'diff' ? <div className="bt-tool"><div className="th"><span>{b.head}</span><span className="df"><b>+1</b></span></div>{b.lines.map(([k, l]) => <code key={l} className="dl" data-k={k === '+' ? 'add' : k === '-' ? 'del' : undefined}><i>{k}</i>{l}</code>)}</div>
                : b.kind === 'run' ? <div className="bt-run"><code className="cmd"><i>$</i>{b.cmd}</code>{b.ok.map((o, j) => <code key={o} className="res" style={{ opacity: m >= b.at + RUN * (j + 1) ? 1 : 0.0001 }}><i>✓</i>{o}</code>)}</div>
                : <div className="bt-tool bt-sub" key={way}><div className="th"><span>{way === 'browser' ? 'Submitted in the browser' : <>builder-day › <code>submit</code></>}</span>{tick(b.at)}</div><code className="nt">{way === 'browser' ? 'supabase.com/builderday' : `${YOURS} · ${you.code}`}</code></div>}
            </li>
          ))}
        </ol>
        <div className="bt-in">
          <i aria-hidden="true">›</i><span className="cur" aria-hidden="true" /><span className="ph">Ask for changes</span>
          <span className="how-stamp" data-on={sent ? '' : undefined}><b>Submitted</b><span>min {SUBMIT_AT}</span></span>
        </div>
      </div>
      <div className="how-ways" role="group" aria-label="Two ways to submit">
        <span className="wk">Submit</span>
        {(['browser', 'editor'] as const).map((w) => (
          <button key={w} type="button" aria-pressed={way === w} onClick={() => setWay(w)}>{w === 'browser' ? 'In your browser' : 'From your editor'}</button>
        ))}
      </div>
    </div>
  );
});
