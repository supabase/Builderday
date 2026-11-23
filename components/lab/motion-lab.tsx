'use client';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { CITIES, nowOf, sched } from '@/lib/day-data';
import { hhmm } from '@/lib/format';
import { pageVars, world, type HomeCfg } from '@/lib/home';
import { cityEvents } from '@/lib/wire';
import { MOTION_BOUNDS, MOTION_CHOICES, MOTION_DEF, clampMotion, motionVars, type MotionCfg } from '@/lib/motion';
import { FRAME } from '@/components/shared/page-parts';
import { DayProvider } from '@/components/home/day-context';
import { HomeMain } from '@/components/home/home-main';
import { LookProvider, type HoverMode, type Look, type WireMode, type Zoom } from '@/components/home/look';
import { Sheet } from '@/components/home/sheet';
import { Diagram } from '@/components/home/final';
import { LabPanel, togglePanel, useLabSave, type Group } from './lab-kit';
import '@/components/home/day.css';
import '@/components/home/sheet.css';
import './motion-lab.css';

/* The motion lab: every motion value on a control, played on the real parts. The home is drawn here with the lab
   holding the clock, so a moment can be played by moving time across it in the same page (a wire line arriving, a
   city's finalists landing, the pick). The city page runs in a frame, with the values pushed onto its <html>, so its
   own sheet, presses and hover play as they will. Save writes saved/motion.config.json, which the root layout turns
   into the tokens on every page. */

type SavedLook = { sheetNm: number; sheetRh: number; sheetSw: number; names: string; wire: string; hover: string; zoom: string; factPrizes?: number; finRh: number; curve: number };
const GROUPS: Group[] = [
  { name: 'Press', knobs: [{ k: 'press', kind: 'range', label: 'Scale' }, { k: 'durPress', kind: 'range', label: 'Duration' }] },
  { name: 'Hover', knobs: [{ k: 'durHover', kind: 'range', label: 'Colour' }, { k: 'wash', kind: 'range', label: 'Row wash' }, { k: 'previewScale', kind: 'range', label: 'Preview from' }] },
  { name: 'Project sheet', knobs: [{ k: 'durPanel', kind: 'range', label: 'In' }, { k: 'durPanelExit', kind: 'range', label: 'Out' }, { k: 'easeDrawer', kind: 'select', label: 'In curve' }, { k: 'easeExit', kind: 'select', label: 'Out curve' }, { k: 'sheetFrom', kind: 'select', label: 'Comes from' }] },
  { name: 'Home to city', knobs: [{ k: 'durVt', kind: 'range', label: 'Duration' }] },
  { name: 'The wire', knobs: [{ k: 'slide', kind: 'range', label: 'Slide' }, { k: 'durFlash', kind: 'range', label: 'Lit for' }] },
  { name: 'Finalists landing', knobs: [{ k: 'durDraw', kind: 'range', label: 'Draw' }, { k: 'stagger', kind: 'range', label: 'Stagger' }] },
  { name: 'The pick', knobs: [{ k: 'durReveal', kind: 'range', label: 'Reveal' }] },
  { name: 'The day on air', knobs: [{ k: 'durAirReveal', kind: 'range', label: 'Votes revealed' }, { k: 'durAirPrint', kind: 'range', label: 'A print (final lines, ranking rows)' }] },
  { name: 'How it works', knobs: [{ k: 'tourStep', kind: 'range', label: 'Each step, at least' }, { k: 'durJump', kind: 'range', label: 'Jump to a step' }] },
  { name: 'How it works: the morning line', knobs: [{ k: 'tourTurn', kind: 'range', label: 'One turn of the globe' }, { k: 'tourHold', kind: 'range', label: 'Rest after Build and Vote' }, { k: 'pickHold', kind: 'range', label: 'Rest on the pick' }, { k: 'durFlight', kind: 'range', label: 'A finalist flies' }, { k: 'durCross', kind: 'range', label: 'Ring at the 09:00 line' }] },
  { name: 'Footer', knobs: [{ k: 'durDot', kind: 'range', label: 'Screen off: line and dot' }, { k: 'durTurn', kind: 'range', label: 'Globe turns to a city' }] },
  { name: 'Looking', knobs: [{ k: 'slow', kind: 'range', label: 'Slower ×' }] },
];
const LABELS: Record<string, string> = { drawer: 'Drawer', out: 'Out', expo: 'Expo out', quart: 'Quart out', exit: 'Exit', 'in-quad': 'In (quad)', 'in-out': 'In and out', edge: 'The edge', nudge: 'A nudge' };
const STAGES: [string, string][] = [['home', 'Home'], ['city', 'City page']];
const PICK_KEY = 'hackday-pick-seen', REDUCE = '(prefers-reduced-motion: reduce)';
function onReduce(f: () => void) { const m = window.matchMedia(REDUCE); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }

