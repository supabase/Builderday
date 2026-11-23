'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { WheelCfg } from '@/components/wheel/config';
import type { OurWheel } from '@/components/preview/facts';
import { ARRIVALS, FOLD_BOUNDS, FOLD_CHOICES, FOLD_INT, clampFold, type Arrival, type FoldCfg } from '@/components/preview/fold/config';
import { FOLD_GROUPS, FOLD_LABELS } from '@/components/preview/fold/knobs';
import { FoldPage } from '@/components/preview/fold/fold';
import { LabPanel, togglePanel, useLabSave } from './lab-kit';

/* /lab/arrive: the first screen of /preview with its ten arrivals, numbered, for the owner to pick from. Each one is
   the real page, played again from its first paint. Keys: 1 to 9 and 0 (for 10) play that arrival, R plays it again,
   W plays it at a quarter speed, \ the panel, S saves the arrival (and the knobs) to saved/fold.config.json, which
   /preview reads. ?n= opens on an arrival by its number, ?bare starts with the panel closed. Coming back with Back or Forward (quiet) is off here: every play is a first
   visit. */

/* a quarter speed for one play: the page's clock, its frames, its timers and its CSS animations all run slower. Lab
   only: it patches the window's clock while the play lasts and puts it back after. */
function slowFor(rate: number, ms: number): () => void {
  const w = window, real = { now: performance.now.bind(performance), raf: w.requestAnimationFrame.bind(w), st: w.setTimeout.bind(w) };
  const t0 = real.now(), slow = () => t0 + (real.now() - t0) * rate;
  performance.now = slow;
  w.requestAnimationFrame = (f) => real.raf(() => f(slow()));
  w.setTimeout = ((f: TimerHandler, d?: number, ...a: unknown[]) => real.st(f, (d ?? 0) / rate, ...a)) as typeof setTimeout;
  let live = true;
  const tick = () => { if (!live) return; document.getAnimations().forEach((a) => { if (a.playbackRate !== rate) a.playbackRate = rate; }); real.raf(tick); };
  real.raf(tick);
  const undo = () => {
    if (!live) return; live = false;
    performance.now = real.now; w.requestAnimationFrame = real.raf; w.setTimeout = real.st as typeof setTimeout;
    document.getAnimations().forEach((a) => { a.playbackRate = 1; });
  };
  real.st(undo, ms / rate);
  return undo;
}

const NUM = (a: Arrival) => ARRIVALS.indexOf(a as (typeof ARRIVALS)[number]) + 1;

export function ArriveLab({ saved, wheel, ours, q, nowMs }: { saved: Partial<FoldCfg>; wheel: WheelCfg; ours: OurWheel; q: Record<string, string | undefined>; nowMs: number }) {
  const first = (): Arrival => { const n = Math.round(Number(q.n)); return n >= 1 && n <= ARRIVALS.length ? ARRIVALS[n - 1] : clampFold(saved).arrival; };
  const [cfg, setCfg] = useState<FoldCfg>(() => ({ ...clampFold(saved), dir: 'line', arrival: first(), back: 'same' }));
  const [play, setPlay] = useState(0), [slow, setSlow] = useState(false), undo = useRef<() => void>(() => {});
  const set = useCallback((k: string, v: unknown) => setCfg((c) => ({ ...clampFold({ ...c, [k]: v }), dir: 'line', back: 'same' })), []);
  const { save, msg, rail } = useLabSave('fold', 'lab-fold-saved');
  /* Save keeps /preview's own arrival on Back or Forward (quiet) */
  const doSave = useCallback(() => save({ ...cfg, back: clampFold(saved).back }), [cfg, save, saved]);
  /* a play: back to the top, a new page, the saved session mark forgotten */
  const again = useCallback((a?: Arrival, rate = 1) => {
    undo.current();
    try { sessionStorage.removeItem('hackday-arrived'); sessionStorage.removeItem('hackday-globe-arrived'); } catch { /* storage blocked */ }
    window.scrollTo({ top: 0 });
    if (a) setCfg((c) => ({ ...c, arrival: a }));
    setSlow(rate !== 1);
    if (rate !== 1) undo.current = slowFor(rate, 3000);
    setPlay((p) => p + 1);
  }, []);
  useEffect(() => () => undo.current(), []);
  /* ?bare: the panel closed (for recordings) */
  useEffect(() => { if (q.bare !== undefined) document.documentElement.classList.add('lab-closed'); }, [q.bare]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const n = e.key === '0' ? 10 : Number(e.key);
      if (n >= 1 && n <= ARRIVALS.length) again(ARRIVALS[n - 1]);
      else if (e.key === 'r' || e.key === 'R') again();
      else if (e.key === 'w' || e.key === 'W') again(undefined, 0.25);
      else if (e.key === '\\') togglePanel();
      else if (e.key === 's' || e.key === 'S') doSave();
    };
    document.addEventListener('keydown', on); return () => document.removeEventListener('keydown', on);
  }, [again, doSave]);

  const out = (k: string) => { const v = cfg[k as keyof FoldCfg]; return typeof v === 'number' ? (FOLD_INT.has(k) ? String(v) : String(+v.toFixed(3))) : String(v); };
  const motion = FOLD_GROUPS.filter((g) => g.name === 'Motion').map((g) => ({ ...g, knobs: g.knobs.filter((k) => !/^(row|conv|flap|bloom|roll|dry|prize|erase|reg|hover|line)/.test(k.k)) }));
  const groups = [{ name: 'Arrival', knobs: [{ k: 'arrival', kind: 'select' as const, label: 'Arrival (keys 1 to 0)' }] }, ...motion];
  return (
    <FoldPage key={play} cfg={cfg} wheel={wheel} ours={ours} forced={null} noGl={q.gl === '0'} nowMs={nowMs}>
      <LabPanel title="Arrive: the first screen, ten ways" cfg={cfg} bounds={FOLD_BOUNDS} choices={{ ...FOLD_CHOICES, arrival: [...ARRIVALS] }} groups={groups} set={(k, v) => { set(k, v); if (k === 'arrival') again(v as Arrival); }}
        moments={[]} momentIdx={-1} out={out} optionLabel={(_k, v) => FOLD_LABELS[v] || v}
        meter={{ text: `Playing ${NUM(cfg.arrival)}: ${FOLD_LABELS[cfg.arrival]?.replace(/^\d+ /, '')}${slow ? ', at a quarter speed' : ''}. Keys: 1 to 9 and 0 play one, R again, W at a quarter speed, S makes it /preview’s.`, bad: false }}
        msg={msg} rail={rail} railLabel={(s) => `${NUM(s.arrival as Arrival)}: ${s.arrival}`} apply={(s) => { setCfg({ ...clampFold(s), dir: 'line', back: 'same' }); again(); }}
        buttons={[['Play again', () => again(), false], ['Quarter speed', () => again(undefined, 0.25), false], ['Save to /preview', doSave, true]]} />
    </FoldPage>
  );
}
