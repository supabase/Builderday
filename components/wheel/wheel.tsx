'use client';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { MONO, PHONE_WHEEL, SANS, fitWheel, type WheelCfg, type WheelMark } from './config';
import { createWheel, type WheelCity, type WheelEngine, type WheelFlow } from './engine';
import { mountDotGlobes } from './dot-globes';
import { HackMark } from './mark';
import familySaved from '@/saved/family.config.json';
import { clampFamily, showPeople } from '@/lib/family';
const FAMILY = clampFamily(familySaved);
import { BuilderLogo } from './builder-logo';
import { EVENT } from '@/lib/day-data';
import { SupabaseMark } from '@/components/shared/supabase-mark';
import type { WheelStatus } from './click';
import heroSaved from '@/saved/hero.config.json';
import { clampHero, hatchOf, type HeroCfg } from './hero-config';
import '@/components/day/ending.css';
import './wheel.css';
import { at, away, newTab } from '@/lib/routes';

/* The city wheel as a page: the canvas, the mark, the link with its small globe, and the facts of the active city as
   a row of cells before its name. The screen lines are drawn over all of it, with holes for the two globes.
   A screen reader gets the cities as a table, and hears the city once the wheel stops on it. */

export type WheelFact = WheelCity & { id: string; code?: string; session: string; count: string; href: string; action: string; soon?: string;
  /* people as a number: the count cell shows only from the family's threshold up (an empty room reads as a dead one) */
  people?: number;
  /* Luma's places left: the ticket's stub prints it while the city is filling up */
  left?: number;
  /* a page's own press in place of the link (the preview: the person's own city opens their account) */
  press?: () => void };
/* hack: the mark alone; both: the Supabase mark beside it; name: the mark with the event's name written beside it;
   builder: the pixel globe from the Builder Day logo, with the name in the page's own face */
export type MarkMode = WheelMark;

/* the mark and the name, as the mode says: the wheel's own top line and the preview's header both draw it */
export function MarkFace({ mark, id }: { mark: MarkMode; id?: string }) {
  if (mark === 'builder') return <><BuilderLogo className="wh-builder" /><span className="wh-name">{EVENT.short}</span></>;
  return <>{mark === 'both' ? <SupabaseMark /> : null}<HackMark id={id} label={mark === 'both' ? EVENT.name : mark === 'name' ? '' : EVENT.short} />{mark === 'name' ? <span className="wh-name">{EVENT.name}</span> : null}</>;
}
export const STATUS_LABEL: Record<WheelStatus, string> = { open: 'Open', nearing: 'Filling up', full: 'Waiting list', sold: 'Sold out', soon: 'Opens soon' };

/* each state has its words and its own shape, a ring that fills up, so it does not read by colour alone. The fill is a
   pie (a stroke as wide as the circle), so one state's shape morphs into the next (wheel.css) */
export function StatusIcon({ status }: { status: WheelStatus }) {
  return (
    <svg viewBox="0 0 12 12" className="wh-state-icon" data-status={status} aria-hidden="true">
      <circle className="wh-state-ring" cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" pathLength="24" />
      <circle className="wh-state-fill" cx="6" cy="6" r="2.5" fill="none" stroke="currentColor" strokeWidth="5" pathLength="100" transform="rotate(-90 6 6)" />
    </svg>
  );
}

/* the hero as saved */
export const HERO = clampHero(heroSaved as Partial<HeroCfg>);

/* the box's words: the verb follows the state, and they always end with the city's name, so the name can be the wheel's.
   The verbs are about one length, and the box keeps a slot as wide as the longest, so a change of state never moves
   the name (the stub already says the state in full) */
const VERBS = ['Register for', 'Waitlist for', 'Sold out in', 'Coming to'];
export function regWords(status: WheelStatus, name: string) {
  return `${status === 'sold' ? VERBS[2] : status === 'full' ? VERBS[1] : status === 'soon' ? VERBS[3] : VERBS[0]} ${name}`;
}

