'use client';
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { StatusIcon, STATUS_LABEL } from '@/components/wheel/wheel';
import { CODE } from '@/lib/places';
import { CITY_WORD } from '@/lib/day-data';
import type { OurFact } from '../facts';
import { flapInto, flapOpts, reducedMotion } from './flap';
import familySaved from '@/saved/family.config.json';
import { clampFamily, showPeople } from '@/lib/family';
import { at } from '@/lib/routes';
const FAMILY = clampFamily(familySaved);

/* Ten cities, one day: the board. Ten rows, east to west: the city (a button that makes it the visitor's city), when
   it starts there, that start in the visitor's own time, people, its state, and a register link. Over it, stuck under
   the header, the belt: the land as a strip of dots with a tick for each city and a fixed line marked Starts (each city at its own Luma start). The belt
   travels as the rows pass (Sydney under the line as the first row enters, San Francisco as the last leaves), and the
   row whose city is under the line is lit. Pointing at or focusing a row brings its city under the line. */

export type BoardCity = OurFact & { reg: string; regLabel: string };
type Props = {
  cities: BoardCity[]; cur: number; nearest: number; pick: (i: number) => void; mode: 'belt' | 'board' | 'clocks';
  beltSpan: number; beltLead: number; beltMs: number; dot: number;
  /* the signed-in person's city (-1 for none): its row says so, and its register link opens the account instead */
  mine?: number; onMine?: () => void;
};

const never = () => () => {};
/* "Thu 10 Dec, 00:00" in the visitor's own zone, after hydration (the server has no visitor) */
const useForYou = (cities: OurFact[]) => {
  const zone = useSyncExternalStore(never, () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', () => '');
  return useMemo(() => {
    if (!zone) return null;
    const f = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    return cities.map((c) => f.format(new Date(c.opens)).replace(/,? (\d\d:\d\d)$/, ', $1'));
  }, [cities, zone]);
};

/* the land's dots, from the baked map: for a strip covering lon0..lon1 (east at the right), rows of dots from 66°N
   to 50°S. Drawn once per size; the strip then only moves. */
const LAT_TOP = 66, LAT_BOT = -50;
function drawLand(cv: HTMLCanvasElement, img: HTMLImageElement, w: number, h: number, lon0: number, lon1: number, dot: number, ink: string) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2, 8000 / w);
  cv.width = Math.round(w * ratio); cv.height = Math.round(h * ratio);
  const g = cv.getContext('2d'); if (!g) return;
  const src = document.createElement('canvas'); src.width = img.naturalWidth; src.height = img.naturalHeight;
  const sg = src.getContext('2d', { willReadFrequently: true }); if (!sg) return;
  sg.drawImage(img, 0, 0); const px = sg.getImageData(0, 0, src.width, src.height).data;
  const land = (lon: number, lat: number) => {
    const x = Math.floor((((lon + 180) % 360 + 360) % 360) / 360 * src.width), y = Math.floor((90 - lat) / 180 * src.height);
    return px[(Math.min(src.height - 1, Math.max(0, y)) * src.width + x) * 4] > 127;
  };
  g.setTransform(ratio, 0, 0, ratio, 0, 0); g.clearRect(0, 0, w, h); g.fillStyle = ink;
  const pitch = dot * 2, rows = Math.max(3, Math.floor(h / pitch)), top = (h - rows * pitch) / 2 + dot / 2;
  for (let x = dot / 2; x < w; x += pitch) {
    const lon = lon0 + (x / w) * (lon1 - lon0);
    for (let r = 0; r < rows; r++) {
      const lat = LAT_TOP - ((r + 0.5) / rows) * (LAT_TOP - LAT_BOT);
      if (land(lon, lat)) g.fillRect(x, top + r * pitch, dot, dot);
    }
  }
}

