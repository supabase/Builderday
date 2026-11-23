'use client';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent } from 'react';
import { MONO, type WheelCfg } from '@/components/wheel/config';
import { globeLook } from '@/components/wheel/globe-look';
import { STUDY, loadLand, subsolar, type LandMap } from '@/components/wheel/text-globe';
import { cellSize, drawMap, mapLines, nightLines, placeMarks, printedAt, type MapGrid } from '@/components/day/flat-map';
import { EPOCH } from '@/lib/day-data';
import { lineCol, lineLon } from './devices';

/* The home's first screen on the day: the world opened flat (the preview's ending), live.
   - Every city is a mark with its code; the mark is its state (devices.ts), the active city the green brackets.
   - Night is the thinner hatch, stepped once a minute with the day's clock.
   - The start line: a column of `|` at the longitude where it is `hour`:00 now, travelling west a column at a time.
   - Pointing at a mark moves the brackets (and the Now cell under the map); a press opens that city's page.
   - It prints once per visit (the preview's print), never again; under reduced motion it is simply there.
   - On a phone the map is dots and the cities are a row of keys under it. */

export type LiveCity = { id: string; name: string; code: string; lat: number; lon: number; href: string; mark: string; ink: number; said: string };
const PHONE = '(max-width: 640px)';
const sub = (q: string) => (f: () => void) => { const m = window.matchMedia(q); m.addEventListener('change', f); return () => m.removeEventListener('change', f); };
const usePhone = () => useSyncExternalStore(sub(PHONE), () => window.matchMedia(PHONE).matches, () => false);
const RM = '(prefers-reduced-motion: reduce)';
const useReduced = () => useSyncExternalStore(sub(RM), () => window.matchMedia(RM).matches, () => false);
const cssVar = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const monoFont = () => MONO.geist.replace(/var\((--[\w-]+)\)/g, (_m, v: string) => cssVar(v) || 'monospace');
const PRINTED_KEY = 'hackday-air-map-printed';

export type MapLook = { rows: number; north: number; south: number; tag: number; rate: number; seed: number; night: boolean; line: { on: boolean; hour: number; char: string; ink: number } };

function gridFor(m: MapLook, phone: boolean, width: number): MapGrid {
  if (!phone) return { rows: m.rows, cols: STUDY.cols, north: m.north, south: m.south };
  const cols = Math.max(40, Math.floor(width / 4.5));
  return { rows: Math.max(8, Math.round((cols * (m.north - m.south)) / 360)), cols, north: m.north, south: m.south };
}

