'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CITIES } from '@/lib/day-data';
import { BOUNDS, KNOBS, MODES, SEAL_CITIES, clampCfg, forCity, merged, render, toSvgString, type Knob, type SealCfg, type SealCfgInput, type SealMode } from '@/lib/seal';
import { param, type Query } from '@/lib/clock';
import { SealSvgView } from '@/components/seal/seal-svg';
import { sealPaperVars } from '@/components/ground/head-script';
import { useLabSave } from './lab-kit';
import './seal-lab.css';

/* The seal tuning page: one large seal (click it for a new one), the ten cities at 120px and 24px, the winner's
   interlaced seal, and the knobs. Save writes saved/seal.config.json; ?mode= and ?seed= preview a variation.
   Keys: R new seed, S save, P replay. */
const NAMES: Record<string, string> = Object.fromEntries(CITIES.map((c) => [c.id, c.name]));
const LABELS: Record<string, string> = { lobes: 'Lobes', rings: 'Rings', amp: 'Amplitude', inner: 'Inner radius', drift: 'Phase drift', density: 'Density', interlace: 'Interlace', harmonic: 'Harmonic', loop: 'Loop / turns', gap: 'Ring gap', rails: 'Rails', weight: 'Line weight' };
const MODE_NAME: Record<SealMode, string> = { rosette: 'Rosette', band: 'Band', medallion: 'Medallion' };

/* the paper is set on <html> before the first paint (from the head script), so the page reads it from there */
const paperListeners = new Set<() => void>();
function onPaper(f: () => void) { paperListeners.add(f); return () => { paperListeners.delete(f); }; }
function setPaper(n: string) { const r = document.documentElement, v = sealPaperVars(n); Object.keys(v).forEach((k) => r.style.setProperty('--' + k, v[k])); r.dataset.paper = n; paperListeners.forEach((f) => f()); }

