'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { CITIES, EPOCH, EVENT, CITY_WORD } from '@/lib/day-data';
import type { HomeWorld } from '@/lib/home';
import { hhmm } from '@/lib/format';
import { LUMA_LIVE, lumaHref } from '@/lib/luma';
import { CODE, PLACE, localTime } from '@/lib/places';
import { StateChip } from '@/components/screen/chip';
import { mountGlobes } from '@/components/screen/globe';
import { BuilderLogo } from '@/components/wheel/builder-logo';
import { Switches, setScreenFx, step, wake } from '@/components/board/prefs';
import { cityWord, focusCity, type Day } from '@/components/board/day-model';
import { cityPrizeName, finalLine, globalPrizeName } from '@/components/home/final-parts';
import { tokEase, tokMs, wipe } from '@/components/shared/motion';
import { DATE, type Href } from './home-parts';
import './footer.css';

/* How every day page ends. One footer for the day home and the city pages, in four
   directions, tuned at /lab/footer and saved in saved/footer.config.json:
   - horizon: the wheel's glass globe rising from a horizon, the ten cities on an arc over it, the city you are on (or
     the one that is live) at the top and lit; pointing at a name turns the globe to that city. The globe is drawn by
     the screen kit's one canvas ([data-globe][data-half]), so the footer adds no drawing context of its own.
   - index: ten cells with the code, the name, the local time now and the state. The horizon becomes this on a phone,
     without WebGL, with Screen off and without script: the same list, laid out by CSS.
   - closedown: a test card, the mark in a centre plate, the clock and the last line; the cities as a row of keys.
   - endboard: the mark drawn once at full width, a slate of facts under it.
   Under each: the sections, Register, Supabase and the legal links, the two switches, and the last line, a sentence
   that is true now. On a city page a tail leader comes first: the city before and after, east to west.
   Local times come from each city's time zone (lib/places.ts), worked out in the browser after the page loads; on the
   server the cells are blank, so the first paint never disagrees. Nothing moves by itself but the minute. */

import { clampFoot, type FootCfg } from './footer-config';
export { FOOT_DEF, FOOT_BOUNDS, FOOT_CHOICES, FOOT_LABELS, clampFoot, type FootCfg, type FootDir } from './footer-config';

const NUM = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
const listOf = (a: string[]) => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
/* the last line: one sentence that is true now, from the model */
export function lastLine(W: HomeWorld): string {
  if (W.allDone || W.picked) return finalLine(W);
  const next = W.cs.filter((x) => x.state === 'next').sort((a, b) => a.start - b.start)[0];
  /* each city at its own start: the next one's, in its own local time */
  const at = next ? hhmm(next.start + next.city.offset) + ' local time' : '';
  if (W.live.length) {
    /* in the chips' own words: building (votes open too), then last votes */
    const build = W.live.filter((x) => x.state === 'build').map((x) => x.name), last = W.live.filter((x) => x.state === 'vote' && x.entries).map((x) => x.name);
    const said = (build.length ? listOf(build) + (build.length === 1 ? ' is' : ' are') + ' building now. ' : '') + (last.length ? listOf(last) + (last.length === 1 ? ' is in its' : ' are in their') + ' last votes. ' : '');
    const n = W.live.length, open = said || (n === 1 ? W.live[0].name + ' is open now. ' : NUM[n] + ' cities are open now: ' + listOf(W.live.map((x) => x.name)) + '. ');
    return open + (next ? next.name + ' opens next, at ' + at + '.' : 'It is the last city of the day.');
  }
  if (!W.done.length) return 'The day has not started. ' + (next ? next.name : CITIES[0].name) + ' opens first, at ' + at + ' on ' + DATE + '.';
  return W.done.length + ' of ' + CITIES.length + ' cities have closed. ' + (next ? next.name + ' opens next, at ' + at + '.' : '');
}

/* true once the page has loaded in a browser: the local times wait for it */
const noop = () => () => {};
function useLoaded(): boolean { return useSyncExternalStore(noop, () => true, () => false); }

