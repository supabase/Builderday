'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GetReady } from '@/components/day/get-ready';
import { EDITOR_ROOM } from '@/lib/event/rule';
import { RULES, SERVER, sayIt } from '@/lib/hackday-server';
import { once } from './motion';
import { reducedMotion } from './flap';

/* Get ready: the steps, and beside them the dry run, a framed tube that shows what submitting looks like on the day,
   in two takes: in the browser (the page, the room's code, the three fields) and from the editor (the sentence, the
   editor asking for the code). Both end with one line per rule with its tick, then the project's link. The browser
   take shows first, so the editor never reads as the only way. Every line is there without JavaScript. Played, the
   lines stamp in whole, one a step apart; a press plays it again, and picking a take plays that one. Low on the page
   it plays only on a press. */
type Take = 'browser' | 'editor';

export function FoldReady({ city, cityId, mode, auto, step, hold, level = 2, onSignIn }: {
  city: string; cityId: string; mode: 'dry' | 'steps'; auto: boolean; step: number; hold: number; level?: 2 | 3; onSignIn?: () => void;
}) {
  return (
    <div className="pf-ready" data-mode={mode}>
      <GetReady city={city} cityId={cityId} id="ready" level={level} onSignIn={onSignIn} />
      {mode === 'dry' ? <DryRun city={city} cityId={cityId} auto={auto} step={step} hold={hold} /> : null}
    </div>
  );
}

function DryRun({ city, cityId, auto, step, hold }: { city: string; cityId: string; auto: boolean; step: number; hold: number }) {
  const box = useRef<HTMLElement>(null), [run, setRun] = useState(0), [shown, setShown] = useState<number | null>(null), [take, setTake] = useState<Take>('browser');
  const lines: [string, string][] = [
    ...(take === 'browser'
      ? [['do', `Open ${city}’s page and press Submit.`], ['ask', 'Type the code on the screen in the room.'], ['do', 'Your project’s name, a one-line pitch, its GitHub repository.']] as [string, string][]
      : [['say', sayIt(city)], ['ask', EDITOR_ROOM]] as [string, string][]),
    ...RULES.map((r) => ['rule', r] as [string, string]),
    ['link', `Your project’s link: /city/${cityId}/p/your-project`],
  ];
  const n = lines.length, timers = useRef<number[]>([]);
  /* one line a step; the link waits a little longer, as the server's answer would */
  const play = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t)); timers.current = [];
    setRun((r) => r + 1);
    if (reducedMotion() || step <= 0) { setShown(null); return; }
    setShown(1);
    for (let i = 2; i <= n; i++) timers.current.push(window.setTimeout(() => setShown(i === n ? null : i), (i - 1) * step + (i === n ? hold : 0)));
  }, [n, step, hold]);
  useEffect(() => (auto ? once(box.current, 0.5, play) : undefined), [auto, play]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  /* picking a take plays it from its first line (the effect below, once the new lines are in) */
  const pick = (t: Take) => { if (t !== take) { setTake(t); setRun(0); } };
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } play(); }, [take]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <figure ref={box} className="pf-dry" aria-labelledby="pf-dry-cap">
      <div className="pf-dry-takes" role="group" aria-label="Two ways to submit">
        {([['browser', 'In the browser'], ['editor', 'From your editor']] as [Take, string][]).map(([t, label]) => (
          <button key={t} type="button" className="pf-key pf-take" aria-pressed={take === t} onClick={() => pick(t)}>{label}</button>
        ))}
      </div>
      <ol className="pf-dry-lines" key={take}>
        {lines.map(([k, t], i) => (
          <li key={i} data-k={k} data-off={shown !== null && i >= shown ? '' : undefined}>
            {k === 'rule' ? <span className="pf-tickmark" aria-hidden="true" /> : k === 'say' ? <span className="pf-caret" aria-hidden="true">&gt;</span> : null}
            <span>{t}</span>
          </li>
        ))}
      </ol>
      <figcaption id="pf-dry-cap" className="pf-dry-cap">
        <span>{take === 'browser' || SERVER.live ? 'What submitting looks like on the day.' : 'A rehearsal of submitting on the day. The server is not open yet.'}</span>
        <button type="button" className="pf-key" onClick={play}><span className="pf-key-w"><span>{run ? 'Play it again' : 'Play it'}</span><span aria-hidden="true">Play it again</span></span></button>
      </figcaption>
    </figure>
  );
}