export function SealLab({ saved, q }: { saved: SealCfgInput; q: Query }) {
  const [cfg, setCfgRaw] = useState<SealCfg>(() => { const c = clampCfg(saved); const m = param(q, 'mode'), s = param(q, 'seed'); if (m) (c as SealCfgInput).mode = m as SealMode; if (s) c.seed = +s; return clampCfg(c); });
  const setCfg = useCallback((f: (c: SealCfg) => SealCfgInput) => setCfgRaw((c) => clampCfg(f(c))), []);
  const big = useRef<HTMLButtonElement>(null), win = useRef<HTMLDivElement>(null);
  /* the seals are drawn at the size they show at, so they wait for the layout (and redraw on resize) */
  const [size, setSize] = useState({ big: 0, win: 360 });
  useLayoutEffect(() => {
    const measure = () => setSize({ big: Math.round(big.current?.getBoundingClientRect().width || 0) || 600, win: Math.min(360, win.current?.getBoundingClientRect().width || 360) });
    measure(); let t = 0; const on = () => { clearTimeout(t); t = window.setTimeout(measure, 120); };
    window.addEventListener('resize', on); return () => { window.removeEventListener('resize', on); clearTimeout(t); };
  }, []);
  const paper = useSyncExternalStore(onPaper, () => document.documentElement.dataset.paper || 'night', () => 'night');
  const { save: saveCfg, msg, rail } = useLabSave('seal', 'seal-saved');
  const [note, setNote] = useState('');
  const shownMsg = note || msg;
  const save = useCallback(() => { setNote(''); return saveCfg(clampCfg(cfg) as unknown as Record<string, unknown>); }, [cfg, saveCfg]);

  /* replay: the pen draws every stroke again (not under reduced motion: the seal is simply there) */
  const replay = useCallback(() => {
    const svg = big.current?.querySelector('svg'); if (!svg) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { svg.classList.remove('is-drawing'); return; }
    svg.classList.remove('is-drawing'); svg.classList.toggle('one', !!cfg.continuous); void svg.getBoundingClientRect(); svg.classList.add('is-drawing');
    let t = 0; (svg as SVGSVGElement).onanimationend = () => { clearTimeout(t); t = window.setTimeout(() => svg.classList.remove('is-drawing'), 60); };   /* drop the dash once the pen is done */
  }, [cfg.continuous]);
  const shuffle = useCallback(() => setCfg((c) => ({ ...c, seed: 1 + Math.floor(Math.random() * 99999) })), [setCfg]);
  const replayNext = useRef(false);
  useEffect(() => { if (replayNext.current) { replayNext.current = false; requestAnimationFrame(() => requestAnimationFrame(replay)); } });
  const exportSvg = () => {
    const s = '<?xml version="1.0" encoding="UTF-8"?>\n' + toSvgString(render(cfg, { size: 600, plot: true })) + '\n';
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml' })); a.download = 'seal-' + cfg.mode + '-' + cfg.seed + '.svg';
    document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setNote('Exported ' + a.download + ', paths only.');
  };
  const copy = () => { try { navigator.clipboard.writeText(JSON.stringify(clampCfg(cfg), null, 2) + '\n'); setNote('Copied.'); } catch { setNote('No clipboard here.'); } };
  const togglePaper = () => { const n = paper === 'night' ? 'graphite' : 'night'; setPaper(n); try { localStorage.setItem('seal-paper', n); } catch { /* storage blocked */ } };

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => { keyRef.current = (e) => { if ((e.target as HTMLElement).closest('input, select, textarea') || e.metaKey || e.ctrlKey) return; if (e.key === 'r') shuffle(); if (e.key === 's') save(); if (e.key === 'p') replay(); }; });
  useEffect(() => { const on = (e: KeyboardEvent) => keyRef.current(e); document.addEventListener('keydown', on); return () => document.removeEventListener('keydown', on); }, []);

  const m = cfg[cfg.mode];
  const bigSvg = size.big ? render(cfg, { size: size.big, draw: true }) : null;
  const slider = (k: Knob | 'weight', top: boolean) => {
    const b = BOUNDS[k], v = top ? cfg.weight : m[k as Knob];
    return (
      <label key={k}><span>{LABELS[k]}</span>
        <input type="range" min={b[0]} max={b[1]} step={b[2]} aria-label={LABELS[k]} value={v}
          onChange={(e) => { const n = +e.target.value; setCfg((c) => (top ? { ...c, weight: n } : { ...c, [c.mode]: { ...c[c.mode], [k]: n } })); }} />
        <output>{k === 'weight' ? v + 'px' : v}</output></label>
    );
  };
  return (
    <>
      <main>
        <header className="top"><h1>Seal lab</h1><p>Click the seal for a new one. Knobs to tweak, Save to keep.</p></header>
        <section className="stage">
          <button ref={big} type="button" className="big" id="big" aria-label="Draw a new seal" onClick={() => { replayNext.current = true; shuffle(); }}>{bigSvg ? <SealSvgView seal={bigSvg} /> : null}</button>
          <p className="meta" id="meta">Seed <b>{cfg.seed}</b> · {cfg.mode} · {m.lobes} lobes · {cfg.continuous ? 'one continuous line' : (bigSvg ? bigSvg.paths.length : 0) + ' closed curves'}</p>
        </section>
        <section className="row"><h2 className="lbl">Every city at 120px</h2>
          <ul className="cities" id="cities">{SEAL_CITIES.map((id) => <li key={id}><SealSvgView seal={forCity(cfg, id, { size: 120 })} /><span>{NAMES[id]}</span></li>)}</ul></section>
        <section className="row"><h2 className="lbl">At 24px, as a row marker</h2>
          <ul className="marks" id="marks">{SEAL_CITIES.map((id) => <li key={id}><SealSvgView seal={forCity(cfg, id, { size: 24 })} /><span>{NAMES[id]}</span></li>)}</ul></section>
        <section className="row"><h2 className="lbl">The winner: the ten interlaced</h2>
          <div ref={win} className="win" id="win">
            {([[size.win, 'w-big', 'At ' + size.win + 'px'], [120, '', 'At 120px'], [24, '', 'At 24px']] as [number, string, string][]).map((s) => (
              <figure key={s[2]}><div className={s[1] || undefined}><SealSvgView seal={merged(cfg, SEAL_CITIES, { size: s[0] })} /></div><figcaption>{s[2]}</figcaption></figure>
            ))}
          </div></section>
      </main>
      <aside className="lab" id="lab" aria-label="Seal controls">
        <h2 className="lbl">Seal</h2>
        <div className="tabs" role="tablist" aria-label="Mode">{MODES.map((n) => <button key={n} type="button" role="tab" aria-selected={n === cfg.mode} onClick={() => setCfg((c) => ({ ...c, mode: n }))}>{MODE_NAME[n]}</button>)}</div>
        <label style={{ gridTemplateColumns: '84px 1fr' }}><span>Seed</span><input type="number" min={BOUNDS.seed[0]} max={BOUNDS.seed[1]} aria-label="Seed" defaultValue={cfg.seed} key={cfg.seed} onChange={(e) => { const n = +e.target.value; if (n) setCfg((c) => ({ ...c, seed: n })); }} /></label>
        {KNOBS.map((k) => slider(k, false))}
        <div className="sep" />
        {slider('weight', true)}
        <label className="chk"><span>Start mark</span><input type="checkbox" aria-label="Start mark" checked={!!cfg.startMark} onChange={(e) => setCfg((c) => ({ ...c, startMark: e.target.checked }))} /></label>
        <label className="chk"><span>One line</span><input type="checkbox" aria-label="One line" checked={!!cfg.continuous} onChange={(e) => setCfg((c) => ({ ...c, continuous: e.target.checked }))} /></label>
        <div className="btns">
          <button type="button" onClick={shuffle}>New seed</button>
          <button type="button" className="pri" onClick={save}>Save</button>
          <button type="button" onClick={replay}>Replay</button>
          <button type="button" onClick={exportSvg}>Export SVG</button>
          <button type="button" onClick={togglePaper}>{paper === 'night' ? 'Paper' : 'Night'}</button>
          <button type="button" onClick={copy}>Copy JSON</button>
        </div>
        <div className="msg">{shownMsg}</div>
        <div className="rail">{rail.map((c, i) => <button key={i} type="button" title={'Apply ' + c.mode + ' seed ' + c.seed} onClick={() => setCfgRaw(clampCfg(c as SealCfgInput))}>{'#' + c.seed + ' ' + String(c.mode).slice(0, 3)}</button>)}</div>
      </aside>
    </>
  );
}