/* whether the arc can show: a wide screen (unless a phone keeps the horizon), the globe being drawn, Screen on */
const PHONE = '(max-width: 640px)';
function arcSub(f: () => void) {
  const mq = window.matchMedia(PHONE), mo = new MutationObserver(f);
  mq.addEventListener('change', f); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-globes', 'data-screen-off'] });
  return () => { mq.removeEventListener('change', f); mo.disconnect(); };
}
/* a phone shows the index, so it never starts the globe's canvas (unless the horizon is kept on a phone) */
function phoneSub(f: () => void) { const mq = window.matchMedia(PHONE); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f); }
function useWide(): boolean { return useSyncExternalStore(phoneSub, () => !window.matchMedia(PHONE).matches, () => false); }
function useArc(on: boolean, phoneToo: boolean): boolean {
  return useSyncExternalStore(arcSub, () => {
    const h = document.documentElement;
    return on && h.hasAttribute('data-globes') && !h.hasAttribute('data-screen-off') && (phoneToo || !window.matchMedia(PHONE).matches);
  }, () => false);
}

/* the white dot: Screen off collapses the picture to a line and then a dot, and the plain page appears; Screen on
   opens from the line. The switch itself flips when the screen is dark, so the change is never seen. Under reduced
   motion (the token is 0) it flips at once. */
