'use client';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { MONO, type WheelCfg } from '@/components/wheel/config';
import { globeLook } from '@/components/wheel/globe-look';
import { STUDY, drawTextGlobe, loadFrames, loadLand, subsolar, type Frames, type LandMap } from '@/components/wheel/text-globe';
import { BuilderLogo } from '@/components/wheel/builder-logo';
import { HackMark } from '@/components/wheel/mark';
import { Switches } from '@/components/board/prefs';
import { EVENT } from '@/lib/day-data';
import { ZONE } from '@/lib/places';
import { clampEnd, type EndCfg } from './ending-config';
import { cellSize, drawMap, mapLines, nightLines, placeMarks, printedAt, type MapGrid } from './flat-map';
import { atZone, yourTime } from './ending-time';
import './ending.css';
import { at, away, newTab } from '@/lib/routes';

/* How the preview page ends: the world opened flat. One map across the full width in the
   text globe's characters and hatch, every city a + with its code; each mark is the link to register there, and
   pointing at one moves the green brackets to it and the Register cell under the map with it. Then one row of cells
   (Register, largest; the date; the start there and in the visitor's time; the host), one row of links and the two
   switches, the last line and an imprint line. Nothing after it.
   - The map is drawn on a canvas; the codes are text over it, inside the links, so they are read and focused like any
     link. On a phone the map is dots and the cities are a row of keys under it.
   - It prints once, the first time it is in view: row by row behind a block cursor, in `rate` ms (or the globe opens
     into it, with `open: unroll`). Under reduced motion, and without script, it is simply there.
   - The other endings of the lab: `ident` (the text globe in a test card's circle, the cells round it), `cities` (the
     names at display size, each a register link) and `board` (today's, passed in by the caller). */

export type EndCity = { id: string; name: string; code: string; lat: number; lon: number; opens: number; href: string; action: string; press?: () => void;
  /* the city's time zone, when it is not one of the event's (the lab's test cities) */
  zone?: string };
export type EndLinks = { how: string; prizes: string; questions?: string };

const PHONE = '(max-width: 640px)';
const phoneSub = (f: () => void) => { const m = window.matchMedia(PHONE); m.addEventListener('change', f); return () => m.removeEventListener('change', f); };
const usePhone = () => useSyncExternalStore(phoneSub, () => window.matchMedia(PHONE).matches, () => false);
const RM = '(prefers-reduced-motion: reduce)';
const rmSub = (f: () => void) => { const m = window.matchMedia(RM); m.addEventListener('change', f); return () => m.removeEventListener('change', f); };
const useReduced = () => useSyncExternalStore(rmSub, () => window.matchMedia(RM).matches, () => false);
const never = () => () => {};
const useLoaded = () => useSyncExternalStore(never, () => true, () => false);
const cssVar = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const monoFont = () => MONO.geist.replace(/var\((--[\w-]+)\)/g, (_m, v: string) => cssVar(v) || 'monospace');

/* the grid the map is drawn on: the saved rows on a wide screen; on a phone a square grid of dots about 4.5 px apart */
function gridFor(cfg: EndCfg, phone: boolean, width: number): MapGrid {
  if (!phone) return { rows: cfg.rows, cols: STUDY.cols, north: cfg.north, south: cfg.south };
  const cols = Math.max(40, Math.floor(width / 4.5));
  return { rows: Math.max(8, Math.round((cols * (cfg.north - cfg.south)) / 360)), cols, north: cfg.north, south: cfg.south };
}

