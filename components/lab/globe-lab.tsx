'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GLOBE_MODES, GLOBE_PLAIN, WHEEL_BOUNDS, WHEEL_CHOICES, WHEEL_DEF, MONO, clampWheel, type WheelCfg } from '@/components/wheel/config';
import { GLOBE_KNOBS, PRIZE_KNOBS, WHEEL_INT, wheelLabel } from '@/components/wheel/knobs';
import { PrizeText } from '@/components/day/prize-text';
import { PRIZES } from '@/lib/prizes';
import { GlobeClock } from '@/components/wheel/globe-clock';
import { facingFor, globeClockCfg, globeLook, handoverCut, handoverDrop } from '@/components/wheel/globe-look';
import { drawTextGlobe, loadFrames, loadLand, markAt, subsolar, type Frames, type GlobeCity, type LandMap, type TextGlobeDraw } from '@/components/wheel/text-globe';
import { CODE } from '@/lib/places';
import { EPOCH } from '@/lib/day-data';
import type { OurWheel } from '@/components/preview/facts';
import { LabPanel, togglePanel, useLabSave, type Group } from './lab-kit';
import './globe-lab.css';

/* The globe lab: a generator for the text globe. The picture is a function of the wheel's saved config (every mode,
   every knob and the seed), the city and the city list; a press on the globe away from a city picks a new seed, a press
   on a city's mark turns to it (with "Press a city" on). Save writes saved/wheel.config.json, the file the preview page
   reads. Under the large globe: the three sizes at 1x and 2x, and the header's cell for the hand-over. */

type LabCity = GlobeCity & { id: string; name: string; opens: number };
const LISTS: [string, string][] = [['6', 'Six cities'], ['10', 'Ten cities'], ['all', 'The event’s cities'], ['16', 'Sixteen cities']];
const MODE_GROUP: Group = { name: 'Modes', knobs: GLOBE_MODES.filter((k) => k !== 'prize').map((k) => ({ k, kind: 'select' as const, label: ({ globeArrive: 'Arrives', globeTurn: 'Turns', globeLand: 'Comes to rest', globeLight: 'Light', globeMarks: 'Cities', globePick: 'Press a city', globeRim: 'Rim', globeBlink: 'Blink', globeHandover: 'To the header' } as Record<string, string>)[k] })) };
const GROUPS: Group[] = [MODE_GROUP, { name: 'Knobs', knobs: GLOBE_KNOBS }, { name: 'The prize', knobs: PRIZE_KNOBS }, { name: 'Ink and turn', knobs: [{ k: 'ink', kind: 'range', label: 'Ink' }, { k: 'dim', kind: 'range', label: 'Second ink' }, { k: 'yawEase', kind: 'range', label: 'Turn ease' }, { k: 'face', kind: 'range', label: 'City faces' }] }];

function cityLists(ours: OurWheel): Record<string, LabCity[]> {
  const opensAt = (offset: number) => EPOCH + (ours.startHour * 60 - offset) * 60000;
  const all: LabCity[] = ours.cities.map((c) => ({ id: c.id, name: c.name, lat: c.lat, lon: c.lon, code: CODE[c.id] ?? c.name.slice(0, 3).toUpperCase(), opens: c.opens }));
  /* two test cities that are not the event's, for the longest list: one east of every city, one in between */
  const sydney: LabCity = { id: 'sydney', name: 'Sydney', lat: -33.87, lon: 151.21, code: 'SYD', opens: opensAt(660) };
  const lagos: LabCity = { id: 'lagos', name: 'Lagos', lat: 6.52, lon: 3.38, code: 'LOS', opens: opensAt(60) };
  /* n of them, spread evenly from the first to the last */
  const some = (n: number) => (all.length <= n ? all : Array.from({ length: n }, (_, i) => all[Math.round((i * (all.length - 1)) / (n - 1))]));
  const at = all.findIndex((c) => c.lon < lagos.lon);
  return { '6': some(6), '10': some(10), all, '16': [sydney, ...all.slice(0, at < 0 ? all.length : at), lagos, ...all.slice(at < 0 ? all.length : at)] };
}