export function useWhiteDot(on: boolean) {
  useEffect(() => {
    if (!on) return;
    setScreenFx((next, commit) => {
      const d = tokMs('--dur-dot');
      if (!d) { commit(); return; }
      const veil = document.createElement('div'), line = document.createElement('div');
      veil.className = 'ft-veil'; line.className = 'ft-line'; veil.appendChild(line); veil.setAttribute('aria-hidden', 'true'); document.body.appendChild(veil);
      const ease = tokEase('--ease-out', 'ease-out'), opt = { duration: d, easing: 'linear', fill: 'forwards' as const };
      if (!next) {
        veil.animate([{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 1, offset: 0.82 }, { opacity: 0 }], opt);
        line.animate([{ opacity: 0, transform: 'scale(1, 60)', easing: ease }, { opacity: 1, transform: 'scale(1, 1)', offset: 0.3, easing: ease }, { opacity: 1, transform: 'scale(0.004, 1)', offset: 0.66 }, { opacity: 1, transform: 'scale(0.004, 1)', offset: 0.78 }, { opacity: 0, transform: 'scale(0.004, 1)' }], opt);
        window.setTimeout(commit, d * 0.3);
      } else {
        veil.animate([{ opacity: 0 }, { opacity: 1, offset: 0.18 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], opt);
        line.animate([{ opacity: 0, transform: 'scale(0.004, 1)' }, { opacity: 1, transform: 'scale(0.004, 1)', offset: 0.2, easing: ease }, { opacity: 1, transform: 'scale(1, 1)', offset: 0.55, easing: ease }, { opacity: 0, transform: 'scale(1, 40)', offset: 0.8 }, { opacity: 0, transform: 'scale(1, 40)' }], opt);
        window.setTimeout(commit, d * 0.18);
      }
      window.setTimeout(() => veil.remove(), d + 40);
    });
    return () => setScreenFx(null);
  }, [on]);
}

/* the globe faces the city pointed at, turning there in --dur-turn (the shorter way round); at rest, the lit one */
function useTurn(el: React.RefObject<HTMLElement | null>, aim: number) {
  const from = useRef<[number, number] | null>(null);
  useEffect(() => {
    const g = el.current; if (!g) return;
    const to = PLACE[CITIES[aim].id], start = from.current ?? to, d = tokMs('--dur-turn');
    from.current = to;
    if (!d || (start[0] === to[0] && start[1] === to[1])) { g.setAttribute('data-lat', String(to[0])); g.setAttribute('data-lon', String(to[1])); return; }
    let dl = to[1] - start[1]; if (dl > 180) dl -= 360; if (dl < -180) dl += 360;
    const t0 = performance.now(); let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / d), e = 1 - Math.pow(1 - k, 3);
      g.setAttribute('data-lat', (start[0] + (to[0] - start[0]) * e).toFixed(3)); g.setAttribute('data-lon', (start[1] + dl * e).toFixed(3));
      from.current = [Number(g.getAttribute('data-lat')), Number(g.getAttribute('data-lon'))];
      if (k < 1) raf = requestAnimationFrame(tick); else from.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [el, aim]);
}

export type FootSections = { how: string; prizes: string };
export function DayFooter({ W, day, href, sound, city, cfg: given, sections, minute, fastext, style, face, noCities = false, placed }: {
  W: HomeWorld; day: Day; href: Href; sound: boolean; city?: string; cfg: FootCfg; sections: FootSections; minute: number; fastext?: boolean;
  /* the preview page, before the day: the city pages are closed, so no ten cities and no city before and after */
  noCities?: boolean;
  /* the person already has a place: Register opens their account instead */
  placed?: () => void;
  /* the page's board tokens and face: the footer sits outside <main>, so it carries them itself */
  style?: CSSProperties; face?: string;
}) {
  const cfg = clampFoot(given), loaded = useLoaded();
  const lit = city ? CITIES.findIndex((c) => c.id === city) : focusCity(W).i;
  const [aim, setAim] = useState<number | null>(null);
  const globe = useRef<HTMLSpanElement>(null);
  const wide = useWide(), horizon = cfg.dir === 'horizon', draws = horizon && (wide || cfg.phone === 'same');
  useEffect(() => (draws ? mountGlobes(document) : undefined), [draws]);
  useWhiteDot(!!cfg.dot);
  useTurn(globe, aim ?? lit);
  const arc = useArc(horizon, cfg.phone === 'same');
  const ms = EPOCH + minute * 60000;
  /* the ring: the lit city at the top, the others round it in east-to-west order, as on the wheel */
  /* the ring is placed name by name, outward from the lit one: each name moves along the arc until its tilted box
     clears the one before it, so long neighbours at the top (New York, San Francisco) never meet and the sides,
     where names stack, stay close. Boxes are estimated from the name's length, so the server and the page agree. */
  const ang = ringAngles(W.cs.map((c) => c.name), lit, cfg);
  const pos = (i: number) => { const a = ang[i]; return { a, s: Math.sin((a * Math.PI) / 180), c: Math.cos((a * Math.PI) / 180) }; };
  const vars = { ...style, '--ft-size': cfg.size + 'px', '--ft-rise': cfg.rise, '--ft-gap': cfg.gap + 'px', '--ft-name': cfg.nameSize + 'px', '--ft-cell': cfg.cellH + 'px' } as CSSProperties;

  const cities = (
    <nav className="ft-cities" aria-label={`The ${CITY_WORD} cities`}>
      <ol>
        {W.cs.map((x, i) => {
          const p = pos(i), w = cityWord(x, W, day), me = i === lit;
          return (
            <li key={x.id} className="ft-c" data-lit={me ? '' : undefined} style={{ '--s': p.s.toFixed(4), '--c': p.c.toFixed(4), '--r': (p.a * cfg.tilt).toFixed(2) + 'deg' } as CSSProperties}>
              <Link href={href(x.id)} aria-current={city === x.id ? 'page' : undefined} onPointerEnter={(e) => { if (e.pointerType === 'mouse') setAim(i); }} onPointerLeave={() => setAim(null)} onFocus={() => setAim(i)} onBlur={() => setAim(null)}>
                <span className="ft-code">{CODE[x.id]}</span>
                <span className="ft-name">{x.name}</span>
                <span className="ft-meta">
                  {cfg.clocks ? <span className="ft-time" suppressHydrationWarning>{loaded ? <><span className="ft-now">now</span><span className="sr-only"> local time</span> {localTime(x.id, ms)}</> : ''}</span> : null}
                  <StateChip s={w} />
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );

  return (
    <footer className="bd ft" data-dir={cfg.dir} data-arc={arc ? '' : undefined} data-face={face} data-fastext={fastext ? '' : undefined} style={vars}>
      {city && cfg.tail && !noCities ? <Tail city={city} href={href} /> : null}
      {cfg.dir === 'closedown' ? <Closedown W={W} lit={lit} line={lastLine(W)} clock={loaded ? localTime(CITIES[lit].id, ms) : ''} /> : null}
      {cfg.dir === 'endboard' ? <EndMark W={W} /> : null}
      {noCities ? null : horizon ? (
        <div className="ft-sky">
          {cities}
          <span ref={globe} className="ft-globe" data-globe="" data-half="" data-lat={PLACE[CITIES[lit].id][0]} data-lon={PLACE[CITIES[lit].id][1]} data-glow="1" aria-hidden="true" />
          {cfg.spin ? <Spin aim={aim ?? lit} setAim={setAim} /> : null}
        </div>
      ) : cities}
      <div className="ft-board">
        <nav className="ft-cells ft-sec" aria-label="On this page and before the day">
          <a href={sections.how}>How it works</a>
          <a href={sections.prizes}>Prizes</a>
          <a href="/preview#questions">Questions</a>
          {placed ? <button type="button" aria-haspopup="dialog" onClick={placed}>Your place</button> : LUMA_LIVE ? <a href={lumaHref(city)}>Register</a> : null}
        </nav>
        <nav className="ft-cells ft-sb" aria-label="Supabase">
          <a href="https://supabase.com">supabase.com</a>
          <a href="https://supabase.com/docs">Docs</a>
          <a href="https://supabase.com/privacy">Privacy</a>
          <a href="https://supabase.com/terms">Terms</a>
        </nav>
        <Switches sound={sound} />
      </div>
      <div className="ft-end">
        {cfg.last ? <p className="ft-last">{lastLine(W)}</p> : null}
        <p className="ft-sig bd-k">{EVENT.name} · {DATE}{cfg.credit ? ' · Wheel by anthony lio' : ''}</p>
      </div>
    </footer>
  );
}

/* the tail leader: where this city sits in the day, with the one before and the one after */
function Tail({ city, href }: { city: string; href: Href }) {
  const i = CITIES.findIndex((c) => c.id === city), prev = CITIES[i - 1], next = CITIES[i + 1];
  return (
    <nav className="ft-tail" aria-label="The city before and after">
      {prev ? <Link href={href(prev.id)} className="ft-tl"><span aria-hidden="true">←</span> {prev.name}<span className="sr-only">, the city before</span></Link> : <span className="ft-tl bd-k">First city<span className="ft-tm-w"> of the day</span></span>}
      <span className="ft-tm bd-k"><span className="ft-tm-w">City </span>{i + 1} of {CITIES.length}</span>
      {next ? <Link href={href(next.id)} className="ft-tl ft-tr">{next.name}<span className="sr-only">, the city after</span> <span aria-hidden="true">→</span></Link> : <span className="ft-tl ft-tr bd-k">Last city<span className="ft-tm-w"> of the day</span></span>}
    </nav>
  );
}

/* turning the globe by hand (off by default): arrow keys or a drag step through the cities, with the wheel's click */
function Spin({ aim, setAim }: { aim: number; setAim: (i: number | null) => void }) {
  const drag = useRef<{ x: number; at: number } | null>(null);
  const go = (d: number) => { setAim((aim + d + CITIES.length) % CITIES.length); step(true); };
  return (
    <span className="ft-spin" role="slider" tabIndex={0} aria-label="Turn the globe" aria-valuemin={1} aria-valuemax={CITIES.length} aria-valuenow={aim + 1} aria-valuetext={CITIES[aim].name}
      onKeyDown={(e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); go(1); } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); go(-1); } }}
      onPointerDown={(e) => { wake(); drag.current = { x: e.clientX, at: aim }; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => { const d = drag.current; if (!d) return; const n = (d.at + Math.round((e.clientX - d.x) / 40) + CITIES.length * 10) % CITIES.length; if (n !== aim) { setAim(n); step(true); } }}
      onPointerUp={() => { drag.current = null; }} />
  );
}

/* closedown: a test card with the mark on a centre plate, the lit city's clock and the last line */
const BARS = ['#f4f4f2', '#c9c9c5', '#3d3dff', '#6b6c6b', '#ff7a1a', '#2b2c2c', '#a3a39f'];
function Closedown({ W, lit, line, clock }: { W: HomeWorld; lit: number; line: string; clock: string }) {
  const x = W.cs[lit];
  return (
    <figure className="ft-card" aria-label={'Closedown card. ' + line}>
      <svg viewBox="0 0 700 260" preserveAspectRatio="none" aria-hidden="true" className="ft-card-bg">
        {BARS.map((c, i) => <rect key={i} x={i * 100} y={0} width={100.5} height={170} fill={c} opacity={0.82} />)}
        {BARS.slice().reverse().map((c, i) => <rect key={'r' + i} x={i * 100} y={170} width={100.5} height={14} fill={i % 2 ? '#0c0d0d' : c} opacity={0.6} />)}
        <g stroke="#f4f4f2" strokeOpacity="0.14">{Array.from({ length: 35 }, (_, i) => <line key={i} x1={i * 20} x2={i * 20} y1={184} y2={260} />)}</g>
      </svg>
      <figcaption className="ft-plate">
        <BuilderLogo className="ft-plate-mark" />
        <span className="ft-plate-row"><span className="ft-code">{CODE[x.id]}</span><span className="ft-time" suppressHydrationWarning>{clock}</span></span>
      </figcaption>
    </figure>
  );
}

/* the end board: the mark drawn once at full width when it comes into view, then still, and a slate of facts */
function EndMark({ W }: { W: HomeWorld }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    /* the mark waits undrawn until the wipe starts, so it never shows whole, goes, and draws again. Only once the page
       runs and motion is on: without either it is simply there */
    const dur = tokMs('--dur-draw') * 3; if (dur <= 0) return;
    el.setAttribute('data-wait', '');
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { wipe(el, dur, 0, tokEase('--ease-out', 'ease-out')); el.removeAttribute('data-wait'); io.disconnect(); } }, { threshold: 0.4 });
    io.observe(el); return () => { io.disconnect(); el.removeAttribute('data-wait'); };
  }, []);
  const slate: [string, ReactNode][] = [['Event', EVENT.name], ['Date', DATE], ['Cities', CITIES.length + ', east to west'], ['Prizes', globalPrizeName() + ' and ' + cityPrizeName() + ' ×' + CITIES.length], ['Picked by', W.picked ? EVENT.pickers + ': ' + W.final.p.name : EVENT.pickers], ['Made with', 'Supabase']];
  return (
    <div className="ft-endb">
      <div ref={ref} className="ft-endb-mark"><BuilderLogo /></div>
      <dl className="ft-slate">{slate.map(([k, v]) => <div key={k}><dt className="bd-k">{k}</dt><dd>{v}</dd></div>)}</dl>
    </div>
  );
}

