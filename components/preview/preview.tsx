'use client';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { WHEEL_BOUNDS, WHEEL_CHOICES, clampWheel, type WheelCfg } from '@/components/wheel/config';
import type { WheelEngine } from '@/components/wheel/engine';
import { Wheel, type MarkMode } from '@/components/wheel/wheel';
import { WHEEL_GROUPS, WHEEL_INT, WHEEL_LABELS } from '@/components/wheel/knobs';
import { LabPanel, togglePanel, useLabSave } from '@/components/admin/kit';
import { HowItWorks, PrizeBlock } from '@/components/day/explain';
import { GetReady } from '@/components/day/get-ready';
import { lumaHref } from '@/lib/luma';
import { countdown, nearestCity, type Here, type OurFact, type OurWheel } from './facts';
import './preview.css';
import '@/components/day/explain.css';
import { CITY_WORD, CITY_WORD_CAP } from '@/lib/day-data';

/* The preview home (/preview), until the day: the city wheel with our facts, opening on the visitor's nearest city by
   time zone, each city's cell with its countdown and a link to register on Luma; "How it works" opens the sheet with
   the day, the tubes and the prizes. The look is saved/wheel.config.json (tuned at /lab/wheel); ?admin shows the
   wheel's knobs, and Save writes the file on the dev server (copies it anywhere else). */

export const CAPTION = `The ${CITY_WORD} cities, from the first to start to the last`;

/* the clock, in 30 second steps; the server has none, so the countdown cell appears after hydration */
const tick = (f: () => void) => { const t = window.setInterval(f, 30000); return () => window.clearInterval(t); };
const useNow = () => useSyncExternalStore(tick, () => Math.floor(Date.now() / 30000) * 30000, () => 0);
const never = () => () => {};
const useVisitorOffset = () => useSyncExternalStore(never, () => -new Date().getTimezoneOffset(), () => null);

/* our cities with their countdowns, and the one to open on */
export function useOurCities(ours: OurWheel, forced: number | null, here: Here | null = null): { cities: (OurFact & { soon?: string })[]; start: number } {
  const now = useNow(), off = useVisitorOffset();
  const start = forced ?? (off === null ? 0 : nearestCity(ours.cities, off, here));
  const cities = useMemo(() => ours.cities.map((c) => ({ ...c, soon: now ? countdown(c, now) : undefined })), [ours, now]);
  return { cities, start };
}

type SheetProps = { cfg: WheelCfg; noGl: boolean; mark: MarkMode; engineRef: RefObject<WheelEngine | null>; ours: OurWheel; forced: number | null };
/* the wheel with the Details sheet: registrations on Luma for now, the link under the wheel and the sheet's first button */
export function SheetWheel({ cfg, noGl, mark, engineRef, ours, forced }: SheetProps) {
  const { cities, start } = useOurCities(ours, forced), sheet = useRef<HTMLDialogElement>(null);
  /* the day pages' footer links here for the questions: #how and #questions open the sheet at that part */
  useEffect(() => {
    const id = window.location.hash.slice(1), d = sheet.current;
    if (!d || (id !== 'questions' && id !== 'how')) return;
    d.showModal(); const el = document.getElementById(id === 'how' ? 'wd-how-h' : 'questions'); el?.scrollIntoView({ block: 'start' }); if (id === 'questions') el?.focus({ preventScroll: true });
  }, []);
  const reg = cities.map((c) => ({ ...c, href: lumaHref(c.id), action: c.status === 'full' ? 'Join the waiting list in ' + c.name : 'Register for ' + c.name }));
  const f = { buildMin: ours.buildMin, voteAfter: ours.voteAfter, startHour: ours.startHour, date: ours.date };
  return (
    <Wheel cities={reg} cfg={cfg} noGl={noGl} mark={mark} engineRef={engineRef} start={start} date={ours.date} caption={CAPTION}>
      <button type="button" className="wd-how" onClick={() => { sheet.current?.showModal(); document.getElementById('wd-how-h')?.scrollIntoView({ block: 'start' }); }}>How it works</button>
      {/* in the wheel, so it has the wheel's faces; the wheel ignores input from inside it */}
      <dialog ref={sheet} className="wd-sheet wd-sheet2" aria-labelledby="wd-sheet-h" data-wheel-skip onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}>
        <div className="wd-sheet-in">
          <div className="wd-sheet-top">
            <h2 id="wd-sheet-h">The day</h2>
            <button type="button" className="wd-close" onClick={() => sheet.current?.close()}>Close</button>
          </div>
          <p className="wd-lede">{CITY_WORD_CAP} cities, one day: {ours.date}. Each city starts at its own local time, builds for {ours.buildMin} minutes, and votes until {ours.voteAfter} minutes after.</p>
          <p className="wd-reg"><a className="ex-reg" href={lumaHref()}>Register on Luma<span aria-hidden="true">→</span></a></p>
          <GetReady compact id="wd-ready" level={3} register={false} />
          <HowItWorks f={f} compact id="wd-how" level={3} />
          <PrizeBlock compact id="wd-prize" level={3} />
          <h3 className="wd-qh" id="questions" tabIndex={-1}>Questions</h3>
          <dl className="wd-faq">{ours.how.map(([q, a]) => <div key={q}><dt>{q}</dt><dd>{a}</dd></div>)}</dl>
        </div>
      </dialog>
    </Wheel>
  );
}