export function Ending({ cfg: given, wheel, cities, start, last, date, sound, links, style, face, board, markMode, play = 0, onMapPress, onPick, map = true, states, label = 'Register for a city' }: {
  cfg: EndCfg; wheel: WheelCfg; cities: EndCity[];
  /* the page's city (the nearest, or the one chosen on the page): the green mark until the visitor points at another */
  start: number;
  /* the last line (a sentence true now) and the date as the page writes it */
  last: string; date: string; sound: boolean; links: EndLinks; style?: CSSProperties; face?: string;
  /* today's ending, shown with `end: board` */
  board?: ReactNode;
  /* the saved mark (the wheel's `mark`) for `mark: small` */
  markMode: string;
  /* the lab: a new number plays the opening again; a press on the map away from a city */
  play?: number; onMapPress?: () => void;
  /* a press on a city key also makes it the page's city, so every Register on the page agrees */
  onPick?: (i: number) => void;
  /* the day pages: map={false} leaves the map out (the home already opens on it); states draws each city's mark as its
     state; label names the list of marks (on the day they open the city pages, not Register) */
  map?: boolean; states?: { mark: string; ink: number }[]; label?: string;
}) {
  const cfg = clampEnd(given), phone = usePhone(), reduced = useReduced(), loaded = useLoaded();
  /* the city pointed at, while the page's city is the one it was pointed from (a new page city starts again from it) */
  const [pointed, setPointed] = useState<{ i: number; from: number; held: boolean } | null>(null);
  const aim = pointed && pointed.from === start && pointed.i < cities.length ? pointed.i : Math.min(start, cities.length - 1);
  /* a pointer or focus moves it for as long as it stays in the ending; a press on a city key holds it */
  const point = (i: number) => setPointed((p) => (p?.held && p.i === i ? p : { i, from: start, held: false }));
  const hold = (i: number) => { if (onPick) { setPointed(null); onPick(i); } else setPointed({ i, from: start, held: true }); };
  const letGo = () => setPointed((p) => (p && !p.held ? null : p));
  const c = cities[aim];

  if (cfg.end === 'board') return <>{board}</>;

  const telex = cfg.signoff === 'telex';
  const reg = c.press
    ? <button type="button" className="en-reg" data-sk-skip="" aria-haspopup="dialog" onClick={c.press}><span className="en-lens" data-dot="" data-lat={c.lat} data-lon={c.lon} aria-hidden="true" /><span className="en-reg-t">{c.action}</span></button>
    : <a className="en-reg" data-sk-skip="" href={at(c.href)} {...away(c.href)}><span className="en-lens" data-dot="" data-lat={c.lat} data-lon={c.lon} aria-hidden="true" /><span className="en-reg-t">{c.action}</span>{newTab(c.href) ? <span className="sr-only">{newTab(c.href)}</span> : null}</a>;
  const cells = (
    <div className="en-cells">
      {reg}
      <div className="en-cell"><span className="bd-k">Date</span><span>{date}</span></div>
      <div className="en-cell"><span className="bd-k">Starts</span><span>{loaded ? atZone(c.opens, c.zone ?? ZONE[c.id]) : ' '} in {c.name}</span><span className="en-sub">{loaded ? yourTime(c.opens, c.zone ?? ZONE[c.id]) : ' '}</span></div>
      <div className="en-cell"><span className="bd-k">Hosted by</span><span>Supabase</span></div>
    </div>
  );
  const keys = (
    <div className="en-keys" role="group" aria-label="Choose a city">
      {cities.map((x, i) => <button key={x.id} type="button" aria-pressed={i === aim} onClick={() => hold(i)}>{x.code}<span className="sr-only"> {x.name}</span></button>)}
    </div>
  );

  return (
    <footer className="bd en" data-end={cfg.end} data-face={face} onPointerLeave={(e) => { if (e.pointerType === 'mouse' && !e.currentTarget.contains(document.activeElement)) letGo(); }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) letGo(); }} style={{ ...style, '--en-cell': cfg.cell + 'px', '--en-tpl': `minmax(0, ${cfg.reg}fr) repeat(3, minmax(0, 1fr))`, '--en-tag': cfg.tag } as CSSProperties}>
      {telex ? <p className="en-tx" aria-hidden="true">ZCZC</p> : null}
      {cfg.mark === 'big' ? <div className="en-big" aria-hidden="true"><BuilderLogo /></div> : null}
      {cfg.end === 'flat' && map ? <FlatMap cfg={cfg} wheel={wheel} cities={cities} aim={aim} pick={hold} phone={phone} reduced={reduced} play={play} onPress={onMapPress} states={states} label={label} /> : null}
      {cfg.end === 'ident' ? <Ident cfg={cfg} wheel={wheel} cities={cities} aim={aim} cells={cells} /> : null}
      {cfg.end === 'cities' ? (
        <nav className="en-names" aria-label="Register for a city">
          <ul>{cities.map((x, i) => (
            <li key={x.id}>{x.press
              ? <button type="button" aria-haspopup="dialog" data-on={i === aim ? '' : undefined} onClick={x.press} onPointerEnter={(e) => { if (e.pointerType === 'mouse') point(i); }} onFocus={() => point(i)}>{x.name}<span className="sr-only">: {x.action}</span></button>
              : <a href={at(x.href)} {...away(x.href)} data-on={i === aim ? '' : undefined} onPointerEnter={(e) => { if (e.pointerType === 'mouse') point(i); }} onFocus={() => point(i)}>{x.name}<span className="sr-only">: {x.action}</span></a>}</li>
          ))}</ul>
        </nav>
      ) : null}
      {/* on a phone the city keys come before the Register cell they change */}
      {cfg.end === 'flat' && map ? keys : null}
      {cfg.end === 'ident' ? keys : cells}
      <div className="en-links">
        <nav aria-label="On this page and Supabase">
          <a href={links.prizes}>Prizes</a>
          <a href={links.how}>How it works</a>
          {links.questions ? <a href={links.questions}>Questions</a> : null}
          <a href="https://supabase.com">supabase.com</a>
          <a href="https://supabase.com/docs">Docs</a>
          <a href="https://supabase.com/privacy">Privacy</a>
          <a href="https://supabase.com/terms">Terms</a>
        </nav>
        <Switches sound={sound} />
      </div>
      <div className="en-end">
        {last ? <p className="en-last">{last}</p> : null}
        {cfg.imprint ? (
          <p className="en-imp bd-k">
            {cfg.mark === 'small' ? <span className="en-mark" aria-hidden="true">{markMode === 'builder' ? <BuilderLogo /> : <HackMark id="en-mark" label="" />}</span> : null}
            {EVENT.name} · {date}.
          </p>
        ) : null}
      </div>
      {telex ? <p className="en-tx" aria-hidden="true">NNNN</p> : null}
    </footer>
  );
}