/* ---------- the ring's angles ---------- */
type Box = { x: number; y: number; hw: number; hh: number; t: number };
function apart(p: Box, q: Box): boolean {
  /* two turned boxes are apart when some axis of either separates them */
  for (const b of [p, q]) for (const ax of [[Math.cos(b.t), Math.sin(b.t)], [-Math.sin(b.t), Math.cos(b.t)]]) {
    const r = (o: Box) => o.hw * Math.abs(ax[0] * Math.cos(o.t) + ax[1] * Math.sin(o.t)) + o.hh * Math.abs(-ax[0] * Math.sin(o.t) + ax[1] * Math.cos(o.t));
    if (Math.abs((q.x - p.x) * ax[0] + (q.y - p.y) * ax[1]) > r(p) + r(q)) return true;
  }
  return false;
}
function ringAngles(names: string[], lit: number, cfg: FootCfg): number[] {
  const n = names.length, Rg = cfg.size / 2 + cfg.gap, ns = cfg.nameSize, D = Math.PI / 180, out = new Array<number>(n).fill(0);
  const box = (i: number, a: number, big = 1): Box => ({ x: Rg * Math.sin(a * D), y: -Rg * Math.cos(a * D), hw: names[i].length * 0.29 * ns * big + 8, hh: ns * 0.62 * big, t: a * cfg.tilt * D });
  /* the lit name, bigger, with its time and state under it */
  const litB: Box = { ...box(lit, 0, 1.5), hw: names[lit].length * 0.29 * ns * 1.5 + 24, hh: ns * 1.5 * 0.62 + ns * 0.7, y: -Rg + ns * 0.7 };
  /* the spread knob: the least angle between two neighbours, so a larger spread opens the ring */
  const least = cfg.spread / 20;
  for (const side of [-1, 1]) {
    let prev = litB, a = 0, was = 0;
    for (let k = 1; k <= (side < 0 ? 5 : 4); k++) {
      const i = (lit + side * k + n) % n;
      a = Math.max(a, was + (k > 1 ? least : 0));
      do a += 0.5; while (a < 150 && !(apart(box(i, side * a), prev) && apart(box(i, side * a), litB)));
      out[i] = side * a; prev = box(i, side * a); was = a;
    }
  }
  /* five names on one side and four on the other: the shorter arm opens out until both arms end at the same angle, so
     the ring sits even over the globe (opening only moves names apart) */
  const ends = [-1, 1].map((side) => Math.max(...out.filter((a) => Math.sign(a) === side).map(Math.abs), 0));
  const short = ends[0] < ends[1] ? -1 : 1, k = Math.max(...ends) / (Math.min(...ends) || 1);
  return out.map((a) => (Math.sign(a) === short ? a * k : a));
}
