'use client';
import { memo, type CSSProperties } from 'react';
import { END_MIN, YOURS } from './how-data';
import type { WaysLook } from './ways-config';

/* 1 Build in How Builder Day works, drawn as the two ways to submit: one window on the day's clock, and the reader's
   toggle swaps what is in it. In the browser: a form with two fields (the GitHub repo, the preview link); from the
   editor: you ask, and the editor server's submit sends the same two. Both run the same three checks and end on the same
   green Submitted (minute 46 as saved). Both ways are drawn in the same cell, the one not shown hidden, so the window is as tall
   as the taller and swapping never moves the page. A pure function of its progress p (0 to 1), finished at p = 1, so the
   server's HTML is the finished picture. */

type City = { id: string; code: string; name: string };
export type Way = 'browser' | 'editor';
const pad = (n: number) => String(n).padStart(2, '0');
const REPO = 'github.com/you/gig-map', LINK = 'gig-map.vercel.app';
/* the checks, the same both ways: the repository can be read, the project is real (verified behind the scenes), it is in
   before building closes */
const checksAt = (at: number): [string, string][] => [['Public repo', 'can be read'], ['Real project', 'behind the scenes'], ['Before minute ' + END_MIN, 'min ' + at]];

/* the clock against p: to the submit's first minute through the lead, then on to the submit, held there */
const clock = (p: number, w: WaysLook) => p >= w.send ? w.at : p <= w.lead ? (w.lead > 0 ? (p / w.lead) * w.from : w.from) : w.from + (w.at - w.from) * ((p - w.lead) / (w.send - w.lead));
/* how much of a value is typed between two points of p */
const typed = (s: string, p: number, a: number, b: number) => s.slice(0, Math.round(s.length * Math.max(0, Math.min(1, (p - a) / Math.max(0.001, b - a)))));

function Checks({ p, w }: { p: number; w: WaysLook }) {
  if (w.checks === 'none') return null;
  return (
    <ul className="sw-checks">
      {checksAt(w.at).map(([what, note], i) => {
        const t0 = w.check + w.checkStep * i, ok = p >= t0 + w.checkStep, run = !ok && p >= t0;
        return (
          <li key={what} data-ok={ok ? '' : undefined} data-run={run ? '' : undefined}>
            <span className="ck">{ok ? '✓' : run ? ':::' : '·'}</span><span className="w">{what}</span><span className="n">{note}</span>
          </li>
        );
      })}
    </ul>
  );
}

export const SubmitWays = memo(function SubmitWays({ p, look: w, way, setWay, you }: { p: number; look: WaysLook; way: Way; setWay?: (w: Way) => void; you: City }) {
  const m = clock(p, w), sent = p >= w.send;
  const r = typed(REPO, p, w.lead, w.type1), l = typed(LINK, p, w.type1, w.type2);
  const at = p < w.type1 && p > w.lead ? 'repo' : p < w.type2 && p >= w.type1 ? 'link' : null;
  const asked = p > w.lead * 0.6;
  const state = sent ? 'Submitted' : p > w.lead ? 'Submitting' : 'Building';
  const label = way === 'browser'
    ? `Submitting in the browser: on supabase.com/builderday you paste your GitHub repo and your preview link, the three checks pass (a public repo, a real project verified behind the scenes, before minute ${END_MIN}), and at minute ${w.at} it is submitted.`
    : `Submitting from your editor: you ask it to submit, the builder-day server sends your GitHub repo and your preview link, the same three checks pass, and at minute ${w.at} it is submitted.`;
  const caret = (on: boolean) => (on ? <i className="sw-cur" aria-hidden="true" /> : null);
  return (
    <div className="sw" data-chrome={w.chrome} style={{ ['--sw-swap' as string]: w.swapMs + 'ms', ['--sw-rise' as string]: w.swapRise + 'px' } as CSSProperties}>
      <div className="sw-win" role="img" aria-label={label}>
        <div className="sw-bar">
          <span className="sw-tab" key={way}>{way === 'browser' ? <><i className="sw-lock" aria-hidden="true" />supabase.com/builderday</> : <><i className="sw-dot" aria-hidden="true" />~/gig-map</>}</span>
          <span className="sw-clk" data-s={state.toLowerCase()}>Min <b>{pad(Math.floor(m))}</b><span> / {END_MIN}</span></span>
          <span className="sw-prog" data-sent={sent ? '' : undefined} style={{ width: ((Math.min(m, w.at) / END_MIN) * 100).toFixed(2) + '%' }} />
        </div>
        <div className="sw-stage" aria-hidden="true">
          {/* in the browser */}
          <div className="sw-way sw-form" data-off={way !== 'browser' ? '' : undefined}>
            <p className="sw-title"><span>Submit <b>{YOURS}</b></span><span className="sw-city">{you.code}</span></p>
            <div className="sw-f" data-at={at === 'repo' ? '' : undefined}><span className="k">GitHub repo</span><span className="v">{r ? <span>{r}</span> : <span className="ph">github.com/…</span>}{caret(at === 'repo')}</span></div>
            <div className="sw-f" data-at={at === 'link' ? '' : undefined}><span className="k">Preview link</span><span className="v">{l ? <span>{l}</span> : <span className="ph">https://…</span>}{caret(at === 'link')}</span></div>
            <Checks p={p} w={w} />
            <span className="sw-btn" data-sent={sent ? '' : undefined}><span className="a">Submit</span><span className="b">✓ Submitted · min {w.at}</span></span>
          </div>
          {/* from the editor */}
          <div className="sw-way sw-chat" data-off={way !== 'editor' ? '' : undefined}>
            <p className="sw-me" data-on={asked ? '' : undefined}><i>›</i>Submit {YOURS} to Builder Day.</p>
            <div className="sw-tool" data-on={p > w.lead ? '' : undefined}>
              <div className="th"><span>builder-day › <code>submit</code></span><span className="st" data-ok={sent ? '' : undefined}>{sent ? '✓ done' : p > w.lead ? ':::' : ''}</span></div>
              <code className="sw-arg" data-at={at === 'repo' ? '' : undefined}><i className="k">repo</i><span>{r}</span>{caret(at === 'repo')}</code>
              <code className="sw-arg" data-at={at === 'link' ? '' : undefined}><i className="k">link</i><span>{l}</span>{caret(at === 'link')}</code>
              <Checks p={p} w={w} />
            </div>
            <p className="sw-re" data-on={sent ? '' : undefined}>Submitted at minute {w.at}. {YOURS} is on the {you.name} board.</p>
          </div>
        </div>
      </div>
      {setWay ? (
        <div className="how-ways" role="group" aria-label="Two ways to submit">
          <span className="wk">Submit</span>
          {(['browser', 'editor'] as const).map((x) => (
            <button key={x} type="button" aria-pressed={way === x} onClick={() => setWay(x)}>{x === 'browser' ? 'In your browser' : 'From your editor'}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
});