/* the letters that do not move while the rest roll. A letter stays when both words share it at the start. When the
   words have one length, every matching letter stays, because the mono face keeps each letter in its place */
function stillAt(a: string, b: string) {
  let k = 0; while (k < a.length && a[k] === b[k]) k++;
  return [...a].map((ch, i) => i < k || (a.length === b.length && ch === b[i]));
}
/* a word as letters. The letters that move roll one after another, a short delay apart (wheel.css) */
function Letters({ text, other }: { text: string; other: string }) {
  const still = stillAt(text, other);
  let next = 0;
  return <span className="wh-letters">{[...text].map((ch, i) => <span key={`${i}-${ch}`} className="wh-ch" data-still={still[i] ? '' : undefined} style={still[i] ? undefined : { '--i': next++ } as CSSProperties}>{ch}</span>)}</span>;
}

/* The box's words: the verb, set left against the globe, then the city's name. An unseen sizer under them keeps the
   box's width: the longest verb (the mark that the engine measures, engine.ts) and, with fixed width, the longest name.
   So a change of city or of state does not change the box's width or move the name line */
function Words({ verb, name, names, fixed }: { verb: string; name: string; names: string[]; fixed: boolean }) {
  const verbs = VERBS.includes(verb) ? VERBS : [...VERBS, verb];
  return (
    <>
      <span>{verb + ' '}<span className="wh-reg-city">{name}</span></span>
      <span className="wh-reg-sizer" aria-hidden="true">
        <span className="wh-reg-mark">{verbs.map((v) => <span key={v}>{v + ' '}</span>)}</span>
        {fixed ? <span className="wh-reg-names">{names.map((x) => <span key={x}>{x}</span>)}</span> : null}
      </span>
    </>
  );
}

/* The Luma link as the ending's register box (ending.css), with the city's small globe of dots. When its words end
   with the city's name, the name is the wheel's own: the engine sets the box so its name lies where the wheel draws the
   active name (data-lands); with the fade hand-over (data-hand) it hands the name over from the wheel at rest.
   In hug width the paper ends just after the name. A new name never resizes anything by the frame: the layout takes
   the wider of the two widths at once, and the paper's right edge glides from the old end to the new one by a clip
   (paint only), on the name's own clock; then the layout settles on the new width under the clip. A change mid-glide
   starts from where the edge is. Reduced motion, or a docked row (always full width): it simply changes. */