/* ---------- the world opened flat ---------- */
function FlatMap({ cfg, wheel, cities, aim, pick, phone, reduced, play, onPress, states, label = 'Choose your city' }: {
  cfg: EndCfg; wheel: WheelCfg; cities: EndCity[]; aim: number; pick: (i: number) => void; phone: boolean; reduced: boolean; play: number; onPress?: () => void;
  states?: { mark: string; ink: number }[]; label?: string;
}) {
  const host = useRef<HTMLDivElement>(null), cv = useRef<HTMLCanvasElement>(null);
  const [land, setLand] = useState<LandMap | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => { let live = true; loadLand().then((m) => { if (live) setLand(m); }); return () => { live = false; }; }, []);
  useEffect(() => {
    const el = host.current; if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth)); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const g = useMemo(() => gridFor(cfg, phone, width), [cfg, phone, width]);
  const marks = useMemo(() => placeMarks(g, cities, Math.ceil(3 * cfg.tag) + 2), [g, cities, cfg.tag]);
  /* the sun for now, moved on once a minute */
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60000));
  useEffect(() => { if (cfg.light !== 'morning') return; const t = window.setInterval(() => setMinute(Math.floor(Date.now() / 60000)), 60000); return () => window.clearInterval(t); }, [cfg.light]);
  const lines = useMemo(() => {
    if (!land) return null;
    const l = mapLines(land, g);
    return cfg.light === 'morning' ? nightLines(l, g, subsolar(minute * 60000), wheel.globeNight) : l;
  }, [land, g, cfg.light, minute, wheel.globeNight]);

  /* the opening: once, when the map is first well in view; the progress lives outside React (a frame never renders) */
  const prog = useRef(-1), drawRef = useRef<() => void>(() => {});
  const opens = cfg.open !== 'none' && !reduced;
  useEffect(() => {
    const el = host.current; if (!el) return;
    if (!opens) { prog.current = 1; el.removeAttribute('data-wait'); drawRef.current(); return; }
    prog.current = 0; el.setAttribute('data-wait', ''); drawRef.current();
    let raf = 0, t0 = 0;
    const len = cfg.open === 'unroll' ? Math.max(cfg.rate, 600) : cfg.rate;
    const tick = (now: number) => {
      t0 ||= now;
      prog.current = Math.min(1, (now - t0) / len); drawRef.current();
      if (prog.current < 1) raf = requestAnimationFrame(tick); else el.removeAttribute('data-wait');
    };
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); raf = requestAnimationFrame(tick); } }, { threshold: 0.35 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); prog.current = 1; el.removeAttribute('data-wait'); };
  }, [opens, cfg.open, cfg.rate, play]);

  /* the drawing: on any change, on resize, and on each frame of the opening */
  useEffect(() => {
    const el = host.current, c = cv.current; if (!el || !c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const look = globeLook(wheel, monoFont(), cssVar('--green') || '#3ecf8e');
    const labels = Array.from(el.querySelectorAll<HTMLElement>('.en-mk'));
    drawRef.current = () => {
      if (!lines) return;
      const ratio = Math.min(devicePixelRatio || 1, 2), w = Math.round(el.clientWidth * ratio), h = Math.round(el.clientHeight * ratio);
      if (!w || !h) return;
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      const p = prog.current < 0 ? 0 : prog.current;
      const unroll = cfg.open === 'unroll' && opens && p < 1 ? { t: p, facing: cities[aim]?.lon ?? 0, r: h * 0.46 } : null;
      const printed = cfg.open === 'print' && opens ? printedAt(g, p, cfg.seed) : Infinity;
      drawMap(ctx, { w, h, g, lines, marks, active: aim, look: { ink: look.ink, grid: look.grid, markInk: look.markInk, green: look.green, font: look.font }, printed, unroll, dots: phone, ratio, states });
      /* a code shows once the print has passed its cell */
      if (printed !== Infinity || unroll) labels.forEach((lb, k) => { const m = marks[k]; lb.toggleAttribute('data-wait', !!unroll || !m || m.code.r * g.cols + m.code.c >= printed); });
      else labels.forEach((lb) => lb.removeAttribute('data-wait'));
    };
    drawRef.current();
    const ro = new ResizeObserver(() => drawRef.current()); ro.observe(el);
    return () => ro.disconnect();
  }, [lines, g, marks, aim, wheel, phone, cfg.open, cfg.seed, opens, cities, states]);

  const { colW, lineH } = cellSize({ w: 100, h: 100, g });
  return (
    <div className="en-map" style={{ '--en-cols': g.cols, '--en-ar': phone ? g.cols / g.rows : g.cols / (g.rows * (STUDY.rx / STUDY.ry)) } as CSSProperties}>
      <div ref={host} className="en-map-in" onClick={(e) => { if (onPress && !(e.target as HTMLElement).closest('a, button')) onPress(); }}>
        <canvas ref={cv} role="img" aria-label={`A map of the world drawn in characters, with the ${cities.length} cities marked`} />
        {/* the cities: each mark and its code is the link to register there */}
        <ul className="en-mks" aria-label={label}>
          {marks.map((m) => {
            const x = cities[m.i];
            /* the target: the mark with its brackets and the code */
            const lo = Math.min(m.c - 1, m.code.c), hi = Math.max(m.c + 1, m.code.c + m.code.n - 1);
            const top = Math.min(m.r, m.code.r), bottom = Math.max(m.r, m.code.r) + 1;
            const box = { left: lo * colW + '%', width: (hi - lo + 1) * colW + '%', top: top * lineH + '%', height: (bottom - top) * lineH + '%' } as CSSProperties;
            const code = { left: ((m.code.c - lo) / (hi - lo + 1)) * 100 + '%', top: ((m.code.r - top + 0.5) / (bottom - top)) * 100 + '%' } as CSSProperties;
            /* a press picks the city (the cells under the map follow it, and so does every Register on the page); a
               pointer passing over only lights the code, so the cells never change under someone who is just reading */
            return (
              <li key={x.id}>
                <button type="button" className="en-mk" style={box} data-on={m.i === aim ? '' : undefined} data-side={m.label.side} aria-pressed={m.i === aim} onClick={() => pick(m.i)}>
                  <span className="en-code" style={code}>{x.code}</span><span className="sr-only">{x.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/* ---------- the test card: the text globe in a circle, the cells round it ---------- */
function Ident({ cfg, wheel, cities, aim, cells }: { cfg: EndCfg; wheel: WheelCfg; cities: EndCity[]; aim: number; cells: ReactNode }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [art, setArt] = useState<{ frames: Frames | null; land: LandMap | null } | null>(null);
  useEffect(() => { let live = true; Promise.all([loadFrames(), loadLand()]).then(([frames, land]) => { if (live) setArt({ frames, land }); }); return () => { live = false; }; }, []);
  useEffect(() => {
    const c = cv.current; if (!c || !art) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const draw = () => {
      const ratio = Math.min(devicePixelRatio || 1, 2), w = Math.round(c.clientWidth * ratio), h = Math.round(c.clientHeight * ratio);
      if (!w || !h) return;
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      ctx.clearRect(0, 0, w, h);
      const look = globeLook(wheel, monoFont(), cssVar('--green') || '#3ecf8e'), R = Math.min(w, h) * 0.4, x = w / 2, y = h / 2;
      drawTextGlobe(ctx, { x, y, r: R, ratio, facing: cities[aim]?.lon ?? STUDY.first, cities, active: aim, bracket: true, frames: art.frames, land: art.land, look: { ...look, marks: 'all' } });
      /* the test card's circle and its four ticks, in the grid's ink */
      ctx.strokeStyle = `rgba(${look.ink}, ${look.ink}, ${look.ink}, ${look.grid})`; ctx.lineWidth = ratio; ctx.setLineDash([ratio, 5 * ratio]);
      ctx.beginPath(); ctx.arc(x, y, R * 1.18, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * R * 1.12, y + Math.sin(a) * R * 1.12); ctx.lineTo(x + Math.cos(a) * R * 1.26, y + Math.sin(a) * R * 1.26); ctx.stroke(); }
    };
    draw();
    const ro = new ResizeObserver(draw); ro.observe(c);
    return () => ro.disconnect();
  }, [art, wheel, cities, aim, cfg.cell]);
  return (
    <div className="en-ident">
      <canvas ref={cv} role="img" aria-label={`The world drawn in characters, turned to ${cities[aim]?.name ?? ''}`} />
      {cells}
    </div>
  );
}
