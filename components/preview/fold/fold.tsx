'use client';
import { startTransition, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import type { WheelCfg } from '@/components/wheel/config';
import type { WheelEngine, WheelFlow } from '@/components/wheel/engine';
import { HERO, Wheel, wheelVars } from '@/components/wheel/wheel';
import type { HeroCfg } from '@/components/wheel/hero-config';
import { PrizeBlock } from '@/components/day/explain';
import { GetReady } from '@/components/day/get-ready';
import { DayScreen } from '@/components/day/shared';
import { DayFooter } from '@/components/day/footer';
import { Ending, type EndCity } from '@/components/day/ending';
import { clampEnd, type EndCfg } from '@/components/day/ending-config';
import { clampFoot, type FootCfg } from '@/components/day/footer-config';
import { dayOf } from '@/components/day/day';
import { homeAt } from '@/components/board/day-model';
import { clampParts, partsVars, type PartsCfg } from '@/components/board/config';
import { realMinute } from '@/lib/clock';
import { LUMA_LIVE, lumaHref } from '@/lib/luma';
import { PRIZES } from '@/lib/prizes';
import { EPOCH, EVENT } from '@/lib/day-data';
import footSaved from '@/saved/footer.config.json';
import endSaved from '@/saved/ending.config.json';
import partsSaved from '@/saved/parts.config.json';
import { CAPTION, useOurCities } from '../preview';
import { nearestCity, type Here, type OurFacts } from '../facts';
import { foldVars, type FoldCfg } from './config';
import { FoldHeader, type Part } from './header';
import { FoldBar } from './bar';
import { FoldBoard, type BoardCity } from './board';
import { FoldReady } from './ready';
import { FoldList } from './checklist';
import { FoldShort } from './short';
import { FoldPodium } from './podium';
import { FoldPrizeType } from './prize-type';
import { FoldHow } from './how';
import { Unroll } from './unroll';
import { jumpTo, jumpTop, once, useConverge, useWrite } from './motion';
import { flapInto } from './flap';
import { BACK_ATTR, arrivePlan } from './arrive';
import { mountGlobes } from '@/components/screen/globe';
import { useLaunch } from '@/components/wheel/use-launch';
import { LAUNCH, type LaunchCfg } from '@/components/wheel/launch-config';
import { mountDotGlobes } from '@/components/wheel/dot-globes';
import { usePref } from '@/components/board/prefs';
import { tokEase, useReduced } from '@/components/shared/motion';
import { SupabaseLockup } from '@/components/shared/supabase-mark';
import { useForms } from '@/components/forms/forms-provider';
import { meNow, useFormsState } from '@/components/forms/store';
import { cellState, openAccount } from '@/components/account/account';
import { CODE } from '@/lib/places';
import type { Acct } from './header';
import '@/components/board/board.css';
import '@/components/day/explain.css';
import './fold.css';

/* The preview page without its sheet: the wheel as the first screen, then the day under the fold, as sections.
   - plain: the sheet's blocks stacked under the wheel at full width, nothing else;
   - line: the wheel on fixed glass, the bar, the parts in their order, the header that becomes cells, the globe that
     docks into the header's register cell, the city board with its belt, the dry run, the questions, the closing
     line and the end board;
   - unroll: line, with the wheel's names straightening into the board as they leave (lab only).
   One piece of state is the visitor's city: the nearest by time zone (or ?city=), then a press on the wheel or the
   board. The wheel, the header, the board, Get ready, the closing line and the footer all read it. */

const never = () => () => {};
const useOffset = () => useSyncExternalStore(never, () => -new Date().getTimezoneOffset(), () => null);
const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
const count = (n: number) => WORDS[n] ?? String(n);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Props = {
  cfg: FoldCfg; wheel: WheelCfg; ours: OurFacts; forced: number | null; here?: Here | null; noGl: boolean; nowMs: number;
  /* how the page ends (saved/ending.config.json unless a lab passes its own) */
  ending?: EndCfg;
  /* the first screen's left side (saved/hero.config.json unless a lab passes its own) */
  hero?: HeroCfg;
  /* the Register launch (default: saved/launch.config.json); dry: it plays and Luma does not open (the lab) */
  launch?: LaunchCfg; dry?: boolean;
  /* the lab's own things over the page (its panel) */
  children?: ReactNode;
};

export function FoldPage({ cfg, wheel, ours, forced, here = null, noGl, nowMs, ending, hero: heroCfg = HERO, launch = LAUNCH, dry = false, children }: Props) {
  const { cities, start } = useOurCities(ours, forced, here), off = useOffset();
  const nearest = off === null ? 0 : nearestCity(ours.cities, off, here);
  const [pick, setPick] = useState<number | null>(null), cur = pick ?? start, city = cities[cur] ?? cities[0];
  const eng = useRef<WheelEngine | null>(null), rm = useReduced();
  /* pressing the ticket's Register folds it into a rocket that flies to its city, then Luma opens (use-launch.ts) */
  useLaunch(eng, launch, dry);
  /* the wheel's clicks follow the visitor's Sound and Screen switches, the same ones the day pages use */
  const [snd] = usePref('sound'), [scr] = usePref('screen');
  const wcfg = useMemo(() => (snd && scr ? wheel : { ...wheel, sound: 0 }), [wheel, snd, scr]);
  const line = cfg.dir !== 'plain', fixed = line && cfg.glass === 'fixed';
  /* hero: the first screen alone, at the window's height, with no sign in and nothing under it (saved/fold.config.json `page`) */
  const hero = cfg.page === 'hero';
  /* unroll: the names leave the wheel for the board, so the board comes straight after the bar */
  const unroll = cfg.dir === 'unroll' && fixed, gone = useRef(false), ord = unroll ? 'cities-first' : cfg.order;
  const onCity = useCallback((i: number) => setPick(i), []);
  const choose = useCallback((i: number) => { setPick(i); eng.current?.go(i, true); }, []);

  /* the person, drawn after /api/me answers, so the first paint is the signed-out page */
  const forms = useForms(), fs = useFormsState(), me = meNow();
  /* with signing in off, the page is the signed-out page for everyone */
  const pass = cfg.signin === 'on' ? me?.pass ?? null : null, mine = pass ? cities.findIndex((c) => c.id === pass.city) : -1;
  /* the header's register cell is the person's own (a button, not the link): the dock is measured again when it changes */
  const mineCell = !!forms && cfg.signin === 'on' && cfg.acct === 'merged' && cellState(fs.signedIn, me) === 'place';
  const signIn = useMemo(() => (forms ? () => openAccount(forms) : undefined), [forms]);
  const acct: Acct | null = useMemo(() => {
    if (!forms || hero || cfg.signin === 'off') return null;
    const state = cellState(fs.signedIn, me);
    return { state, code: pass ? CODE[pass.city] || pass.city.slice(0, 3).toUpperCase() : '', cityName: pass?.cityName || '', merged: cfg.acct === 'merged', top: cfg.acctTop === 'both',
      open: signIn! };
  }, [forms, hero, fs.signedIn, me, pass, cfg.acct, cfg.acctTop, cfg.signin, signIn]);
  /* arriving signed in, the wheel turns to the person's city, once, and never after the visitor has turned it (an
     address with ?city= already says where to start) */
  /* the register links: for the person's own city they open the account instead ("Your place in Berlin"). No
     countdown cell on the wheel: every city opens on the same day, so it said the same thing ten times. */
  const reg = useMemo(() => cities.map((c, i) => (i === mine && forms
    ? { ...c, soon: undefined, href: '#ready', action: 'Your place in ' + c.name, press: () => forms.account() }
    : { ...c, soon: undefined, href: lumaHref(c.id), action: c.status === 'full' ? 'Join the waiting list in ' + c.name : c.status === 'sold' ? c.name + ' is sold out' : 'Register for ' + c.name })), [cities, mine, forms]);
  const board: BoardCity[] = useMemo(() => reg.map((c) => ({ ...c, reg: c.href, regLabel: c.action })), [reg]);
  const placed = useRef(false);
  useEffect(() => {
    if (placed.current || mine < 0) return;
    placed.current = true;
    if (pick === null && forced === null && mine !== start) eng.current?.go(mine);
  }, [mine, pick, forced, start]);

  /* the header: on once the wheel is mostly gone; the cell of the part on screen is lit */
  const [on, setOn] = useState(false), [paper, setPaper] = useState(false), [lit, setLit] = useState<string | null>(null);
  const introOn = line && cfg.arrival !== 'none', introRan = useRef(false);
  const [intro, setIntro] = useState<'hold' | 'in' | 'done'>(introOn ? 'hold' : 'done'), [drawn, setDrawn] = useState(false);
  /* the arrival actually played: the saved one, or quiet when the page was reached with Back or Forward */
  const [played, setPlayed] = useState(cfg.arrival);
  const onReady = useCallback(() => { setDrawn(true); if (introRan.current) eng.current?.arrive?.(0, 0); }, []);
  const onRef = useRef(false), sentinel = useRef<HTMLDivElement>(null), topSentinel = useRef<HTMLDivElement>(null), lens = useRef<HTMLSpanElement>(null), mirror = useRef<HTMLCanvasElement>(null), hdr = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const s = sentinel.current; if (!s || !line) return;
    /* while the header is on, the wheel's own globe grip and register link (scrolled away, or under the header) leave
       the tab order: the header's cells and its register cell do their jobs */
    const keys = Array.from(s.closest('.wh-pin')?.querySelectorAll<HTMLElement>('.wh-grip, .wh-cta') ?? []);
    const io = new IntersectionObserver(([e]) => {
      const v = !e.isIntersecting && e.boundingClientRect.top < 0; onRef.current = v; setOn(v); eng.current?.wake?.();
      keys.forEach((k) => (v ? k.setAttribute('tabindex', '-1') : k.classList.contains('wh-grip') ? k.setAttribute('tabindex', '0') : k.removeAttribute('tabindex')));
    });
    io.observe(s);
    /* the paper comes as soon as the page leaves the top, so nothing scrolls through the mark */
    const t = topSentinel.current, io2 = new IntersectionObserver(([e]) => setPaper(!e.isIntersecting && e.boundingClientRect.top < 0));
    if (t) io2.observe(t);
    /* and in the same frame as the scroll that leaves the top: the observer is a frame or two late, and on a phone the
       wheel's cells sit just under the mark. React's own state follows a moment later and agrees. */
    const lift = () => { if (window.scrollY > 8) hdr.current?.querySelector('.pf-hdr')?.setAttribute('data-paper', ''); };
    window.addEventListener('scroll', lift, { passive: true });
    return () => { io.disconnect(); io2.disconnect(); window.removeEventListener('scroll', lift); };
    /* the sentinels live in the wheel, which is a new one when the glass or reduced motion changes */
  }, [line, fixed, rm]);
  const main = useRef<HTMLElement>(null);
  /* a header jump lights its target at once; the sections it passes on the way are not lit (until it lands) */
  const litHold = useRef(0);
  useEffect(() => {
    const m = main.current; if (!m || !line) return;
    /* the closing line and the end board are parts of no cell: there, no cell is lit */
    const parts = Array.from((m.parentElement ?? m).querySelectorAll<HTMLElement>('[data-part]'));
    const io = new IntersectionObserver((es) => { if (performance.now() < litHold.current) return; for (const e of es) if (e.isIntersecting) setLit((e.target as HTMLElement).dataset.part ?? null); }, { rootMargin: '-40% 0px -55% 0px' });
    parts.forEach((p) => io.observe(p)); return () => io.disconnect();
  }, [line, ord, cfg.cities, cfg.ready]);

  /* where the globe docks: the header's register lens, measured on resize; the header sticks after a short scroll */
  const dockAt = useRef<{ x: number; y: number; r: number; stick: number } | null>(null);
  useEffect(() => {
    if (!fixed) return;
    const measure = () => {
      const l = lens.current, h = hdr.current; if (!l || !h) { dockAt.current = null; return; }
      const b = l.getBoundingClientRect(), hb = h.getBoundingClientRect(), stuck = cfg.hdrH - h.offsetHeight;
      if (!b.width) { dockAt.current = null; return; }
      dockAt.current = { x: b.left + b.width / 2, y: b.top - hb.top + b.height / 2, r: b.width / 2, stick: stuck };
      eng.current?.wake?.();
    };
    measure();
    /* the register cell becomes the account's button (a new element, with a new lens) once /api/me answers: measure
       again after that frame's layout */
    const raf = requestAnimationFrame(measure);
    /* the lens moves without changing size when its cell or the cells beside it change width (a font arriving, the
       account cell's label): watch those too */
    const ro = new ResizeObserver(measure); if (hdr.current) ro.observe(hdr.current); if (lens.current) { ro.observe(lens.current); const cell = lens.current.parentElement; if (cell) { ro.observe(cell); if (cell.parentElement) ro.observe(cell.parentElement); } }
    let live = true; document.fonts?.ready.then(() => { if (live) measure(); });
    return () => { live = false; cancelAnimationFrame(raf); ro.disconnect(); };
  }, [fixed, cfg.hdrH, cfg.dockSize, mineCell]);
  /* only the glass ball docks in the header; a text globe or none leaves, and the header gets a small glass globe of its own */
  const dockMode = rm || wheel.globe !== 'glass' ? 'leaves' : cfg.globe;
  const flow: WheelFlow = useMemo(() => ({
    fixed, peek: hero ? 0 : cfg.peek, globe: dockMode, dockEnd: cfg.dockEnd, turn: cfg.dockTurn, wheelOverGlobe: cfg.input === 'globe',
    dock: () => { const d = dockAt.current; if (!d) return null; return { x: d.x, y: d.y + Math.max(-window.scrollY, d.stick), r: d.r }; },
    shown: () => onRef.current, mirror: () => mirror.current,
    ...(unroll ? { unroll: () => gone.current } : {}),
    hold: introOn, ready: onReady,
  }), [unroll, fixed, hero, cfg.peek, dockMode, cfg.dockEnd, cfg.dockTurn, cfg.input, introOn, onReady]);

  /* the first screen's arrival (arrive.ts). The words are already arriving by CSS from the first paint; the wheel's
     names and globe, its cells, the link and the peek wait unseen until the page knows the visitor's city and the wheel
     has drawn once (or 600ms, whichever is first): that is t0, and the arrival plays from it. A page opened part way
     down, or under reduced motion, has everything at once. A new wheel (reduced motion changed) shows its names at once. */
  useEffect(() => {
    if (!introOn || introRan.current || off === null) return;
    const timers: number[] = [];
    const go = () => {
      if (introRan.current) return; introRan.current = true;
      /* a slow start: past 1.5s the hold has shown the link, the cells and the peek by itself (fold.css), so they stay */
      const skip = rm || window.scrollY > 8 || performance.now() > 1500;
      /* back: the page was reached with the browser's Back or Forward (arrive.ts) */
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
  /* flap: the mono line under the words and the link's date settle on flaps, the line from the start, the date with the link */
  const wordsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (cfg.arrival !== 'flap' || !line) return;
    const el = wordsRef.current?.querySelector<HTMLElement>('.pf-words-2'); if (!el) return;
    return flapInto(el, el.textContent ?? '', { ...flap, flaps: Math.max(4, flap.flaps) }, ' '.repeat((el.textContent ?? '').length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.arrival, line]);
  useEffect(() => {
    if (intro !== 'in' || played !== 'flap') return;
    const el = document.querySelector<HTMLElement>('.pf .wh-cta-text > span:last-child'); if (!el) return;
    const text = el.textContent ?? '';
    let stop = () => {};
    const t = window.setTimeout(() => { stop = flapInto(el, text, { ...flap, flaps: Math.max(4, flap.flaps) }, ' '.repeat(text.length)); }, cfg.linkAt);
    return () => { window.clearTimeout(t); stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intro, played]);

  /* the small globes (the closing line's lens, and the header's when the glass is not fixed) on the screen kit's one
     canvas; with no WebGL they are flat discs */
  useEffect(() => (noGl ? undefined : mountGlobes(document)), [noGl]);
  /* with the text globe every small globe is its globe of dots (the link's, the header's, the closing line's) */
  const dots = wheel.globe === 'ascii';
  useEffect(() => (dots ? mountDotGlobes(document, wheel) : undefined), [dots, wheel]);

  /* the page's ground, under an overscroll too: in the server's HTML (PaperStyle), so the first paint is already it */

  /* arrivals */
  useConverge(main, line && cfg.arrive === 'tube' && cfg.convMs > 0, ord);
  /* the bloom on the prize, once, when the amount is well in view */
  useEffect(() => {
    const el = main.current?.querySelector<HTMLElement>('.pf-prize'); if (!el || !line || cfg.arrive !== 'tube' || cfg.bloom <= 0 || cfg.bloomMs <= 0) return;
    return once(el.querySelector('.ex') ?? el, 0.5, () => el.setAttribute('data-bloom', ''));
  }, [line, cfg.arrive, cfg.bloom, cfg.bloomMs, ord]);
  const boardRef = useRef<HTMLElement>(null);
  /* the rows a step apart, the whole write never longer than rowTotal however many cities there are */
  const rowStep = cfg.rowTotal > 0 ? Math.min(cfg.rowStep, cfg.rowTotal / Math.max(1, cities.length - 1)) : cfg.rowStep;
  useWrite(boardRef, line && cfg.arrive === 'tube' ? rowStep : 0, 0.15, line);

  /* a link to a part (#how, the footer's own) lands on it; the address then goes back to the page's own, so
     a reload, or the address the browser remembers, opens at the top and not part way down */
  useEffect(() => {
    /* a reload does not bring back the place the visitor had scrolled to: the page always opens at its first screen */
    const prev = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    const clean = () => { if (window.location.hash) history.replaceState(history.state, '', window.location.pathname + window.location.search); };
    const id = window.location.hash.slice(1), el = id ? document.getElementById(id) : null;
    if (el) window.requestAnimationFrame(() => { el.scrollIntoView({ block: 'start' }); clean(); });
    else { window.scrollTo(0, 0); clean(); }
    window.addEventListener('hashchange', clean);
    return () => { window.removeEventListener('hashchange', clean); history.scrollRestoration = prev; };
  }, []);
  const jump = useCallback((id: string, e: MouseEvent) => {
    e.preventDefault();
    const byKey = e.detail === 0;
    if (id === 'top') { jumpTop(line ? cfg.jump : 'cut', { min: cfg.scrollMin, max: cfg.scrollMax, ease: cfg.scrollEase, byKey }); history.replaceState(null, '', location.pathname + location.search); return; }
    /* a jump lands on a finished section: its rows and its heading are simply there */
    const part = document.getElementById(id)?.closest('.pf-part') ?? document.getElementById(id);
    part?.querySelectorAll('[data-pf-wait]').forEach((n) => n.removeAttribute('data-pf-wait'));
    /* the headings the roll passes are settled too */
    document.querySelectorAll('.pf [data-pf-conv]').forEach((n) => n.removeAttribute('data-pf-conv'));
    /* the lit cell renders between frames: the first frame of the scroll is not held for it */
    startTransition(() => setLit(id));
    /* the lit cell holds on the target while the page passes the parts between */
    const ms = jumpTo(id, line ? cfg.jump : 'cut', { ms: cfg.rollMs, bar: cfg.rollBar, ease: tokEase('--ease-out', 'cubic-bezier(0.23, 1, 0.32, 1)'), byKey, scroller: main.current, min: cfg.scrollMin, max: cfg.scrollMax, glide: cfg.scrollEase });
    litHold.current = performance.now() + ms + 100;
  }, [line, cfg.jump, cfg.rollMs, cfg.rollBar, cfg.scrollMin, cfg.scrollMax, cfg.scrollEase]);

  const n = cities.length, g = PRIZES.global.what;
  const order: string[] = ord === 'prize-first' ? ['prizes', 'how', 'cities', 'ready'] : ord === 'how-first' ? ['how', 'prizes', 'cities', 'ready'] : ['cities', 'how', 'prizes', 'ready'];
  const LABEL: Record<string, string> = { cities: 'Cities', how: 'How it works', prizes: 'Prizes', ready: 'Get ready' };
  const parts: Part[] = hero ? [] : order.map((id) => ({ id, label: LABEL[id] }));
  const barCells = useMemo(() => {
    const c: [string, string][] = [['Date', ours.date], ['Cities', count(n) + ', east to west'], ['Build', ours.buildMin + ' minutes']];
    if (ord !== 'prize-first' && g) c.push(['Top prize', cap(g)]);
    return c;
  }, [ours.date, ours.buildMin, n, ord, g]);
  const flap = useMemo(() => ({ flapMs: cfg.flapMs, flaps: line && cfg.arrive === 'tube' ? cfg.flaps : 0, stagger: cfg.flapStagger }), [cfg.flapMs, cfg.flaps, cfg.flapStagger, cfg.arrive, line]);
  const lede = `${count(n)} cities, one day: ${ours.date}. Each city starts at its own local time and builds for ${ours.buildMin} minutes. Votes are shown from minute ${EVENT.showAt ?? 60}.`;
  const late = ord === 'prize-first';
  /* each row shows its own start, so the lede only says what picking does */
  const cityLede = 'Pick your city and every Register button switches to it.';

  /* the footer's links to the page's own parts (Prizes, How it works) take the header's jump, so going back
     up from the end moves the same way as the header's cells; a modified click keeps the browser's own way */
  const footJump = useCallback((e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element).closest('a'), h = a?.getAttribute('href');
    if (!h || !h.startsWith('#') || !document.getElementById(h.slice(1))) return;
    jump(h.slice(1), e);
  }, [jump]);
  /* the footer: the end board, built from the day pages' data as it stands before the day */
  const P = useMemo(() => clampParts(partsSaved as Partial<PartsCfg>), []);
  const day = useMemo(() => dayOf(0), []), minute = realMinute(nowMs), W = useMemo(() => homeAt(day, minute), [day, minute]);
  /* the ending: the world opened flat, unless the saved ending is today's end board */
  const end = useMemo(() => clampEnd(ending ?? (endSaved as Partial<EndCfg>)), [ending]), foot = useMemo(() => clampFoot(footSaved as Partial<FootCfg>), []);
  const howCities = useMemo(() => reg.map((c) => ({ id: c.id, code: c.code ?? CODE[c.id] ?? c.name.slice(0, 3).toUpperCase(), name: c.name })), [reg]);
  const endCities: EndCity[] = useMemo(() => reg.map((c) => ({ id: c.id, name: c.name, code: c.code ?? CODE[c.id] ?? c.name.slice(0, 3).toUpperCase(), lat: c.lat, lon: c.lon, opens: c.opens, href: c.href, action: c.action, press: 'press' in c ? c.press : undefined })), [reg]);
  /* the white dot belongs to the footer; with the new ending in its place the page keeps it */

  const section = (id: string): ReactNode => {
    switch (id) {
      case 'prizes': return line && cfg.prizes === 'type'
        ? <FoldPrizeType key={id} cities={n} finalists={n * EVENT.finalists} auto={cfg.arrive === 'tube'} ms={cfg.typeMs} step={cfg.typeStep} />
        : line && cfg.prizes === 'podium'
        ? <FoldPodium key={id} city={city.name} auto={cfg.arrive === 'tube'} step={cfg.podiumStep} />
        : <div key={id} className="pf-part pf-prize" data-part={id}><PrizeBlock id="prizes" text={dots ? wheel : undefined} arrive={line && cfg.arrive === 'tube'} /></div>;
      case 'how': return <FoldHow key={id} cfg={cfg} cities={howCities} mine={cur} finalists={cities.length * EVENT.finalists} buildMin={ours.buildMin} date={ours.date} />;
      case 'cities': return (
        <section key={id} ref={boardRef} id="cities" className="pf-part pf-cities" data-part={id} aria-labelledby="cities-h">
          <h2 id="cities-h" className="pf-h">{count(n)} cities, one day</h2>
          <p className="pf-lede">{cityLede}</p>
          <FoldBoard cities={board} cur={cur} nearest={nearest} pick={choose} mode={line ? cfg.cities : 'board'} beltSpan={cfg.beltSpan} beltLead={cfg.beltLead} beltMs={cfg.beltMs} dot={cfg.dotSize}
            mine={mine} onMine={forms ? () => forms.account() : undefined} />
        </section>
      );
      case 'ready': return line && cfg.ready === 'short' ? <FoldShort key={id} city={city.name} cityId={city.id} auto={cfg.arrive === 'tube'} step={cfg.dryStep} more={cfg.readyMore} signin={cfg.signin === 'on'} /> : line && cfg.ready === 'list' ? <FoldList key={id} city={city.name} cityId={city.id} auto={cfg.arrive === 'tube'} step={cfg.dryStep} /> : (
        <div key={id} id="ready" className="pf-part" data-part={id}>
          {line ? <FoldReady city={city.name} cityId={city.id} mode={cfg.ready === 'list' || cfg.ready === 'short' ? 'steps' : cfg.ready} auto={!late && cfg.arrive === 'tube'} step={cfg.dryStep} hold={cfg.dryHold} onSignIn={signIn} /> : <GetReady city={city.name} cityId={city.id} id="ready" onSignIn={signIn} />}
        </div>
      );
    }
    return null;
  };

  /* the column layout carries its own words over the cells (the wheel places them), in place of the lede */
  const column = wheel.layout === 'column';
  /* the day's weekday, from the event's date */
  const WEEKDAY = new Date(EPOCH).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
  const rsvp = LUMA_LIVE && ours.regOpen ? 'RSVP now open' : 'RSVP opens soon';
  const dateLine = heroCfg.weekday ? `${WEEKDAY} ${ours.date}` : ours.date;
  /* the line under the headline (saved/hero.config.json `sub`): what the day is, for a visitor who knows nothing yet */
  const sub = heroCfg.sub === 'facts' ? `${n} cities · one day · in person` : heroCfg.sub === 'reach' ? `In person, in ${n} cities, each at its own local time` : null;
  const head = <><h1><span className="sr-only">{EVENT.name}, {ours.date}: </span>{ours.buildMin}min Build Challenge<span className="sr-only">{sub ? '' : `, in ${n} cities`}</span></h1>{sub ? <p className="wh-lead-sub">{sub}</p> : null}<p className="wh-lead-muted">Hosted by <SupabaseLockup className="wh-supabase" /></p></>;
  const lead = column ? (heroCfg.words === 'tight'
    ? <div>{head}<p className="wh-lead-date">{dateLine}</p>{heroCfg.rsvp ? <p>{rsvp}</p> : null}</div>
    : <><div>{head}</div><div><p>{dateLine}</p>{heroCfg.rsvp ? <p>{rsvp}</p> : null}</div></>
  ) : undefined;
  const words = line && !column && cfg.words === 'lede' ? (
    <div ref={wordsRef} className="pf-words">
      <p className="pf-words-1"><span data-t={`Build for ${ours.buildMin} minutes.`}>Build for {ours.buildMin} minutes.</span> <span data-t={`${count(n)} cities, one day.`}>{count(n)} cities, one day.</span></p>
      <p className="pf-words-2">{LUMA_LIVE && ours.regOpen ? 'Registration is open.' : 'Registration opens soon.'}</p>
    </div>
  ) : null;

  return (
    <div className="pf" data-page={hero ? 'hero' : undefined} data-intro={introOn ? intro : undefined} data-arrival={introOn ? played : undefined} data-back={cfg.back} data-dir={cfg.dir} data-glass={fixed ? 'fixed' : 'today'} data-dock={dockMode} data-arrive={cfg.arrive} data-small={dots ? 'dots' : 'glass'} style={{ ...wheelVars(wheel), ...foldVars(cfg) } as CSSProperties}>
      <PaperStyle paper={wheel.paper} />
      {introOn && played === 'scan' ? <div className="pf-scan" aria-hidden="true" /> : null}
      <DayScreen />
      <div ref={hdr} className="pf-hdr-wrap">
        <FoldHeader mark={wheel.mark} on={line && on} paper={line && (paper || on)} parts={parts} lit={lit} lens={lens} mirror={mirror} jump={jump} flap={flap} plainTop={!line} topLink={!line || cfg.topLink === 'how'}
          reg={{ href: lumaHref(city.id), city: city.name, waiting: city.status === 'full' }}
          globe={!fixed && !dots ? { lat: city.lat, lon: city.lon } : null} dot={dots ? { lat: city.lat, lon: city.lon } : null} acct={acct} />
      </div>
      <Wheel key={`${fixed}-${rm}`} cities={reg} cfg={wcfg} noGl={noGl} mark={wheel.mark} engineRef={eng} start={start} date={ours.date} caption={CAPTION} onCity={onCity} lead={lead} hero={heroCfg}
        flow={line ? flow : { ...flow, fixed: false, globe: 'leaves' }}>
        {words}
        <div ref={topSentinel} className="pf-sentinel" style={{ top: 8 }} aria-hidden="true" />
        <div ref={sentinel} className="pf-sentinel" style={{ top: `calc(${cfg.hdrAt * 100}% )` }} aria-hidden="true" />
      </Wheel>
      {hero ? null : <>
      <main ref={main} className="pf-main" id="day">
        {line && cfg.bar === 'cells' ? <FoldBar cells={barCells} flap={flap} dot={cfg.dotSize} live={cfg.arrive === 'tube'} /> : null}
        {line ? null : <p className="pf-lede pf-plain-lede">{lede}</p>}
        {order.map(section)}
      </main>
      <div className="pf-foot" data-part="" onClick={footJump}>
        {end.end === 'board'
          ? <DayFooter W={W} day={day} href={(id) => '/city/' + id} sound={P.sound === 'steps'} city={city.id} cfg={foot} minute={minute}
            sections={{ how: '#how', prizes: '#prizes' }} style={partsVars(P) as CSSProperties} face={P.face} noCities placed={mine >= 0 && forms ? () => forms.account() : undefined} />
          : <Ending cfg={end} wheel={wheel} cities={endCities} start={cur} last="" date={ours.date} sound={P.sound === 'steps'}
            links={{ how: '#how', prizes: '#prizes' }} style={partsVars(P) as CSSProperties} face={P.face} markMode={wheel.mark} onPick={choose} />}
      </div>
      </>}
      <Unroll names={cities.map((c) => c.name)} cfg={wheel} eng={eng} board={boardRef} from={cfg.unrollFrom} spread={cfg.unrollSpread} on={unroll} gone={gone} />
      {children}
    </div>
  );
}

/* the page's ground on <html> and <body> from the server's HTML, before any script: the first paint is the final ground */
function PaperStyle({ paper: p }: { paper: number }) {
  return <style>{`:root:has(.pf){--pf-paper:rgb(${p} ${p + 1} ${p + 1})}`}</style>;
}
