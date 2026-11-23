'use client';
import { useMemo, useRef, useSyncExternalStore, type RefObject } from 'react';
import type { WheelCfg } from '@/components/wheel/config';
import type { WheelEngine } from '@/components/wheel/engine';
import { Wheel, type MarkMode } from '@/components/wheel/wheel';
import { STUDY_CITIES, STUDY_DATE } from './study-facts';
import { countdown, nearestCity, type OurWheel } from './our-facts';
import type { Direction } from './direction-list';
import { SheetWheel } from '@/components/preview/preview';
import '@/components/preview/preview.css';
import { CITY_WORD, CITY_WORD_CAP } from '@/lib/day-data';

/* Round W2: the study as it is (with its own facts, the reference for the port), the study with our facts, and three
   ways to say what a preview page owes a stranger: the format and the prize. In every one of ours the wheel opens on
   the visitor's nearest city by time zone, the cells gain a countdown, and the link names the city. */


type P = { dir: Direction; cfg: WheelCfg; noGl: boolean; mark: MarkMode; engineRef: RefObject<WheelEngine | null>; ours: OurWheel; forced: number | null };
const CAPTION = `The ${CITY_WORD} cities, from the first to start to the last`;

/* the clock, in 30 second steps; the server has none, so the countdown cell appears after hydration */
const tick = (f: () => void) => { const t = window.setInterval(f, 30000); return () => window.clearInterval(t); };
const useNow = () => useSyncExternalStore(tick, () => Math.floor(Date.now() / 30000) * 30000, () => 0);
const never = () => () => {};
const useVisitorOffset = () => useSyncExternalStore(never, () => -new Date().getTimezoneOffset(), () => null);

export function Directions(p: P) {
  if (p.dir === 'study') return <Wheel cities={STUDY_CITIES} cfg={p.cfg} noGl={p.noGl} mark={p.mark === 'name' ? 'hack' : p.mark} engineRef={p.engineRef} start={p.forced ?? 0} date={STUDY_DATE} caption={CAPTION} />;
  return <Ours {...p} />;
}

function Ours({ dir, cfg, noGl, mark, engineRef, ours, forced }: P) {
  const now = useNow(), off = useVisitorOffset();
  const start = forced ?? (off === null ? 0 : nearestCity(ours.cities, off));
  const cities = useMemo(() => ours.cities.map((c) => ({ ...c, soon: now ? countdown(c, now) : undefined })), [ours, now]);
  const sheet = useRef<HTMLDialogElement>(null);
  const common = { cities, cfg, noGl, mark, engineRef, start, date: ours.date, caption: CAPTION };

  if (dir === 'wheel') return (
    <Wheel {...common} className="wd-tagged">
      <p className="wd-tagline">{CITY_WORD_CAP} cities. One day. Build for {ours.buildMin} minutes.</p>
    </Wheel>
  );
  if (dir === 'rail') return (
    <Wheel {...common} foot={
      <dl className="wd-rail" aria-label="How the day works">
        {ours.format.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
    } />
  );
  if (dir === 'sheet') return (
    <Wheel {...common}>
      <button type="button" className="wd-how" onClick={() => sheet.current?.showModal()}>How it works</button>
      {/* in the wheel, so it has the wheel's faces; the wheel ignores input from inside it */}
      <dialog ref={sheet} className="wd-sheet" aria-labelledby="wd-sheet-h" data-wheel-skip onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}>
        <div className="wd-sheet-in">
          <div className="wd-sheet-top">
            <h2 id="wd-sheet-h">How it works</h2>
            <button type="button" className="wd-close" onClick={() => sheet.current?.close()}>Close</button>
          </div>
          <p className="wd-lede">{CITY_WORD_CAP} cities, one day: {ours.date}. Each city starts at its own local time, builds for {ours.buildMin} minutes, and votes until {ours.voteAfter} minutes after.</p>
          <dl className="wd-grid">{ours.format.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          <h3>Questions</h3>
          <dl className="wd-faq">{ours.how.map(([q, a]) => <div key={q}><dt>{q}</dt><dd>{a}</dd></div>)}</dl>
        </div>
      </dialog>
    </Wheel>
  );
  if (dir === 'sheet2') return <SheetWheel cfg={cfg} noGl={noGl} mark={mark} engineRef={engineRef} ours={ours} forced={forced} />;
  return <Wheel {...common} />;
}
