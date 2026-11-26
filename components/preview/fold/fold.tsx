'use client';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent } from 'react';
import type { WheelCfg } from '@/components/wheel/config';
import type { WheelEngine, WheelFlow } from '@/components/wheel/engine';
import { HERO, Wheel, wheelVars } from '@/components/wheel/wheel';
import type { HeroCfg } from '@/components/wheel/hero-config';
import { LUMA_LIVE, lumaHref } from '@/lib/luma';
import { EPOCH, EVENT } from '@/lib/day-data';
import { CAPTION, useOurCities } from '../preview';
import type { Here, OurWheel } from '../facts';
import { foldVars, type FoldCfg } from './config';
import { FoldHeader } from './header';
import { flapInto, reducedMotion } from './flap';
import { BACK_ATTR, arrivePlan } from './arrive';
import { mountDotGlobes } from '@/components/wheel/dot-globes';
import { SupabaseMark } from '@/components/shared/supabase-mark';
import screenSaved from '@/saved/screen.config.json';
import { clampScreen } from '@/components/screen/config';
import { Screen } from '@/components/screen/screen';
import './fold.css';

/* The page: the wheel as the one screen, at the window's height, with the header over it. One piece of state is the
   visitor's city: the nearest (or ?city=), then a press on the wheel. The wheel and the header's register cell read it;
   every register link goes to that city's Luma event. */