export function LiveMap({ cities, aim, point, look: M, wheel, minute, label }: {
  cities: LiveCity[]; aim: number; point: (i: number | null) => void; look: MapLook; wheel: WheelCfg;
  /* the day's minute (from EPOCH): the sun and the start line follow it, a step a minute */
  minute: number; label: string;
}) {
  const phone = usePhone(), reduced = useReduced();
  const host = useRef<HTMLDivElement>(null), cv = useRef<HTMLCanvasElement>(null);
  const [land, setLand] = useState<LandMap | null>(null), [width, setWidth] = useState(0);
  useEffect(() => { let live = true; loadLand().then((m) => { if (live) setLand(m); }); return () => { live = false; }; }, []);
  useEffect(() => { const el = host.current; if (!el) return; const ro = new ResizeObserver(() => setWidth(el.clientWidth)); ro.observe(el); return () => ro.disconnect(); }, []);
  const g = useMemo(() => gridFor(M, phone, width), [M, phone, width]);
  const marks = useMemo(() => placeMarks(g, cities, Math.ceil(3 * M.tag) + 2), [g, cities, M.tag]);
  const min = Math.floor(minute);
  const lines = useMemo(() => {
    if (!land) return null;
    const l = mapLines(land, g);
    return M.night ? nightLines(l, g, subsolar(EPOCH + min * 60000), wheel.globeNight) : l;
  }, [land, g, M.night, min, wheel.globeNight]);
  const lineAt = M.line.on ? lineCol(lineLon(min, M.line.hour), g.cols) : -1;
  const states = useMemo(() => cities.map((c) => ({ mark: c.mark, ink: c.ink })), [cities]);

  /* the print, once per visit; then never again (a return, a tick, a resize all draw it finished) */
  const prog = useRef(-1), drawRef = useRef<() => void>(() => {});
  useEffect(() => {
    const el = host.current; if (!el) return;
    let seen = false; try { seen = sessionStorage.getItem(PRINTED_KEY) === '1'; } catch { /* no storage: print */ }
    if (reduced || seen || M.rate <= 0) { prog.current = 1; drawRef.current(); return; }
    try { sessionStorage.setItem(PRINTED_KEY, '1'); } catch { /* fine */ }
    prog.current = 0; el.setAttribute('data-wait', ''); drawRef.current();
    let raf = 0, t0 = 0;
    const tick = (now: number) => { t0 ||= now; prog.current = Math.min(1, (now - t0) / M.rate); drawRef.current(); if (prog.current < 1) raf = requestAnimationFrame(tick); else el.removeAttribute('data-wait'); };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); prog.current = 1; el.removeAttribute('data-wait'); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  /* the drawing: when a cell changes (the minute, the aim, a state), on resize, and on each frame of the print */
  useEffect(() => {
    const el = host.current, c = cv.current; if (!el || !c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const lk = globeLook(wheel, monoFont(), cssVar('--green') || '#3ecf8e');
    const labels = Array.from(el.querySelectorAll<HTMLElement>('.en-mk'));
    drawRef.current = () => {
      if (!lines) return;
      const ratio = Math.min(devicePixelRatio || 1, 2), w = Math.round(el.clientWidth * ratio), h = Math.round(el.clientHeight * ratio);
      if (!w || !h) return;
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      const p = prog.current < 0 ? 0 : prog.current, printed = p < 1 ? printedAt(g, p, M.seed) : Infinity;
      drawMap(ctx, { w, h, g, lines, marks, active: aim, look: { ink: lk.ink, grid: lk.grid, markInk: lk.markInk, green: lk.green, font: lk.font }, printed, dots: phone, ratio, states,
        line: lineAt >= 0 ? { col: lineAt, char: M.line.char, ink: M.line.ink } : null });
      labels.forEach((lb, k) => { const m = marks[k]; lb.toggleAttribute('data-wait', printed !== Infinity && (!m || m.code.r * g.cols + m.code.c >= printed)); });
    };
    drawRef.current();
    const ro = new ResizeObserver(() => drawRef.current()); ro.observe(el);
    return () => ro.disconnect();
  }, [lines, g, marks, aim, wheel, phone, states, lineAt, M.line.char, M.line.ink, M.seed]);

  const { colW, lineH } = cellSize({ w: 100, h: 100, g });
  const lineLeft = lineAt >= 0 ? ((lineAt + 0.5) / g.cols) * 100 : -1;
  return (
    <div className="oa-map" onPointerLeave={(e) => { if (e.pointerType === 'mouse') point(null); }}>
      <div className="en-map" style={{ '--en-cols': g.cols, '--en-ar': phone ? g.cols / g.rows : g.cols / (g.rows * (STUDY.rx / STUDY.ry)), '--en-tag': M.tag } as CSSProperties}>
        <div ref={host} className="en-map-in">
          <canvas ref={cv} role="img" aria-label={label} />
          {lineLeft >= 0 && !phone ? <span className="oa-line-tag" style={{ left: lineLeft + '%' }} aria-hidden="true">{String(M.line.hour).padStart(2, '0')}:00</span> : null}
          <ul className="en-mks" aria-label="Open a city">
            {marks.map((m) => {
              const x = cities[m.i];
              const lo = Math.min(m.c - 1, m.code.c), hi = Math.max(m.c + 1, m.code.c + m.code.n - 1);
              const top = Math.min(m.r, m.code.r), bottom = Math.max(m.r, m.code.r) + 1;
              const box = { left: lo * colW + '%', width: (hi - lo + 1) * colW + '%', top: top * lineH + '%', height: (bottom - top) * lineH + '%' } as CSSProperties;
              const code = { left: ((m.code.c - lo) / (hi - lo + 1)) * 100 + '%', top: ((m.code.r - top + 0.5) / (bottom - top)) * 100 + '%' } as CSSProperties;
              return (
                <li key={x.id}>
                  <a className="en-mk" style={box} href={x.href} data-on={m.i === aim ? '' : undefined} data-side={m.label.side}
                    onPointerEnter={(e: PointerEvent) => { if (e.pointerType === 'mouse') point(m.i); }} onFocus={() => point(m.i)}>
                    <span className="en-code" style={code}>{x.code}</span><span className="sr-only">{x.name}: {x.said}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <div className="oa-keys" role="group" aria-label="Choose a city">
        {cities.map((x, i) => <a key={x.id} href={x.href} aria-current={i === aim ? 'true' : undefined} onFocus={() => point(i)}><span aria-hidden="true">{x.mark.length === 3 ? x.mark : ' ' + x.mark + ' '}</span>{x.code}<span className="sr-only"> {x.name}: {x.said}</span></a>)}
      </div>
    </div>
  );
}