/* the page: the wheel as saved; with ?admin, its knobs */
export function Preview({ saved, ours, q }: { saved: WheelCfg; ours: OurWheel; q: Record<string, string | undefined> }) {
  const admin = q.admin !== undefined, [cfg, setCfg] = useState<WheelCfg>(saved), eng = useRef<WheelEngine | null>(null);
  const set = useCallback((k: string, v: unknown) => setCfg((c) => clampWheel({ ...c, [k]: v })), []);
  const { save, msg, rail } = useLabSave('wheel', 'lab-wheel-saved');
  const doSave = useCallback(() => save({ ...cfg }), [cfg, save]);
  useEffect(() => {
    if (!admin) return;
    const on = (e: KeyboardEvent) => { const t = e.target as HTMLElement | null; if (e.metaKey || e.ctrlKey || e.altKey || (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return; if (e.key === '\\') togglePanel(); else if (e.key === 's' || e.key === 'S') doSave(); };
    document.addEventListener('keydown', on); return () => document.removeEventListener('keydown', on);
  }, [admin, doSave]);
  const out = (k: string) => { const v = cfg[k as keyof WheelCfg]; return typeof v === 'number' ? (WHEEL_INT.has(k) ? String(v) : String(+v.toFixed(3))) : String(v); };
  const forced = q.city !== undefined && q.city !== '' ? Math.max(0, Math.min(ours.cities.length - 1, Math.round(Number(q.city)) || 0)) : null;
  return (
    <>
      <SheetWheel cfg={cfg} noGl={q.gl === '0'} mark={cfg.mark} engineRef={eng} ours={ours} forced={forced} />
      {admin ? (
        <LabPanel tab="Admin" title="Preview: admin" cfg={{ ...cfg, seed: 'none' }} bounds={WHEEL_BOUNDS} choices={WHEEL_CHOICES} groups={WHEEL_GROUPS} set={set} moments={[]} momentIdx={-1}
          out={out} optionLabel={(_k, v) => WHEEL_LABELS[v] || v} meter={{ text: 'The wheel as saved in saved/wheel.config.json.', bad: false }}
          msg={msg} rail={rail} railLabel={(s) => `Step ${s.step}, size ${s.labelSize}, lines ${s.lineAlpha}, ${s.font}`} apply={(s) => setCfg(clampWheel(s))}
          buttons={[['Save', doSave, true]]} />
      ) : null}
    </>
  );
}