const never = () => () => {};
const useOffset = () => useSyncExternalStore(never, () => -new Date().getTimezoneOffset(), () => null);
const useReduced = () => useSyncExternalStore((f) => { const m = window.matchMedia('(prefers-reduced-motion: reduce)'); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, reducedMotion, () => false);
const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
const count = (n: number) => WORDS[n] ?? String(n);
/* the screen kit as saved (big type only) */
const SCREEN = clampScreen(screenSaved);

type Props = { cfg: FoldCfg; wheel: WheelCfg; ours: OurWheel; forced: number | null; here?: Here | null; noGl: boolean; hero?: HeroCfg };

export function FoldPage({ cfg, wheel, ours, forced, here = null, noGl, hero: heroCfg = HERO }: Props) {
  const { cities, start } = useOurCities(ours, forced, here), off = useOffset();
  const [pick, setPick] = useState<number | null>(null), cur = pick ?? start, city = cities[cur] ?? cities[0];
  const eng = useRef<WheelEngine | null>(null), rm = useReduced();
  const onCity = useCallback((i: number) => setPick(i), []);

  /* the register links: each city's Luma event */
  const reg = useMemo(() => cities.map((c) => ({ ...c, soon: undefined, href: lumaHref(c.id), action: c.status === 'full' ? 'Join the waiting list in ' + c.name : c.status === 'sold' ? c.name + ' is sold out' : 'Register for ' + c.name })), [cities]);

  /* the header: its paper once the page leaves the top */
  const [paper, setPaper] = useState(false);
  const introRan = useRef(false);
  const introOn = cfg.arrival !== 'none';
  const [intro, setIntro] = useState<'hold' | 'in' | 'done'>(introOn ? 'hold' : 'done'), [drawn, setDrawn] = useState(false);
  /* the arrival actually played: the saved one, or quiet when the page was reached with Back or Forward */
  const [played, setPlayed] = useState(cfg.arrival);
  const onReady = useCallback(() => { setDrawn(true); if (introRan.current) eng.current?.arrive?.(0, 0); }, []);
  const topSentinel = useRef<HTMLDivElement>(null), lens = useRef<HTMLSpanElement>(null), mirror = useRef<HTMLCanvasElement>(null), hdr = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = topSentinel.current, io = new IntersectionObserver(([e]) => setPaper(!e.isIntersecting && e.boundingClientRect.top < 0));
    if (t) io.observe(t);
    /* in the same frame as the scroll that leaves the top: the observer is a frame or two late */
    const lift = () => { if (window.scrollY > 8) hdr.current?.querySelector('.pf-hdr')?.setAttribute('data-paper', ''); };
    window.addEventListener('scroll', lift, { passive: true });
    return () => { io.disconnect(); window.removeEventListener('scroll', lift); };
  }, [rm]);

  const flow: WheelFlow = useMemo(() => ({
    fixed: true, peek: 0, globe: 'leaves', dockEnd: cfg.dockEnd, turn: cfg.dockTurn, wheelOverGlobe: cfg.input === 'globe',
    dock: () => null, shown: () => false, mirror: () => mirror.current,
    hold: introOn, ready: onReady,
  }), [cfg.dockEnd, cfg.dockTurn, cfg.input, introOn, onReady]);

  /* the arrival (arrive.ts). The words are already arriving by CSS from the first paint; the wheel's names and globe,
     its cells and the link wait unseen until the page knows the visitor's city and the wheel has drawn once (or 600ms,
     whichever is first): that is t0, and the arrival plays from it. Under reduced motion everything is there at once. */
  useEffect(() => {
    if (!introOn || introRan.current || off === null) return;
    const timers: number[] = [];
    const go = () => {
      if (introRan.current) return; introRan.current = true;
      const skip = rm || window.scrollY > 8 || performance.now() > 1500;
      const back = document.documentElement.hasAttribute(BACK_ATTR);
      const mode = back && cfg.back === 'quiet' ? 'quiet' : cfg.arrival, p = arrivePlan(mode, cfg), e = eng.current;
      setPlayed(mode);
      if (skip) { e?.arrive?.(0, 0); setIntro('done'); return; }
      const sweep = p.sweep === 'east' ? (cur > 0 ? cur : 0) : p.sweep, steps = (p.globeMs / 1000) * wheel.globeFps;
      if (p.namesAfter > 0) {
        e?.arrive?.(0, 1, { globe: p.globe, steps, names: false });
        timers.push(window.setTimeout(() => eng.current?.arrive?.(sweep, p.ink), p.namesAfter));
      } else e?.arrive?.(sweep, p.ink, { globe: p.globe, steps, turnGlobe: p.turnGlobe });
      requestAnimationFrame(() => setIntro('in'));
      timers.push(window.setTimeout(() => setIntro('done'), p.end));
    };
    if (drawn) go(); else timers.push(window.setTimeout(go, 600));
    return () => timers.forEach((t) => window.clearTimeout(t));
    /* cur is read once, when the arrival starts */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [introOn, off, drawn, rm, cfg, wheel.globeFps]);
  const flap = useMemo(() => ({ flapMs: cfg.flapMs, flaps: cfg.arrive === 'tube' ? cfg.flaps : 0, stagger: cfg.flapStagger }), [cfg.flapMs, cfg.flaps, cfg.flapStagger, cfg.arrive]);
  useEffect(() => {
    if (intro !== 'in' || played !== 'flap') return;
    const el = document.querySelector<HTMLElement>('.pf .wh-cta-text > span:last-child'); if (!el) return;
    const text = el.textContent ?? '';
    let stop = () => {};
    const t = window.setTimeout(() => { stop = flapInto(el, text, { ...flap, flaps: Math.max(4, flap.flaps) }, ' '.repeat(text.length)); }, cfg.linkAt);
    return () => { window.clearTimeout(t); stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intro, played]);

  /* with the text globe every small globe is its globe of dots (the link's) */
  const dots = wheel.globe === 'ascii';
  useEffect(() => (dots ? mountDotGlobes(document, wheel) : undefined), [dots, wheel]);

  /* the page always opens at its first screen */
  useEffect(() => {
    const prev = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    if (window.location.hash) history.replaceState(history.state, '', window.location.pathname + window.location.search);
    return () => { history.scrollRestoration = prev; };
  }, []);
  const jump = useCallback((_id: string, e: MouseEvent) => { e.preventDefault(); window.scrollTo({ top: 0 }); }, []);

  const n = cities.length;
  /* the column layout carries its own words over the cells (the wheel places them) */
  const column = wheel.layout === 'column';
  const WEEKDAY = new Date(EPOCH).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
  const rsvp = LUMA_LIVE && ours.regOpen ? 'RSVP now open' : 'RSVP opens soon';
  const dateLine = heroCfg.weekday ? `${WEEKDAY} ${ours.date}` : ours.date;
  const head = <><h1><span className="sr-only">{EVENT.name}, {ours.date}: </span>{ours.buildMin}min Build Challenge<span className="sr-only">, in {n} cities</span></h1><p className="wh-lead-muted">Officially hosted by <span className="wh-supabase"><SupabaseMark /><span>supabase</span></span></p></>;
  const lead = column ? (heroCfg.words === 'tight'
    ? <div>{head}<p className="wh-lead-date">{dateLine}</p>{heroCfg.rsvp ? <p>{rsvp}</p> : null}</div>
    : <><div>{head}</div><div><p>{dateLine}</p>{heroCfg.rsvp ? <p>{rsvp}</p> : null}</div></>
  ) : undefined;
  const words = !column && cfg.words === 'lede' ? (
    <div className="pf-words">
      <p className="pf-words-1"><span data-t={`Build for ${ours.buildMin} minutes.`}>Build for {ours.buildMin} minutes.</span> <span data-t={`${count(n)} cities, one day.`}>{count(n)} cities, one day.</span></p>
      <p className="pf-words-2">{LUMA_LIVE && ours.regOpen ? 'Registration is open.' : 'Registration opens soon.'}</p>
    </div>
  ) : null;

  return (
    <div className="pf" data-page="hero" data-intro={introOn ? intro : undefined} data-arrival={introOn ? played : undefined} data-back={cfg.back} data-dir="line" data-glass="fixed" data-dock="leaves" data-arrive={cfg.arrive} data-small={dots ? 'dots' : 'glass'} style={{ ...wheelVars(wheel), ...foldVars(cfg) } as CSSProperties}>
      <PaperStyle paper={wheel.paper} />
      {introOn && played === 'scan' ? <div className="pf-scan" aria-hidden="true" /> : null}
      <Screen cfg={SCREEN} />
      <div ref={hdr} className="pf-hdr-wrap">
        <FoldHeader mark={wheel.mark} paper={paper} lens={lens} mirror={mirror} jump={jump} flap={flap}
          reg={{ href: lumaHref(city.id), city: city.name, waiting: city.status === 'full' }}
          dot={dots ? { lat: city.lat, lon: city.lon } : null} />
      </div>
      <Wheel key={String(rm)} cities={reg} cfg={wheel} noGl={noGl} mark={wheel.mark} engineRef={eng} start={start} date={ours.date} caption={CAPTION} onCity={onCity} lead={lead} hero={heroCfg} flow={flow}>
        {words}
        <div ref={topSentinel} className="pf-sentinel" style={{ top: 8 }} aria-hidden="true" />
      </Wheel>
    </div>
  );
}

/* the page's ground on <html> and <body> from the server's HTML, before any script: the first paint is the final ground */
function PaperStyle({ paper: p }: { paper: number }) {
  return <style>{`:root:has(.pf){--pf-paper:rgb(${p} ${p + 1} ${p + 1})}`}</style>;
}