function Pill({ ref, href, press, text, name, names, dot, hero, hatch, lands: landsOn }: { ref: RefObject<(HTMLAnchorElement & HTMLButtonElement) | null>; href: string; press?: () => void; text: string; name: string; names: string[]; dot: { lat: number; lon: number }; hero: HeroCfg; hatch?: string; lands?: boolean }) {
  const lands = !!landsOn && text.endsWith(name), fixed = hero.width === 'fixed';
  /* the paper's visible width as last settled, and the glide under way */
  const vis = useRef(0), glide = useRef<Animation | null>(null);
  /* the paper: the whole ticket when there is one, else the box */
  const paper = (a: HTMLElement) => (a.closest('.wh-ticket') as HTMLElement | null) ?? a;
  /* keep the settled width when the size changes for any other reason (a resize, the fonts arriving) */
  useEffect(() => {
    const a = ref.current; if (!a || fixed) return;
    const p = paper(a), ro = new ResizeObserver(() => { if (!glide.current) vis.current = p.offsetWidth; });
    ro.observe(p); return () => ro.disconnect();
  }, [ref, fixed]);
  useLayoutEffect(() => {
    const a = ref.current; if (!a || fixed) return;
    const p = paper(a);
    /* where the edge is now: mid-glide, read off the running clip; else the settled width */
    let from = vis.current;
    if (glide.current) {
      const m = /calc\(100% - ([\d.]+)px\)/.exec(getComputedStyle(p).clipPath);
      if (m) from = parseFloat(m[1]);
      glide.current.cancel(); glide.current = null;
    }
    a.style.minWidth = '';
    const to = p.offsetWidth; vis.current = to;
    if (!from || Math.abs(from - to) < 1 || !hero.widthMs || p.closest('.wh-pin')?.hasAttribute('data-dock') || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    /* the layout holds the wider width while the edge travels, so the old name has room to leave */
    if (from > to) a.style.minWidth = a.offsetWidth + (from - to) + 'px';
    const edge = (w: number) => `inset(-4px calc(100% - ${w}px) -4px -4px)`;
    const ease = getComputedStyle(document.documentElement).getPropertyValue('--ease-out').trim() || 'cubic-bezier(.23, 1, .32, 1)';
    const run = p.animate([{ clipPath: edge(from) }, { clipPath: edge(to) }], { duration: hero.widthMs, easing: ease });
    glide.current = run;
    run.onfinish = () => { if (glide.current !== run) return; glide.current = null; a.style.minWidth = ''; run.cancel(); vis.current = p.offsetWidth; };
  }, [ref, text, fixed, hero.widthMs]);
  const words = (
    <>
      {hatch ? <span className="wh-hatch" aria-hidden="true"><span>{hatch}</span></span> : null}
      <span className="en-lens" data-dot="" data-lat={dot.lat} data-lon={dot.lon} aria-hidden="true" />
      <span className={lands ? 'en-reg-t wh-reg-words' : 'en-reg-t'}>{lands ? <Words verb={text.slice(0, -name.length).trimEnd()} name={name} names={names} fixed={fixed} /> : text}</span>
    </>
  );
  const cls = 'en-reg wh-reg', data = { 'data-lands': lands ? '' : undefined, 'data-hand': hero.hand };
  return press
    ? <button ref={ref} type="button" className={cls} {...data} aria-haspopup="dialog" aria-label={text} onClick={press}>{words}</button>
    : <a ref={ref} className={cls} {...data} href={at(href)} aria-label={text + newTab(href)} {...away(href)}>{words}</a>;
}

/* the hero's knobs as the page's own variables and switches */
export function heroVars(h: HeroCfg): CSSProperties {
  /* the sizes are shares of the name size (--wh-f, which the engine sets from the wheel and the room); min and pull are
     read by the engine */
  return { '--hero-title-k': h.titleK, '--hero-body-k': h.bodyK, '--hero-cell-k': h.cellK, '--hero-stub-k': h.stubK, '--hero-gap-k': h.gapK, '--hero-lift-k': h.liftK,
    '--hero-min': h.min, '--hero-grow': h.grow, '--hero-tall': h.tall, '--hero-perf': h.perf + 'px', '--hero-stub-phone': h.stubPhone + 'px', '--hero-name-phone': h.namePhone + 'px', '--hero-notch': h.notch + 'px', '--hero-paper': h.paper } as CSSProperties;
}

/* A cell as a block that turns on its long axis when `k` changes, like a drum of cards: the face that was there rolls
   away and the next comes round from below when the wheel turns forward, from above when it turns back. A turn is never
   cut short: if the city changes again mid-turn it finishes, then makes one quicker turn to the latest city. */
type Face = { k: string; node: ReactNode; status?: WheelStatus };
function Prism({ k, dir, status, width, children }: { k: string; dir: number; status?: WheelStatus; width?: string; children: ReactNode }) {
  const [shown, setShown] = useState<Face>({ k, node: children, status });
  const [turn, setTurn] = useState<{ old: Face; dir: number; quick: boolean } | null>(null);
  if (shown.k !== k && !turn) { setTurn({ old: shown, dir, quick: false }); setShown({ k, node: children, status }); }
  else if (shown.k === k && (shown.node !== children || shown.status !== status)) setShown({ k, node: children, status });
  /* words (the number, the time) roll letter by letter. A face with an icon rolls whole */
  const words = turn && typeof turn.old.node === 'string' && typeof shown.node === 'string' ? { old: turn.old.node, now: shown.node } : null;
  /* the turn holds until its last letter lands */
  const moving = (x: string, y: string) => stillAt(x, y).filter((s) => !s).length;
  const rollSpan = words ? { '--n': Math.max(moving(words.old, words.now), moving(words.now, words.old)) } as CSSProperties : undefined;
  const face = (f: Face, cls: string, text?: ReactNode) => <span className={'wh-face ' + cls} data-status={f.status} style={width ? { width } : undefined}>{text ?? f.node}</span>;
  /* the city moved on during the turn: the quick turn starts in the same render, with no still frame between */
  const end = (e: React.AnimationEvent) => {
    if (e.target !== e.currentTarget) return;
    if (shown.k !== k) { setTurn({ old: shown, dir, quick: true }); setShown({ k, node: children, status }); } else setTurn(null);
  };
  return (
    <span className="wh-prism" data-dir={(turn?.dir ?? dir) > 0 ? 'up' : 'down'}>
      <span key={shown.k} className={'wh-drum' + (turn ? ' is-turning' : '') + (turn?.quick ? ' is-quick' : '')} data-letters={words ? '' : undefined} style={rollSpan} onAnimationEnd={end}>
        {turn ? face(turn.old, 'is-old', words ? <Letters text={words.old} other={words.now} /> : undefined) : null}
        {face(shown, 'is-new', words ? <Letters text={words.now} other={words.old} /> : undefined)}
      </span>
    </span>
  );
}

export function wheelVars(c: WheelCfg): CSSProperties {
  return {
    '--wh-paper': `rgb(${c.paper} ${c.paper + 1} ${c.paper + 1})`, '--wh-line-a': c.lineAlpha, '--wh-line-p': c.linePeriod + 'px',
    /* the words in the page are Geist, as everywhere else (the family's sans); the canvas names keep the study's face */
    '--wh-sans': FAMILY.sans === 'geist' ? SANS.geist : SANS[c.font], '--wh-mono': FAMILY.sans === 'geist' ? MONO.geist : MONO[c.font], '--wh-vig': c.vignette,
  } as CSSProperties;
}

/* flow: the wheel as the first part of a page that scrolls (off unless given; see WheelFlow in engine.ts). The page
   draws the mark (its header) and the table of cities (its board), so the wheel leaves both out; the globe is a
   slider a keyboard can turn. The options are read every frame, so a page may change them in place. Changing
   `fixed` needs a new wheel (give it a new key). */
type WheelProps = {
  cities: WheelFact[]; cfg: WheelCfg; start?: number; noGl?: boolean; cells?: boolean; mark?: MarkMode; date: string; caption: string; foot?: ReactNode;
  /* the page's words over the cells, in the column layout, and how that side is set (saved/hero.config.json by default) */
  lead?: ReactNode; hero?: HeroCfg;
  engineRef?: RefObject<WheelEngine | null>; onCity?: (i: number) => void; children?: ReactNode; className?: string; flow?: WheelFlow;
};
/* the engine places the cells element it was made with, and each layout has its own: a new layout is a new wheel */
export function Wheel(props: WheelProps) { return <OneWheel key={props.cfg.layout} {...props} />; }

function OneWheel({ cities, cfg, start = 0, noGl = false, cells = true, mark = 'hack', date, caption, engineRef, onCity, foot, lead, hero = HERO, children, className, flow }: WheelProps) {
  const pin = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), cellsEl = useRef<HTMLDListElement & HTMLDivElement>(null);
  const footEl = useRef<HTMLDivElement>(null), grip = useRef<HTMLSpanElement>(null), flowRef = useRef(flow);
  useEffect(() => { if (flowRef.current && flow) Object.assign(flowRef.current, flow); }, [flow]);
  const lens = useRef<HTMLSpanElement>(null), cta = useRef<HTMLAnchorElement & HTMLButtonElement>(null), eng = useRef<WheelEngine | null>(null);
  const [cur, setCur] = useState(start), [said, setSaid] = useState('');
  const onCityRef = useRef(onCity);
  useEffect(() => { onCityRef.current = onCity; }, [onCity]);
  const first = useRef({ cfg, cities, start });

  useEffect(() => {
    if (!pin.current || !canvas.current) return;
    const e = createWheel({ pin: pin.current, canvas: canvas.current, cells: cellsEl.current, foot: footEl.current, grip: grip.current,
      /* read when used: the link and its lens are new elements when the city's press changes (a link or a button) */
      get lens() { return lens.current; }, get cta() { return cta.current; } },
      { ...first.current, cfg: fitWheel(first.current.cfg, window.matchMedia(PHONE_WHEEL).matches), noGl, onCity: (i) => { setCur(i); onCityRef.current?.(i); }, flow: flowRef.current });
    eng.current = e; if (engineRef) engineRef.current = e;
    return () => { e.destroy(); eng.current = null; if (engineRef) engineRef.current = null; };
  }, [noGl, engineRef]);
  /* the phone's own spacing, kept when the window crosses 640 px */
  const [narrow, setNarrow] = useState(false);
  useEffect(() => { const mq = window.matchMedia(PHONE_WHEEL), on = () => setNarrow(mq.matches); on(); mq.addEventListener('change', on); return () => mq.removeEventListener('change', on); }, []);
  useEffect(() => { eng.current?.setCfg(fitWheel(cfg, window.matchMedia(PHONE_WHEEL).matches)); }, [cfg, narrow]);
  /* the text globe's small globe by the link; in a page's flow the page draws every small globe itself */
  const text = cfg.globe === 'ascii', hasFlow = !!flow;
  useEffect(() => (text && !hasFlow && pin.current ? mountDotGlobes(pin.current, cfg) : undefined), [text, hasFlow, cfg]);
  useEffect(() => { eng.current?.setCities(cities); }, [cities]);
  useEffect(() => { eng.current?.jump(start); }, [start]);

  const city = cities[cur] ?? cities[0];
  const column = cfg.layout === 'column';
  /* which way the wheel last turned, the short way round, so the cells turn the same way */
  const [last, setLast] = useState(cur), [dir, setDir] = useState(1);
  if (last !== cur) {
    const n = cities.length; let d = cur - last; if (d > n / 2) d -= n; if (d < -n / 2) d += n;
    setDir(d > 0 ? 1 : -1); setLast(cur);
  }
  /* each cell is as wide as its longest words in any city, so the column keeps one width */
  /* the time as the hero says: with its zone (UTC-5) or "local" */
  const timeOf = (c: WheelFact) => hero.zone === 'local' ? c.session.replace(/ UTC.*$/, ' local') : c.session;
  const names = cities.map((c) => c.name);
  const widest = (f: (c: WheelFact) => string, icon = false) => `calc(${cities.reduce((a, c) => Math.max(a, f(c).length), 0)}ch + ${icon ? 72 : 46}px)`;
  const dot = text ? { 'data-dot': '', 'data-lat': city.lat, 'data-lon': city.lon } : {};
  /* the cells' and the link's words changed: measure them again before the next frame */
  useLayoutEffect(() => { eng.current?.measure(); }, [cur, cities, cells, cfg.font, cfg.layout, mark, foot, lead, hero]);
  /* a screen reader hears the city after the wheel comes to rest, not each city on the way */
  useEffect(() => {
    const t = window.setTimeout(() => setSaid([city.name, city.session, city.people == null || showPeople(FAMILY, city.people) ? city.count : '', STATUS_LABEL[city.status]].filter(Boolean).join(', ')), cfg.statusDelay);
    return () => window.clearTimeout(t);
  }, [city, cfg.statusDelay]);

  return (
    <div ref={pin} role="region" aria-label="Choose your city" className={'wh-pin' + (flow ? ' wh-flow' + (flow.fixed ? ' wh-fixed' : '') : '') + (className ? ' ' + className : '')}
      data-hero={column ? hero.mode : undefined} data-hero-words={column ? hero.words : undefined} data-hero-state={column ? hero.state : undefined} data-hero-reach={column ? hero.reach : undefined} data-hero-dock={column ? hero.dock : undefined}
      style={{ ...wheelVars(cfg), ...(column ? heroVars(hero) : {}), ...(flow ? { '--wh-peek': flow.peek + 'px' } : {}) } as CSSProperties}>
      {/* the text globe is a picture of its own: one image, named by the city it is turned to */}
      <canvas key={noGl ? '2d' : 'gl'} ref={canvas} className="wh-canvas" {...(text ? { role: 'img', 'aria-label': `The world drawn in characters, turned to ${city.name}` } : { 'aria-hidden': true })} />
      {flow ? null : <h1 className="wh-wordmark" data-mark={mark}><MarkFace mark={mark} /></h1>}
      {flow ? <span ref={grip} className="wh-grip" role="slider" tabIndex={0} aria-label="City wheel: the left and right arrows turn it" aria-valuemin={1} aria-valuemax={cities.length} aria-valuenow={cur + 1} aria-valuetext={city.name} /> : null}
      {column ? (
        /* the column: the page's words, on the left margin (wheel.css places it). The cells and the Luma box are one row
           apart from it: the engine puts the row on the active name's line, the box's name on the wheel's own. */
        <>
          <div ref={cellsEl} className="wh-col">
            {lead ? <div className="wh-lead" data-sk-skip={hero.screen === 'all' || hero.screen === 'words' ? undefined : ''}>{lead}</div> : null}
            {foot ? <div className="wh-col-foot">{foot}</div> : null}
          </div>
          {(() => {
            const pill = <Pill ref={cta} lands hatch={hero.mode === 'ticket' && hero.reach === 'wheel' ? hatchOf(hero.seed, 'hatch') : undefined} href={city.href} press={city.press} dot={city} name={city.name} names={names} hero={hero} text={city.press ? city.action : regWords(city.status, city.name)} />;
            const status = <><StatusIcon status={city.status} /><span>{STATUS_LABEL[city.status]}</span></>;
            /* the row is paper and ink, not the screen: it takes the screen's lines only when the hero says all */
            const skipRow = hero.screen === 'all' ? undefined : '';
            if (hero.mode === 'ticket') return (
              /* the ticket: the stub (the city's code, its number, its time and state), a perforation, then the body, the
                 Luma link, whose press covers the whole ticket */
              <div className="wh-row wh-reg-at wh-ticket" data-sk-skip={skipRow}>
                {cells ? (
                  <dl className="wh-stub" data-placed="">
                    <div className="sr-only"><dt>City</dt><dd>{city.name}</dd></div>
                    <div className="wh-stub-top"><dt className="sr-only">City code</dt><dd className="wh-stub-code">{city.code || city.name.slice(0, 3).toUpperCase()}</dd>
                      {city.status === 'nearing' && city.left ? <dd className="wh-stub-no"><Prism k={city.id} dir={dir}>{`${city.left} left`}</Prism></dd> : null}</div>
                    <div><dt className="sr-only">Session, local time</dt><dd className="wh-stub-t"><Prism k={city.id} dir={dir}>{timeOf(city)}</Prism></dd>
                      {/* the slim stub on a phone (wheel.css): the hours alone */}
                      <dd className="wh-stub-t-short" aria-hidden="true"><Prism k={city.id} dir={dir}>{city.session.replace(/ UTC.*$/, '')}</Prism></dd></div>
                    <div className="wh-status"><dt className="sr-only">Status</dt><dd><span className="wh-face" data-status={city.status}>{status}</span></dd></div>
                  </dl>
                ) : null}
                {pill}
              </div>
            );
            if (hero.mode === 'spoke') return (
              /* the spoke: the box alone on the line, the facts one line of type over it */
              <div className="wh-row wh-reg-at wh-spoke" data-sk-skip={skipRow}>
                {cells ? (
                  <dl className="wh-facts" data-placed="">
                    <div className="sr-only"><dt>City</dt><dd>{city.name}</dd></div>
                    <div><dt className="sr-only">Session, local time</dt><dd><Prism k={city.id} dir={dir}>{timeOf(city)}</Prism></dd></div>
                    <div className="wh-status"><dt className="sr-only">Status</dt><dd><Prism k={city.id} dir={dir} status={city.status}>{status}</Prism></dd></div>
                  </dl>
                ) : null}
                {pill}
              </div>
            );
            return (
              <div className="wh-row wh-reg-at" data-sk-skip={skipRow}>
                {cells ? (
                  <dl className="wh-cells" data-placed="">
                    <div className="sr-only"><dt>City</dt><dd>{city.name}</dd></div>
                    <div><dt className="sr-only">Session, local time</dt><dd><Prism k={city.id} dir={dir} width={widest(timeOf)}>{timeOf(city)}</Prism></dd></div>
                    <div className="wh-status"><dt className="sr-only">Status</dt><dd><Prism k={city.id} dir={dir} status={city.status} width={widest((c) => STATUS_LABEL[c.status], true)}>{status}</Prism></dd></div>
                  </dl>
                ) : null}
                {pill}
              </div>
            );
          })()}
        </>
      ) : (
        <>
          <div ref={footEl} className="wh-foot">
            {city.press ? (
              /* a press of the page's own (the person's account) is a button; the lens stays one element, so the engine's measure holds */
              <button ref={cta} type="button" className="wh-cta" aria-haspopup="dialog" onClick={city.press}>
                <span ref={lens} className="wh-lens" aria-hidden="true" {...dot} />
                <span className="wh-cta-text"><span className="wh-cta-action">{city.action}</span> <span>{date}</span></span>
              </button>
            ) : (
              <a ref={cta} className="wh-cta" href={at(city.href)} {...away(city.href)}>
                <span ref={lens} className="wh-lens" aria-hidden="true" {...dot} />
                <span className="wh-cta-text"><span className="wh-cta-action">{city.action}</span> <span>{date}</span></span>
                {newTab(city.href) ? <span className="sr-only">{newTab(city.href)}</span> : null}
              </a>
            )}
            {foot}
          </div>
          {cells ? (
            <dl ref={cellsEl} className="wh-cells" data-status={city.status}>
              <div className="sr-only"><dt>City</dt><dd>{city.name}</dd></div>
              <div><dt className="sr-only">Session, local time</dt><dd>{city.session}</dd></div>
              {city.people == null || showPeople(FAMILY, city.people) ? <div><dt className="sr-only">People</dt><dd>{city.count}</dd></div> : null}
              {city.soon ? <div className="wh-soon"><dt className="sr-only">Opens</dt><dd>{city.soon}</dd></div> : null}
              <div className="wh-status"><dt className="sr-only">Status</dt><StatusIcon status={city.status} /><dd>{STATUS_LABEL[city.status]}</dd></div>
            </dl>
          ) : null}
        </>
      )}
      <p className="sr-only" role="status">{said}</p>
      {flow ? null : (
        <table className="sr-only">
          <caption>{caption}</caption>
          <thead><tr><th scope="col">City</th><th scope="col">Session, local time</th><th scope="col">People</th><th scope="col">Status</th></tr></thead>
          <tbody>{cities.map((c) => <tr key={c.id}><th scope="row">{c.name}</th><td>{c.session}</td><td>{c.count}</td><td>{STATUS_LABEL[c.status]}</td></tr>)}</tbody>
        </table>
      )}
      {children}
    </div>
  );
}