function fontOf() { return MONO.geist.replace(/var\((--[\w-]+)\)/g, (_m, v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || 'monospace'); }
function greenOf() { return getComputedStyle(document.documentElement).getPropertyValue('--green').trim() || '#3ecf8e'; }
const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
const lonText = (v: number) => `${Math.abs(Math.round(wrap(v)))}°${wrap(v) >= 0 ? 'E' : 'W'}`, latText = (v: number) => `${Math.abs(Math.round(v))}°${v >= 0 ? 'N' : 'S'}`;

/* a canvas sized to its box in device pixels */
function fit(cv: HTMLCanvasElement, ratio: number) {
  const r = cv.getBoundingClientRect(), w = Math.round(r.width * ratio), h = Math.round(r.height * ratio);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  return { w, h };
}

export function GlobeLab({ saved, ours, first, bare }: { saved: WheelCfg; ours: OurWheel; first: number; bare: boolean }) {
  const [cfg, setCfg] = useState<WheelCfg>(saved);
  const set = useCallback((k: string, v: unknown) => setCfg((c) => clampWheel({ ...c, [k]: v })), []);
  const { save, msg, rail } = useLabSave('wheel', 'lab-wheel-saved');
  const doSave = useCallback(() => save({ ...cfg }), [cfg, save]);
  const lists = useMemo(() => cityLists(ours), [ours]);
  const [list, setList] = useState('all'), [city, setCity] = useState(first), [scroll, setScroll] = useState(0), [reducedSim, setReducedSim] = useState(false);
  const [prizeCheck, setPrizeCheck] = useState(false), [prizeW, setPrizeW] = useState('full'), [prizePlay, setPrizePlay] = useState(0);
  const cities = lists[list], ci = Math.min(city, cities.length - 1), here = cities[ci];
  const prizeCities = useMemo(() => cities.map((c) => ({ code: c.code ?? '', lat: c.lat, lon: c.lon })), [cities]);
  const [hover, setHover] = useState(-1), [invert, setInvert] = useState(-1);
  const [art, setArt] = useState<{ frames: Frames | null; land: LandMap | null }>({ frames: null, land: null });
  const [meter, setMeter] = useState('');
  const big = useRef<HTMLCanvasElement>(null), head = useRef<HTMLCanvasElement>(null);
  const sizes = useRef<(HTMLCanvasElement | null)[]>([]);
  const clock = useRef<GlobeClock | null>(null), facing = useRef(NaN), dirty = useRef(true), draws = useRef(0);
  const pressT = useRef(0);

  useEffect(() => { if (bare) document.documentElement.classList.add('lab-closed', 'no-lab'); }, [bare]);
  useEffect(() => { let on = true; Promise.all([loadFrames(), loadLand()]).then(([frames, land]) => { if (on) { setArt({ frames, land }); dirty.current = true; } }); return () => { on = false; }; }, []);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null; if (e.metaKey || e.ctrlKey || e.altKey || (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === '\\') togglePanel(); else if (e.key === 's' || e.key === 'S') doSave();
      else if (e.key === 'ArrowRight') setCity((i) => (i + 1) % cities.length); else if (e.key === 'ArrowLeft') setCity((i) => (i - 1 + cities.length) % cities.length);
    };
    document.addEventListener('keydown', on); return () => document.removeEventListener('keydown', on);
  }, [doSave, cities.length]);

  const reduced = () => reducedSim || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* the parts of one drawing that do not change from step to step */
  const base = useCallback((ratio: number): Omit<TextGlobeDraw, 'x' | 'y' | 'r'> => ({
    ratio, facing: facingFor(cfg, here.lon), cities, active: ci, bracket: true, frames: art.frames, land: art.land,
    look: globeLook(cfg, fontOf(), greenOf()), sun: cfg.globeLight === 'morning' ? subsolar(here.opens) : null, seed: cfg.globeSeed, hover, invert,
  }), [cfg, here, cities, ci, art, hover, invert]);
  const baseRef = useRef(base), scrollRef = useRef(scroll);
  useEffect(() => { baseRef.current = base; scrollRef.current = scroll; }, [base, scroll]);

  /* the clock: a new one when a step setting changes; the arrival plays on load and on the key */
  useEffect(() => { clock.current = new GlobeClock(globeClockCfg(cfg, reduced())); clock.current.arrive(); dirty.current = true; // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.globeFps, cfg.globeArrive, cfg.globeSweep, cfg.globeTurn, cfg.globeWake, cfg.globeLand, cfg.globeHold, cfg.globeBlink, cfg.globeBlinks, reducedSim]);
  useEffect(() => { dirty.current = true; }, [base, scroll]);

  /* the large globe: steps on the clock; between steps nothing is drawn */
  useEffect(() => {
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const cv = big.current, k = clock.current; if (!cv || !k) return;
      const ratio = window.devicePixelRatio || 1, b = baseRef.current(ratio), dt = Math.min(0.1, (now - last) / 1000); last = now;
      const target = b.facing;
      if (!isFinite(facing.current) || reduced()) facing.current = target;
      const away = wrap(target - facing.current);
      facing.current += Math.abs(away) < 0.05 ? away : away * (1 - Math.exp(-cfg.yawEase * dt));
      const stepped = k.tick(now, facing.current, Math.abs(away) < 0.5);
      if (!stepped && !dirty.current) return;
      dirty.current = false; draws.current++;
      const { w, h } = fit(cv, ratio), ctx = cv.getContext('2d'); if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      const p = scrollRef.current, cut = handoverCut(cfg, p);
      if (!(cfg.globeHandover === 'thin' && cut)) {
        const o = k.out, y = cfg.globeHandover === 'leave' ? h / 2 - p * h : h / 2;
        drawTextGlobe(ctx, { ...b, x: w / 2, y, r: Math.min(w * 0.42, h * 0.46), facing: o.facing, trail: o.trail, reveal: o.reveal, bracket: o.bracket, drop: handoverDrop(cfg, p) });
      }
      const hc = head.current; if (hc) {
        const f = fit(hc, ratio), x = hc.getContext('2d'); if (x) { x.clearRect(0, 0, f.w, f.h); if (cut) drawTextGlobe(x, { ...b, x: f.w / 2, y: f.h / 2, r: f.h / 2 - ratio, size: 'small', facing: k.out.facing, hover: -1, invert: -1 }); }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.yawEase, cfg.globeHandover, cfg.globeThinSteps, reducedSim]);

  /* the sizes, still, at 1x and 2x */
  useEffect(() => {
    const b = base(1);
    sizes.current.forEach((cv, i) => {
      if (!cv) return; const ratio = i % 2 ? 2 : 1, { w, h } = fit(cv, ratio), x = cv.getContext('2d'); if (!x) return;
      x.clearRect(0, 0, w, h);
      drawTextGlobe(x, { ...b, ratio, x: w / 2, y: h / 2, r: h / 2 - ratio, hover: -1, invert: -1 });
    });
  }, [base]);

  /* how many times the large globe was drawn in the last second: at rest it should be none */
  useEffect(() => { const t = window.setInterval(() => { setMeter(`Large globe drawn ${draws.current} times in the last second.`); draws.current = 0; }, 1000); return () => window.clearInterval(t); }, []);

  /* the pointer: a press on a city's mark turns to it (reverse video after 0.1 s); anywhere else, a new seed */
  const hit = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = e.currentTarget, ratio = window.devicePixelRatio || 1, r = cv.getBoundingClientRect(), w = r.width * ratio, h = r.height * ratio;
    return markAt({ ...base(ratio), facing: clock.current?.out.facing ?? base(ratio).facing, x: w / 2, y: h / 2, r: Math.min(w * 0.42, h * 0.46) }, (e.clientX - r.left) * ratio, (e.clientY - r.top) * ratio, 22 * ratio);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const i = cfg.globePick === 'on' || cfg.globeMarks === 'tags' ? hit(e) : -1;
    setHover(i); e.currentTarget.style.cursor = i >= 0 && cfg.globePick === 'on' ? 'pointer' : 'crosshair';
  };
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const i = cfg.globePick === 'on' ? hit(e) : -1;
    if (i < 0) { set('globeSeed', 1 + Math.floor(Math.random() * 9998)); return; }
    e.currentTarget.setPointerCapture(e.pointerId);
    window.clearTimeout(pressT.current); pressT.current = window.setTimeout(() => setInvert(i), 100);
  };
  const onUp = () => { window.clearTimeout(pressT.current); if (invert >= 0) setCity(invert); setInvert(-1); };

  const out = (k: string) => { const v = cfg[k as keyof WheelCfg]; return typeof v === 'number' ? (WHEEL_INT.has(k) ? String(v) : String(+v.toFixed(3))) : String(v); };
  const sun = subsolar(here.opens), local = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(here.opens);
  const label = (s: Record<string, unknown>) => `${s.globeArrive}, ${s.globeTurn}, ${s.globeLight}, ${s.globeMarks}, seed ${s.globeSeed}`;
  const plain = GLOBE_MODES.every((k) => cfg[k] === GLOBE_PLAIN[k]);

  return (
    <main className="gl-lab">
      <h1 className="gl-title">Globe lab</h1>
      <figure className="gl-stage">
        <canvas ref={big} className="gl-big" role="img" aria-label={`The text globe facing ${here.name}`} onPointerMove={onMove} onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={() => setHover(-1)} />
        <figcaption className="gl-read">
          <span>{here.name} ({here.code}) {latText(here.lat)} {lonText(here.lon)}</span>
          <span>Opens {local} UTC; the sun is overhead at {latText(sun.lat)} {lonText(sun.lon)}</span>
          <span>{plain ? 'Every mode at its plain value' : 'Modes on'}; seed {cfg.globeSeed}</span>
        </figcaption>
      </figure>
      <section className="gl-row" aria-label="The three sizes at 1x and 2x">
        {[['Large', 'gl-s-large'], ['Mid', 'gl-s-mid'], ['Small', 'gl-s-small']].map(([n, cls], j) => (
          <figure key={n} className={'gl-size ' + cls}>
            <div className="gl-pair">
              <canvas ref={(e) => { sizes.current[j * 2] = e; }} className="gl-x1" />
              <canvas ref={(e) => { sizes.current[j * 2 + 1] = e; }} />
            </div>
            <figcaption>{n}: 1x, 2x</figcaption>
          </figure>
        ))}
        <figure className="gl-size gl-head">
          <div className="gl-cell"><canvas ref={head} /><span>Register</span></div>
          <figcaption>The header cell (hand-over at {Math.round(scroll * 100)}%)</figcaption>
        </figure>
      </section>
      <section className="gl-prize" aria-label="The prize" data-w={prizeW}>
        <PrizeText key={prizePlay} amount={PRIZES.global.what ? PRIZES.global.what.charAt(0).toUpperCase() + PRIZES.global.what.slice(1) : 'To be announced'} cities={prizeCities} cfg={cfg} check={prizeCheck} />
        <p className="gl-read"><span>The prize: {wheelLabel('prize', cfg.prize)}{cfg.prize === 'lens' ? ', ' + wheelLabel('prizeOverlap', cfg.prizeOverlap) : ''}</span></p>
      </section>
      <LabPanel title="Globe lab" cfg={{ ...cfg, seed: cfg.globeSeed }} bounds={WHEEL_BOUNDS} choices={WHEEL_CHOICES} groups={GROUPS} set={set} moments={[]} momentIdx={-1}
        out={out} optionLabel={wheelLabel} meter={{ text: meter, bad: false }} msg={msg} rail={rail} railLabel={label} apply={(s) => setCfg(clampWheel(s))}
        buttons={[['Save', doSave, true], ['Play arrival', () => { clock.current?.arrive(); }], ['Play the prize', () => setPrizePlay((n) => n + 1)], ['Plain', () => setCfg((c) => clampWheel({ ...c, ...GLOBE_PLAIN }))], ['Plan’s picks', () => setCfg((c) => clampWheel({ ...c, ...Object.fromEntries(GLOBE_MODES.map((k) => [k, WHEEL_DEF[k]])) }))]]}>
        <fieldset><legend>Look at</legend>
          <label className="sel"><span>Cities</span><select value={list} onChange={(e) => { setList(e.target.value); setCity(0); }}>{LISTS.map(([v, n]) => <option key={v} value={v}>{v === 'all' ? `${n} (${lists.all.length})` : n}</option>)}</select></label>
          <div className="gl-step">
            <button type="button" aria-label="Previous city" onClick={() => setCity((ci - 1 + cities.length) % cities.length)}>‹</button>
            <span>{ci + 1} of {cities.length}: {here.name}</span>
            <button type="button" aria-label="Next city" onClick={() => setCity((ci + 1) % cities.length)}>›</button>
          </div>
          <label className="sel"><span>Turn to</span><select value={ci} onChange={(e) => setCity(+e.target.value)}>{cities.map((c, i) => <option key={c.id} value={i}>{c.name}</option>)}</select></label>
          <label><span>Scroll</span><input type="range" min={0} max={1} step={0.01} value={scroll} onChange={(e) => setScroll(+e.target.value)} /><output>{Math.round(scroll * 100)}%</output></label>
          <label className="sel"><span>Prize width</span><select value={prizeW} onChange={(e) => setPrizeW(e.target.value)}><option value="full">Desktop column</option><option value="phone">Phone (350 px)</option></select></label>
          <label className="tog"><input type="checkbox" checked={prizeCheck} onChange={(e) => setPrizeCheck(e.target.checked)} /><span>Prize: the type over the cells</span></label>
          <label className="tog"><input type="checkbox" checked={reducedSim} onChange={(e) => setReducedSim(e.target.checked)} /><span>Reduced motion</span></label>
        </fieldset>
      </LabPanel>
    </main>
  );
}