export function MotionLab({ saved, cfg: home, look }: { saved: MotionCfg; cfg: HomeCfg; look: SavedLook }) {
  const [cfg, setCfg] = useState<MotionCfg>(saved);
  const set = useCallback((k: string, v: unknown) => setCfg((c) => clampMotion({ ...c, [k]: v })), []);
  const { save, msg, rail } = useLabSave('motion', 'lab-motion-saved');
  const doSave = useCallback(() => save({ ...cfg }), [cfg, save]);
  const [stage, setStage] = useState('home'), [as, setAs] = useState('visitor');
  const still = useSyncExternalStore(onReduce, () => window.matchMedia(REDUCE).matches, () => false);
  const frame = useRef<HTMLIFrameElement>(null);

  /* the values go onto <html> here and in the frame; under reduced motion they stay off, as on the real pages */
  const push = useCallback((d: Document | null | undefined) => {
    if (!d || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const v = motionVars(cfg, cfg.slow);
    Object.keys(v).forEach((k) => d.documentElement.style.setProperty(k, v[k]));
  }, [cfg]);
  useEffect(() => { push(document); push(frame.current?.contentDocument); }, [push]);

  /* the home's clock, held here */
  const S = useMemo(() => sched(home), [home]);
  const [now, setNow] = useState(() => nowOf(0.5, S));
  const W = useMemo(() => world({ ...home, now }), [home, now]);
  const timers = useRef<number[]>([]);
  const after = (ms: number, f: () => void) => { timers.current.push(window.setTimeout(f, ms)); };
  const stop = () => { timers.current.forEach((t) => window.clearTimeout(t)); timers.current = []; };
  useEffect(() => () => stop(), []);
  const toFinal = () => document.getElementById('final')?.scrollIntoView({ block: 'center' });

  /* the plays: each sets the clock just before the moment, waits a beat, then moves across it */
  const playWire = () => {
    stop(); window.scrollTo({ top: 0 });
    const ev = W.cs.flatMap((x, i) => cityEvents(x.sd, W.S.cs[i])).map((e) => e.m).sort((a, b) => a - b);
    const next = ev.find((m) => m > now + 0.01) ?? ev[0];
    setNow(next - 0.5); after(700, () => setNow(next));
  };
  const playLanding = () => {
    stop();
    const ends = W.S.cs.map((x) => x.end).sort((a, b) => a - b), e = ends.find((m) => m > now + 0.01) ?? ends[0];
    setNow(e - 1); after(60, toFinal); after(800, () => setNow(e + 0.5));
  };
  const playPick = () => {
    stop(); try { localStorage.removeItem(PICK_KEY); } catch { /* storage blocked */ }
    setNow(W.S.pickAt - 1); after(60, toFinal); after(800, () => setNow(W.S.pickAt + 1));
  };
  /* the city page in its frame */
  const doc = () => frame.current?.contentDocument;
  const openOne = () => { const a = doc()?.querySelector<HTMLElement>('.cl-sheet a[data-pid], a[data-pid]'); a?.click(); };
  const closeIt = () => { const d = doc()?.querySelector<HTMLDialogElement>('dialog#pv'); if (d?.open) d.close(); };
  const toHome = () => { const f = frame.current; if (f) f.src = '/?moment=vote'; };
  const toCity = () => { const a = doc()?.querySelector<HTMLAnchorElement>('.hs-row a[data-city]'); a?.click(); };
  const src = '/city/' + CITIES[0].id + '?moment=vote' + (as === 'visitor' ? '' : '&as=' + as);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const tg = e.target as HTMLElement | null; if (e.metaKey || e.ctrlKey || e.altKey || (tg && /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName))) return;
      if (e.key === '\\') togglePanel(); else if (e.key === 's' || e.key === 'S') doSave();
    };
    document.addEventListener('keydown', on); return () => document.removeEventListener('keydown', on);
  }, [doSave]);

  const L = look, LOOK: Look = { wire: L.wire as WireMode, hover: L.hover as HoverMode, zoom: L.zoom as Zoom, round: 'final', factPrizes: !!L.factPrizes };
  const style = { ...pageVars(home), '--hs-nm': L.sheetNm, '--hs-rh': L.sheetRh, '--hs-sw': L.sheetSw } as CSSProperties;
  const out = (k: string) => { const v = cfg[k as keyof MotionCfg]; return k === 'press' || k === 'previewScale' ? String(v) : k === 'slow' ? '×' + v : v + 'ms'; };
  const label = (s: Record<string, unknown>) => 'Panel ' + s.durPanel + ' / ' + s.durPanelExit + ', draw ' + s.durDraw + ', pick ' + s.durReveal;

  return (
    <>
      {stage === 'home' ? (
        <div className={FRAME + ' hs-on'} id="day" data-mode="sheet" data-names={L.names}>
          <DayProvider cfg={{ ...home, now }} clock={{ at: now, preview: true, still: true }} carry={{ preview: true, still: true, lab: { panel: true } }} live={false}>
            <LookProvider value={LOOK}>
              <HomeMain style={style}>
                <Sheet />
                <Diagram finRh={L.finRh} curve={L.curve} />
              </HomeMain>
            </LookProvider>
          </DayProvider>
        </div>
      ) : (
        <iframe ref={frame} key={src} className="ml-frame" src={src} title="The city page" onLoad={() => push(frame.current?.contentDocument)} />
      )}
      <LabPanel title="Motion lab" cfg={{ ...cfg, seed: home.seed }} bounds={MOTION_BOUNDS} choices={MOTION_CHOICES} groups={GROUPS} set={set} moments={[]} momentIdx={-1}
        out={out} optionLabel={(_k, v) => LABELS[v] || v} meter={{ text: still ? 'Reduced motion is on in this browser: nothing moves, as on the real pages.' : 'Slower × applies here only.', bad: still }}
        msg={msg} rail={rail} railLabel={label} apply={(s) => setCfg(clampMotion(s as Partial<MotionCfg>))}
        buttons={[['Save', doSave, true], ['Defaults', () => setCfg({ ...MOTION_DEF })]]}>
        <fieldset><legend>Stage</legend>
          <div className="ml-row">{STAGES.map(([k, t]) => <button key={k} type="button" aria-pressed={stage === k} onClick={() => { stop(); setStage(k); }}>{t}</button>)}</div>
          {stage === 'home' ? (
            <>
              <p className="ml-note">Clock {hhmm(now)} UTC. Hover the rows for the wash and the preview.</p>
              <div className="ml-row">
                <button type="button" onClick={playWire}>Wire line</button>
                <button type="button" onClick={playLanding}>A city closes</button>
                <button type="button" onClick={playPick}>The pick</button>
              </div>
            </>
          ) : (
            <>
              <div className="ml-row">{['visitor', 'builder', 'judge'].map((k) => <button key={k} type="button" aria-pressed={as === k} onClick={() => setAs(k)}>{k[0].toUpperCase() + k.slice(1)}</button>)}</div>
              <div className="ml-row">
                <button type="button" onClick={openOne}>Open a project</button>
                <button type="button" onClick={closeIt}>Close it</button>
              </div>
              <div className="ml-row">
                <button type="button" onClick={toHome}>Go to the home</button>
                <button type="button" onClick={toCity}>Home to a city</button>
              </div>
              <p className="ml-note">The page between home and city loads fresh, so that move plays at the saved value: save, then play it.</p>
            </>
          )}
        </fieldset>
      </LabPanel>
    </>
  );
}