export function FoldBoard({ cities, cur, nearest, pick, mode, beltSpan, beltLead, beltMs, dot, mine = -1, onMine }: Props) {
  /* the People column only once a city has people to show (P3) */
  const anyPeople = cities.some((c) => c.people == null || showPeople(FAMILY, c.people));
  const forYou = useForYou(cities);
  const sec = useRef<HTMLDivElement>(null), belt = useRef<HTMLDivElement>(null), strip = useRef<HTMLDivElement>(null), land = useRef<HTMLCanvasElement>(null);
  const aim = useRef<number | null>(null), curRef = useRef(cur), wake = useRef<() => void>(() => {});
  useEffect(() => { curRef.current = cur; wake.current(); }, [cur]);
  const lons = useMemo(() => cities.map((c) => c.lon), [cities]);

  /* the belt: one loop while the board is on screen, asleep when nothing moves */
  useEffect(() => {
    if (mode !== 'belt') return;
    const root = sec.current, bl = belt.current, st = strip.current, cv = land.current; if (!root || !bl || !st || !cv) return;
    const rows = Array.from(root.querySelectorAll<HTMLElement>('tbody tr')), ticks = Array.from(st.querySelectorAll<HTMLElement>('.pf-tick'));
    const n = rows.length, E = 220, W = -190; /* the strip covers 220°E to 190°W, so the line never runs off it */
    let ppd = 0, cx = 0, from = 0, to = 1, raf = 0, shown = false, f = -1, lit = -2, last = 0, chasing = false, img: HTMLImageElement | null = null;
    const lonAt = (x: number) => { const i = Math.max(0, Math.min(n - 1, x)), a = Math.floor(i), b = Math.min(n - 1, a + 1); return lons[a] + (lons[b] - lons[a]) * (i - a); };
    const measure = () => {
      /* a narrow belt shows fewer degrees, so its cities stay apart */
      const w = bl.clientWidth, h = bl.clientHeight; ppd = w / (beltSpan * Math.max(0.45, Math.min(1, w / 1000))); cx = w / 2;
      st.style.width = (E - W) * ppd + 'px';
      ticks.forEach((t, i) => { t.style.left = (lons[i] - W) * ppd + 'px'; });
      /* two cities closer than a label's width (London and Lagos) keep their ticks; only the first keeps its name */
      let end = -Infinity;
      ticks.map((t, i) => ({ t, x: (lons[i] - W) * ppd })).sort((p, q) => p.x - q.x).forEach(({ t, x }) => {
        const lab = t.firstElementChild as HTMLElement | null; if (!lab) return;
        const w = lab.offsetWidth + 8, near = x - w / 2 < end; lab.style.visibility = near ? 'hidden' : ''; if (!near) end = x + w / 2;
      });
      /* where the belt sticks, not where it is now (the first measure runs while it is still far down the page) */
      const top = window.scrollY, hdr = parseFloat(getComputedStyle(bl).top) || 0;
      const r0 = rows[0].getBoundingClientRect(), rn = rows[n - 1].getBoundingClientRect();
      /* Sydney under the line as the first row comes into the window; San Francisco as the last passes under the belt */
      from = r0.top + top - window.innerHeight + beltLead; to = rn.bottom + top - hdr - h - beltLead;
      if (to <= from) to = from + 1;
      if (img?.complete) drawLand(cv, img, (E - W) * ppd, cv.clientHeight || h, W, E, dot, getComputedStyle(bl).color);
      f = -1;
    };
    const scrollF = () => Math.max(0, Math.min(1, (window.scrollY - from) / (to - from))) * (n - 1);
    const frame = (t: number) => {
      raf = 0; const dt = last ? Math.min(64, t - last) : 16; last = t;
      const rm = reducedMotion(), target = aim.current ?? (rm ? curRef.current : scrollF());
      let next = target;
      /* a pointed row (and the way back to the scroll) eases; the scroll itself is followed exactly */
      if (f >= 0 && Math.abs(target - f) > 0.002 && !rm && beltMs > 0 && (aim.current !== null || chasing)) next = f + (target - f) * (1 - Math.exp(-dt / (beltMs / 3)));
      chasing = Math.abs(next - target) > 0.002;
      if (!chasing) next = target;
      if (next !== f) {
        f = next; st.style.transform = `translate3d(${(cx - (lonAt(f) - W) * ppd).toFixed(2)}px,0,0)`;
        const l = Math.round(f);
        if (l !== lit) { lit = l; rows.forEach((r, i) => r.toggleAttribute('data-lit', i === l)); ticks.forEach((k, i) => k.toggleAttribute('data-lit', i === l)); }
      }
      if (chasing && shown) raf = requestAnimationFrame(frame); else last = 0;
    };
    const go = () => { if (!raf && shown) raf = requestAnimationFrame(frame); };
    wake.current = () => { chasing = true; go(); };
    const onScroll = () => go();
    const io = new IntersectionObserver(([e]) => { shown = e.isIntersecting; if (shown) { measure(); go(); } }, { rootMargin: '20% 0px' });
    const ro = new ResizeObserver(() => { measure(); go(); });
    io.observe(root); ro.observe(bl); ro.observe(root);
    window.addEventListener('scroll', onScroll, { passive: true });
    const im = new Image(); im.src = at('/wheel/land.png'); im.onload = () => { img = im; measure(); go(); }; img = im.complete ? im : null;
    const onPoint = (i: number | null) => { aim.current = i; chasing = true; go(); };
    const enter = (e: Event) => { const r = (e.target as HTMLElement).closest('tr'); const i = rows.indexOf(r as HTMLElement); if (i >= 0) onPoint(i); };
    const leave = (e: PointerEvent) => { if (!root.contains(e.relatedTarget as Node | null) || !(e.relatedTarget as HTMLElement | null)?.closest?.('tbody tr')) onPoint(null); };
    const blur = (e: FocusEvent) => { if (!(e.relatedTarget as HTMLElement | null)?.closest?.('.pf-board tbody tr')) onPoint(null); };
    const tb = root.querySelector('tbody')!;
    tb.addEventListener('pointerover', enter); tb.addEventListener('pointerleave', leave as EventListener); tb.addEventListener('focusin', enter); tb.addEventListener('focusout', blur as EventListener);
    return () => {
      io.disconnect(); ro.disconnect(); window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); wake.current = () => {};
      tb.removeEventListener('pointerover', enter); tb.removeEventListener('pointerleave', leave as EventListener); tb.removeEventListener('focusin', enter); tb.removeEventListener('focusout', blur as EventListener);
    };
  }, [mode, lons, beltSpan, beltLead, beltMs, dot]);

  return (
    <div ref={sec} className="pf-board-wrap" data-mode={mode}>
      {mode === 'belt' ? (
        <div ref={belt} className="pf-belt" aria-hidden="true">
          <div ref={strip} className="pf-strip">
            <canvas ref={land} className="pf-land" />
            {cities.map((c) => <span key={c.id} className="pf-tick"><span>{CODE[c.id] ?? c.name.slice(0, 3).toUpperCase()}</span></span>)}
          </div>
          <span className="pf-nine"><span>Starts</span></span>
        </div>
      ) : mode === 'clocks' ? <Clocks cities={cities} /> : null}
      <table className="pf-board">
        <caption className="sr-only">The {CITY_WORD} cities, east to west, each with its local start</caption>
        <thead>
          <tr><th scope="col">City</th><th scope="col">Starts there</th><th scope="col">For you</th>{anyPeople ? <th scope="col">People</th> : null}<th scope="col">State</th><th scope="col"><span className="sr-only">Register</span></th></tr>
        </thead>
        <tbody>
          {cities.map((c, i) => (
            <tr key={c.id} data-pf-wait="" data-you={i === cur ? '' : undefined} data-mine={i === mine ? '' : undefined}>
              <th scope="row">
                <button type="button" className="pf-city" aria-pressed={i === cur} onClick={() => pick(i)}>{c.name}</button>
                {i === mine ? <Tag key="mine" text="You’re on the list" />
                  : i === cur ? (() => { const t = mine >= 0 ? 'On the wheel' : i === nearest ? 'Nearest to you' : 'Your pick'; return <Tag key={t} text={t} />; })()
                  : i === nearest && mine < 0 ? <Tag key="quiet" text="Nearest to you" quiet /> : <span className="pf-you" data-none="" aria-hidden="true">{'\u00a0'}</span>}
              </th>
              <td className="pf-num">{c.session}</td>
              <td className="pf-num pf-for">{forYou ? forYou[i] : '\u00a0'}</td>
              {anyPeople ? (c.people == null || showPeople(FAMILY, c.people) ? <td className="pf-num pf-people">{c.count.replace(/ (people|person)$/, '')}</td> : <td className="pf-num" aria-label="Not shown yet">–</td>) : null}
              <td><span className="pf-state" data-status={c.status}><StatusIcon status={c.status} />{STATUS_LABEL[c.status]}</span></td>
              <td>{i === mine && onMine
                ? <button type="button" className="pf-go" aria-haspopup="dialog" onClick={onMine}>Your place<span className="sr-only"> in {c.name}: your account</span></button>
                : <a className="pf-go" href={at(c.reg)}>{c.status === 'full' ? 'Waiting list' : c.status === 'sold' ? 'Sold out' : 'Register'}<span className="sr-only"> for {c.name}</span></a>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* the clocks mode: each city's own time now, a minute at a time */
const tick = (f: () => void) => { const t = window.setInterval(f, 15000); return () => window.clearInterval(t); };
function Clocks({ cities }: { cities: OurFact[] }) {
  const now = useSyncExternalStore(tick, () => Math.floor(Date.now() / 60000) * 60000, () => 0);
  return (
    <ol className="pf-clocks" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${cities.length}, minmax(0, 1fr))` }}>
      {cities.map((c) => {
        const m = now ? (((Math.floor(now / 60000) + c.offset) % 1440) + 1440) % 1440 : -1;
        return <li key={c.id}><span>{CODE[c.id] ?? c.name}</span><b>{m < 0 ? '--:--' : String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')}</b></li>;
      })}
    </ol>
  );
}

/* a row's tag. When it comes onto a row in view (a city picked on the wheel or the board), its words settle on flaps;
   on the page's first paint, or off screen, it is simply there. A new tag is a new element (keyed by its words). */
function Tag({ text, quiet = false }: { text: string; quiet?: boolean }) {
  const el = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const e = el.current; if (!e || e.closest('[data-pf-wait]')) return;
    const b = e.getBoundingClientRect(); if (b.bottom < 0 || b.top > window.innerHeight || performance.now() < 2500) return;
    return flapInto(e, text, flapOpts(e), ' '.repeat(text.length));
  }, [text]);
  return <span ref={el} className="pf-you" data-quiet={quiet ? '' : undefined}>{text}</span>;
}
